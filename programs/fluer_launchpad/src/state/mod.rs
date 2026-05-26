use anchor_lang::prelude::*;

/// Global configuration for the FLUER launchpad — admin-controlled
#[account]
#[derive(Default)]
pub struct LaunchpadConfig {
    /// Admin authority (multisig in production)
    pub authority: Pubkey,
    /// $FLUER token mint address
    pub fluer_mint: Pubkey,
    /// Treasury wallet receiving 50% of creation fees
    pub treasury_wallet: Pubkey,
    /// Pyth oracle for SOL/USD price (mainnet: H6ARHf6YXhGYeQfUzQNGk6rDNnLBQKrenN712K4AQJEG)
    pub sol_usd_oracle: Pubkey,
    /// Creation fee in $FLUER (default: 50_000_000 = 50 FLUER with 6 decimals)
    pub creation_fee_fluer: u64,
    /// Platform trading fee in basis points (default: 100 = 1%)
    pub platform_fee_bps: u16,
    /// Graduation market cap threshold in USD (scaled 1e6, default: 100_000_000_000 = $100K)
    pub graduation_market_cap_usd_scaled: u64,
    /// Graduation volume threshold in USD over 24h (scaled 1e6)
    pub graduation_volume_24h_scaled: u64,
    /// Minimum holder count for graduation (default: 200)
    pub graduation_holders_min: u32,
    /// Minimum liquidity depth in USD for graduation (scaled 1e6, default: $20K)
    pub graduation_liquidity_usd_scaled: u64,
    /// Minimum token age in hours for graduation (default: 12)
    pub graduation_age_min_hours: u16,
    /// Emergency pause flag
    pub paused: bool,
    /// Total tokens created via this launchpad
    pub total_tokens_created: u64,
    /// Total SOL volume across all bonding curves
    pub total_volume_lamports: u64,
    /// Total tokens graduated
    pub total_graduated: u64,
    /// Bump seed for PDA
    pub bump: u8,
}

impl LaunchpadConfig {
    pub const SPACE: usize = 8   // discriminator
        + 32   // authority
        + 32   // fluer_mint
        + 32   // treasury_wallet
        + 32   // sol_usd_oracle
        + 8    // creation_fee_fluer
        + 2    // platform_fee_bps
        + 8    // graduation_market_cap_usd_scaled
        + 8    // graduation_volume_24h_scaled
        + 4    // graduation_holders_min
        + 8    // graduation_liquidity_usd_scaled
        + 2    // graduation_age_min_hours
        + 1    // paused
        + 8    // total_tokens_created
        + 8    // total_volume_lamports
        + 8    // total_graduated
        + 1;   // bump
}

/// Token category for discovery filtering
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum TokenCategory {
    #[default]
    Meme,
    DeFi,
    AI,
    Gaming,
    RWA,
    Social,
    Infrastructure,
    Other,
}

/// Creator tier based on graduated token count
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum CreatorTier {
    #[default]
    Bronze,   // 0-2 graduated
    Silver,   // 3-5 graduated — 1.2x multiplier
    Gold,     // 6-10 graduated — 1.5x multiplier
    Diamond,  // 10+ graduated — 2x multiplier
}

/// Per-token listing state on the bonding curve
#[account]
pub struct TokenListing {
    /// Token mint address (vanity suffix "flur")
    pub mint: Pubkey,
    /// Creator wallet
    pub creator: Pubkey,
    /// Token name — ENFORCED to end with " · FLUER" (suffix included)
    /// Max total length: 32 chars (24 user-defined + 8 for " · FLUER")
    pub name: [u8; 32],
    /// Token symbol — user-defined, max 8 alphanumeric chars
    pub symbol: [u8; 8],
    /// IPFS URI for token metadata (max 128 chars)
    pub metadata_uri: [u8; 128],

    // Bonding curve virtual reserves (constant product formula: v_sol * v_token = k)
    /// Virtual SOL reserves (starts at 30 SOL = 30_000_000_000 lamports)
    pub virtual_sol_reserves: u64,
    /// Virtual token reserves (starts at 1_073_000_191 * 10^6)
    pub virtual_token_reserves: u64,
    /// Actual SOL raised from real buys (determines graduation)
    pub real_sol_reserves: u64,
    /// Total tokens sold to buyers
    pub tokens_sold: u64,

    // Analytics (updated by backend cranks + on-chain events)
    /// Unique holder count (approximated, updated by buy instruction)
    pub holder_count: u32,
    /// 24h USD volume (scaled 1e6, updated by oracle/backend crank)
    pub volume_24h_usd_scaled: u64,
    /// Total all-time USD volume
    pub total_volume_usd_scaled: u64,
    /// Number of buy transactions
    pub buy_count: u64,
    /// Number of sell transactions
    pub sell_count: u64,

    // Timestamps
    /// Unix timestamp of token creation
    pub created_at: i64,
    /// Unix timestamp of graduation (0 if not graduated)
    pub graduated_at: i64,

    // Status
    pub graduated: bool,
    pub category: TokenCategory,

    // Anti-bot: tracks first trade timestamp to enforce snipe protection window
    pub first_trade_at: i64,

    // Creator reward state
    /// Accumulated SOL rewards for creator (30% of trading fees)
    pub creator_rewards_lamports: u64,
    /// SOL rewards already claimed
    pub creator_claimed_lamports: u64,

    pub bump: u8,
}

impl TokenListing {
    pub const SPACE: usize = 8   // discriminator
        + 32   // mint
        + 32   // creator
        + 32   // name
        + 8    // symbol
        + 128  // metadata_uri
        + 8    // virtual_sol_reserves
        + 8    // virtual_token_reserves
        + 8    // real_sol_reserves
        + 8    // tokens_sold
        + 4    // holder_count
        + 8    // volume_24h_usd_scaled
        + 8    // total_volume_usd_scaled
        + 8    // buy_count
        + 8    // sell_count
        + 8    // created_at
        + 8    // graduated_at
        + 1    // graduated
        + 1    // category
        + 8    // first_trade_at
        + 8    // creator_rewards_lamports
        + 8    // creator_claimed_lamports
        + 1;   // bump

    /// Initial virtual SOL reserves: 30 SOL
    pub const INITIAL_VIRTUAL_SOL: u64 = 30_000_000_000; // lamports

    /// Initial virtual token reserves: 1,073,000,191 tokens (same as pump.fun)
    /// With 6 decimals: 1_073_000_191 * 1_000_000
    pub const INITIAL_VIRTUAL_TOKENS: u64 = 1_073_000_191_000_000;

    /// Total token supply: 1 billion with 6 decimals
    pub const TOTAL_SUPPLY: u64 = 1_000_000_000_000_000;

    /// Curve supply: 800M tokens (80% of supply)
    pub const CURVE_SUPPLY: u64 = 800_000_000_000_000;

    /// Graduation threshold: ~85 SOL raised in real reserves
    pub const GRADUATION_SOL_THRESHOLD: u64 = 85_000_000_000; // lamports

    /// Anti-snipe window: 30 seconds
    pub const ANTI_SNIPE_WINDOW_SECS: i64 = 30;

    /// Max purchase per wallet during anti-snipe window: 0.1 SOL
    pub const ANTI_SNIPE_MAX_LAMPORTS: u64 = 100_000_000;

    /// Creator fee share: 30% of trading fees (in basis points)
    pub const CREATOR_FEE_SHARE_BPS: u16 = 3000;

    /// Creator reward vesting period after graduation: 90 days
    pub const CREATOR_VESTING_SECS: i64 = 90 * 24 * 3600;
}

/// Per-creator profile for tracking history and tier
#[account]
#[derive(Default)]
pub struct CreatorProfile {
    pub wallet: Pubkey,
    pub tokens_created: u32,
    pub tokens_graduated: u32,
    /// Pending unclaimed SOL rewards across all tokens
    pub pending_rewards_lamports: u64,
    /// Total claimed SOL rewards lifetime
    pub total_claimed_lamports: u64,
    pub tier: CreatorTier,
    pub created_at: i64,
    pub bump: u8,
}

impl CreatorProfile {
    pub const SPACE: usize = 8   // discriminator
        + 32   // wallet
        + 4    // tokens_created
        + 4    // tokens_graduated
        + 8    // pending_rewards_lamports
        + 8    // total_claimed_lamports
        + 1    // tier
        + 8    // created_at
        + 1;   // bump

    /// Update creator tier based on graduated count
    pub fn update_tier(&mut self) {
        self.tier = match self.tokens_graduated {
            0..=2 => CreatorTier::Bronze,
            3..=5 => CreatorTier::Silver,
            6..=10 => CreatorTier::Gold,
            _ => CreatorTier::Diamond,
        };
    }

    /// Get reward multiplier in basis points (1.0x = 10000)
    pub fn reward_multiplier_bps(&self) -> u64 {
        match self.tier {
            CreatorTier::Bronze => 10_000,
            CreatorTier::Silver => 12_000,  // 1.2x
            CreatorTier::Gold => 15_000,    // 1.5x
            CreatorTier::Diamond => 20_000, // 2.0x
        }
    }
}
