use anchor_lang::prelude::*;

/// Global config for prediction markets
#[account]
pub struct PredictionConfig {
    pub authority: Pubkey,
    /// $FLUER mint
    pub fluer_mint: Pubkey,
    /// USDC mint address (mainnet: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v)
    pub usdc_mint: Pubkey,
    /// Treasury wallet (receives protocol fee)
    pub treasury: Pubkey,
    /// Creation fee in $FLUER (default: 50 FLUER = 50_000_000 with 6 decimals)
    pub creation_fee_fluer: u64,
    /// Protocol fee on winning pool in basis points (default: 200 = 2%)
    pub protocol_fee_bps: u16,
    /// Creator royalty in basis points (default: 50 = 0.5%)
    pub creator_royalty_bps: u16,
    /// Minimum bet in USDC (default: 500_000 = $0.50)
    pub min_bet_usdc: u64,
    pub paused: bool,
    pub total_markets_created: u64,
    pub total_volume_usd: u64,
    pub bump: u8,
}

impl PredictionConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 8 + 2 + 2 + 8 + 1 + 8 + 8 + 1;
}

/// Market type — determines resolution oracle
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum MarketType {
    /// Token reaches a price target before expiry
    #[default]
    PriceTarget,
    /// Token reaches a holder count target
    HolderGrowth,
    /// Token 24h volume exceeds threshold
    VolumeThreshold,
    /// Token listed on a major CEX
    ExchangeListing,
    /// Custom — resolved by admin multisig
    Custom,
}

/// Resolution state
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum Resolution {
    #[default]
    Pending,
    Yes,
    No,
    /// Voided (expired without resolution, both sides refunded)
    Void,
}

/// A single prediction market — binary Yes/No outcome
#[account]
pub struct PredictionMarket {
    /// Market creator wallet
    pub creator: Pubkey,
    /// The token this prediction is about
    pub token_mint: Pubkey,
    /// Pyth oracle for price resolution (if PriceTarget type)
    pub oracle: Pubkey,

    /// Market type
    pub market_type: MarketType,

    /// Packed title: max 96 bytes
    pub title: [u8; 96],
    /// Packed description: max 256 bytes
    pub description: [u8; 256],

    /// Resolution condition (interpretation depends on market_type)
    /// For PriceTarget: target price in USD scaled 1e6
    /// For HolderGrowth: target holder count
    /// For VolumeThreshold: target 24h USD volume scaled 1e6
    pub resolution_value: u64,

    /// Unix timestamp of market expiry
    pub resolution_timestamp: i64,

    // AMM pools (constant sum, similar to Augur/Polymarket)
    /// Total USDC bet on YES (6 decimals)
    pub yes_pool: u64,
    /// Total USDC bet on NO (6 decimals)
    pub no_pool: u64,

    /// Total USDC fees collected
    pub total_fees: u64,

    /// Number of unique bettors
    pub bettor_count: u32,

    pub resolution: Resolution,
    pub created_at: i64,
    pub resolved_at: i64,

    pub bump: u8,
}

impl PredictionMarket {
    pub const SPACE: usize = 8
        + 32  // creator
        + 32  // token_mint
        + 32  // oracle
        + 1   // market_type
        + 96  // title
        + 256 // description
        + 8   // resolution_value
        + 8   // resolution_timestamp
        + 8   // yes_pool
        + 8   // no_pool
        + 8   // total_fees
        + 4   // bettor_count
        + 1   // resolution
        + 8   // created_at
        + 8   // resolved_at
        + 1;  // bump

    /// Current YES probability as a percentage (0–100)
    pub fn yes_probability(&self) -> u64 {
        let total = self.yes_pool + self.no_pool;
        if total == 0 {
            50
        } else {
            self.yes_pool * 100 / total
        }
    }

    /// Compute payout multiplier for a winning YES bet (scaled 1e6)
    /// payout = total_pool / yes_pool (minus fees)
    pub fn yes_payout_multiplier(&self, fee_bps: u16, royalty_bps: u16) -> u64 {
        let total = self.yes_pool + self.no_pool;
        if self.yes_pool == 0 {
            return 1_000_000;
        }
        let net_pool = total
            - (total as u128 * fee_bps as u128 / 10_000) as u64
            - (total as u128 * royalty_bps as u128 / 10_000) as u64;
        (net_pool as u128 * 1_000_000 / self.yes_pool as u128) as u64
    }

    /// Compute payout multiplier for a winning NO bet (scaled 1e6)
    pub fn no_payout_multiplier(&self, fee_bps: u16, royalty_bps: u16) -> u64 {
        let total = self.yes_pool + self.no_pool;
        if self.no_pool == 0 {
            return 1_000_000;
        }
        let net_pool = total
            - (total as u128 * fee_bps as u128 / 10_000) as u64
            - (total as u128 * royalty_bps as u128 / 10_000) as u64;
        (net_pool as u128 * 1_000_000 / self.no_pool as u128) as u64
    }
}

/// Per-bettor position in a prediction market
#[account]
pub struct PredictionPosition {
    pub bettor: Pubkey,
    pub market: Pubkey,
    /// YES or NO encoded as bool
    pub is_yes: bool,
    /// USDC amount bet (6 decimals)
    pub amount_usdc: u64,
    /// Shares received (scaled 1e6)
    pub shares: u64,
    pub claimed: bool,
    pub placed_at: i64,
    pub bump: u8,
}

impl PredictionPosition {
    pub const SPACE: usize = 8 + 32 + 32 + 1 + 8 + 8 + 1 + 8 + 1;
}
