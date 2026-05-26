use anchor_lang::prelude::*;
use crate::math::vamm::MarketTier;

/// Global perpetual engine configuration
#[account]
pub struct PerpEngineConfig {
    pub authority: Pubkey,
    pub usdc_mint: Pubkey,
    pub insurance_fund_vault: Pubkey,
    pub treasury_wallet: Pubkey,
    /// Trading fee in basis points (default: 10 = 0.1%)
    pub taker_fee_bps: u16,
    /// Maker rebate in basis points (default: 2 = 0.02%)
    pub maker_rebate_bps: u16,
    /// Maximum leverage allowed (default: 5)
    pub max_leverage: u8,
    /// Minimum margin ratio to maintain position in basis points (default: 625 = 6.25%)
    pub maintenance_margin_bps: u16,
    /// Minimum initial margin ratio in basis points (default: 2000 = 20%)
    pub initial_margin_bps: u16,
    pub paused: bool,
    pub total_markets: u32,
    pub bump: u8,
}

impl PerpEngineConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 32 + 32 + 2 + 2 + 1 + 2 + 2 + 1 + 4 + 1;
}

/// Per-market state for a vAMM perpetual market
#[account]
pub struct PerpMarket {
    /// Underlying token mint
    pub base_mint: Pubkey,
    /// Market identifier string (e.g. "BONK-PERP")
    pub market_symbol: [u8; 16],
    /// Tier determines virtual liquidity depth
    pub tier: MarketTier,

    // vAMM virtual reserves
    pub base_asset_reserve: u64,
    pub quote_asset_reserve: u64,

    // Open interest (in base units)
    pub long_open_interest: u64,
    pub short_open_interest: u64,

    // Oracle
    /// Pyth oracle price feed for base/USD
    pub oracle: Pubkey,
    /// Last recorded oracle (index) price (scaled 1e6)
    pub last_index_price: u64,
    /// Mark price from vAMM (scaled 1e6)
    pub last_mark_price: u64,
    pub last_oracle_update: i64,

    // Funding
    /// Cumulative long funding (per 1 base unit, scaled 1e12)
    pub cumulative_long_funding: i128,
    /// Cumulative short funding (per 1 base unit, scaled 1e12)
    pub cumulative_short_funding: i128,
    pub last_funding_time: i64,
    /// Current hourly funding rate in bps * 100
    pub hourly_funding_rate: i64,

    // Market stats
    pub volume_24h_usd: u64,
    pub total_volume_usd: u64,
    pub trade_count: u64,
    pub liq_count: u64,

    pub created_at: i64,
    pub active: bool,
    pub bump: u8,
}

impl PerpMarket {
    pub const SPACE: usize = 8
        + 32  // base_mint
        + 16  // market_symbol
        + 1   // tier
        + 8   // base_asset_reserve
        + 8   // quote_asset_reserve
        + 8   // long_oi
        + 8   // short_oi
        + 32  // oracle
        + 8   // last_index_price
        + 8   // last_mark_price
        + 8   // last_oracle_update
        + 16  // cumulative_long_funding
        + 16  // cumulative_short_funding
        + 8   // last_funding_time
        + 8   // hourly_funding_rate
        + 8   // volume_24h
        + 8   // total_volume
        + 8   // trade_count
        + 8   // liq_count
        + 8   // created_at
        + 1   // active
        + 1;  // bump

    /// Funding settlement interval: 1 hour
    pub const FUNDING_INTERVAL_SECS: i64 = 3600;
}

/// Per-trader position in a specific market
#[account]
pub struct Position {
    /// Trader wallet
    pub trader: Pubkey,
    /// Market the position is in
    pub market: Pubkey,
    pub base_mint: Pubkey,

    pub side: PositionSide,

    /// Position size in base units (always positive)
    pub base_amount: u64,
    /// Notional value at entry (USDC, 6 decimals)
    pub notional_usdc: u64,
    /// Initial collateral deposited (USDC, 6 decimals)
    pub collateral_usdc: u64,
    /// Leverage (1-5)
    pub leverage: u8,

    /// Entry price (scaled 1e6)
    pub entry_price: u64,
    /// Liquidation price (scaled 1e6)
    pub liquidation_price: u64,

    /// Cumulative funding rate at position open (for funding PnL computation)
    pub funding_rate_at_open: i128,
    /// Funding payments accumulated (positive = received, negative = paid)
    pub funding_pnl: i64,

    pub opened_at: i64,
    pub bump: u8,
}

impl Position {
    pub const SPACE: usize = 8
        + 32  // trader
        + 32  // market
        + 32  // base_mint
        + 1   // side
        + 8   // base_amount
        + 8   // notional_usdc
        + 8   // collateral_usdc
        + 1   // leverage
        + 8   // entry_price
        + 8   // liquidation_price
        + 16  // funding_rate_at_open
        + 8   // funding_pnl
        + 8   // opened_at
        + 1;  // bump
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum PositionSide {
    Long,
    Short,
}

/// Insurance fund vault state
#[account]
pub struct InsuranceFund {
    pub balance_usdc: u64,
    pub total_inflows: u64,
    pub total_outflows: u64,
    pub bump: u8,
}

impl InsuranceFund {
    pub const SPACE: usize = 8 + 8 + 8 + 8 + 1;
}
