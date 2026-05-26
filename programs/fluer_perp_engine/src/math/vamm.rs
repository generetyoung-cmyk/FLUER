/// FLUER vAMM (Virtual AMM) Mathematics
/// Implements constant product perpetual market: x * y = k
/// Based on Perpetual Protocol v1 design, extended with Drift Protocol improvements
use anchor_lang::prelude::*;

#[error_code]
pub enum VammError {
    #[msg("Arithmetic overflow in vAMM calculation")]
    Overflow,
    #[msg("Division by zero in vAMM")]
    DivisionByZero,
    #[msg("Position size too large — exceeds max OI limit")]
    PositionTooLarge,
    #[msg("Insufficient margin — below minimum margin ratio")]
    InsufficientMargin,
    #[msg("Position below minimum size")]
    PositionTooSmall,
}

/// Market depth tiers for calibrating initial k value
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq)]
pub enum MarketTier {
    /// Tier 1: New/unproven token — $100K virtual depth
    Tier1 = 1,
    /// Tier 2: Graduated token with traction — $500K virtual depth
    Tier2 = 2,
    /// Tier 3: Established token with high volume — $2M virtual depth
    Tier3 = 3,
}

/// Compute base reserves from tier and spot price
/// target: 1% price impact for $1,000 position at launch
/// market_depth_factor in USD (scaled 1e6 for precision)
pub fn compute_initial_reserves(
    spot_price_usd_scaled: u64, // price * 1e6
    tier: MarketTier,
) -> (u64, u64) {
    let depth_usd_scaled: u64 = match tier {
        MarketTier::Tier1 => 100_000 * 1_000_000,   // $100K
        MarketTier::Tier2 => 500_000 * 1_000_000,   // $500K
        MarketTier::Tier3 => 2_000_000 * 1_000_000, // $2M
    };

    // quote_reserve = depth_usd (in USDC base units, 6 decimals)
    // base_reserve = depth_usd / spot_price
    let quote_reserve = depth_usd_scaled; // depth in USDC

    // base_reserve = quote_reserve / price
    // Both scaled 1e6, so base = quote / price_scaled * 1e6
    let base_reserve = if spot_price_usd_scaled > 0 {
        (quote_reserve as u128)
            .checked_mul(1_000_000)
            .unwrap_or(0)
            .checked_div(spot_price_usd_scaled as u128)
            .unwrap_or(0) as u64
    } else {
        0
    };

    (base_reserve, quote_reserve)
}

/// Open a long position — trader provides USDC, gets virtual base
/// Returns (base_amount, entry_price_scaled)
pub fn open_long(
    base_reserve: u64,
    quote_reserve: u64,
    quote_amount: u64, // USDC notional (6 decimals)
) -> Result<(u64, u64)> {
    require!(quote_amount > 0, VammError::PositionTooSmall);

    let k = (base_reserve as u128)
        .checked_mul(quote_reserve as u128)
        .ok_or(VammError::Overflow)?;

    // new_quote = quote + quote_amount
    let new_quote = (quote_reserve as u128)
        .checked_add(quote_amount as u128)
        .ok_or(VammError::Overflow)?;

    // new_base = k / new_quote
    let new_base = k
        .checked_div(new_quote)
        .ok_or(VammError::DivisionByZero)?;

    // base_out = base - new_base
    let base_out = (base_reserve as u128)
        .checked_sub(new_base)
        .ok_or(VammError::Overflow)?;

    require!(base_out > 0, VammError::PositionTooSmall);

    // entry_price = quote_amount / base_out (scaled 1e6)
    let entry_price = (quote_amount as u128)
        .checked_mul(1_000_000)
        .ok_or(VammError::Overflow)?
        .checked_div(base_out)
        .ok_or(VammError::DivisionByZero)? as u64;

    Ok((base_out as u64, entry_price))
}

/// Open a short position — trader sells virtual base, receives USDC
/// Returns (base_amount, entry_price_scaled)
pub fn open_short(
    base_reserve: u64,
    quote_reserve: u64,
    base_amount: u64, // virtual base units
) -> Result<(u64, u64)> {
    require!(base_amount > 0, VammError::PositionTooSmall);

    let k = (base_reserve as u128)
        .checked_mul(quote_reserve as u128)
        .ok_or(VammError::Overflow)?;

    // new_base = base + base_amount
    let new_base = (base_reserve as u128)
        .checked_add(base_amount as u128)
        .ok_or(VammError::Overflow)?;

    // new_quote = k / new_base
    let new_quote = k
        .checked_div(new_base)
        .ok_or(VammError::DivisionByZero)?;

    // quote_out = quote - new_quote
    let quote_out = (quote_reserve as u128)
        .checked_sub(new_quote)
        .ok_or(VammError::Overflow)?;

    require!(quote_out > 0, VammError::PositionTooSmall);

    // entry_price = quote_out / base_amount (scaled 1e6)
    let entry_price = (quote_out as u128)
        .checked_mul(1_000_000)
        .ok_or(VammError::Overflow)?
        .checked_div(base_amount as u128)
        .ok_or(VammError::DivisionByZero)? as u64;

    Ok((quote_out as u64, entry_price))
}

/// Current mark price from reserves (scaled 1e6)
pub fn mark_price(base_reserve: u64, quote_reserve: u64) -> Result<u64> {
    require!(base_reserve > 0, VammError::DivisionByZero);
    let price = (quote_reserve as u128)
        .checked_mul(1_000_000)
        .ok_or(VammError::Overflow)?
        .checked_div(base_reserve as u128)
        .ok_or(VammError::DivisionByZero)? as u64;
    Ok(price)
}

/// Compute PnL for a long position
/// Positive = profit, can be negative
pub fn long_pnl(
    base_amount: u64,
    entry_price_scaled: u64,
    current_price_scaled: u64,
) -> i64 {
    let price_diff = current_price_scaled as i128 - entry_price_scaled as i128;
    // PnL = (current_price - entry_price) * base_amount / 1e6
    let pnl = price_diff
        .checked_mul(base_amount as i128)
        .unwrap_or(0)
        / 1_000_000;
    pnl as i64
}

/// Compute PnL for a short position
pub fn short_pnl(
    base_amount: u64,
    entry_price_scaled: u64,
    current_price_scaled: u64,
) -> i64 {
    let price_diff = entry_price_scaled as i128 - current_price_scaled as i128;
    let pnl = price_diff
        .checked_mul(base_amount as i128)
        .unwrap_or(0)
        / 1_000_000;
    pnl as i64
}

/// Funding rate computation: clamp(mark_price - index_price, -0.3%, +0.3%) / 24h
/// Returns hourly funding rate in basis points * 100 (i.e., 100 = 0.01%)
pub fn compute_funding_rate(
    mark_price_scaled: u64,
    index_price_scaled: u64,
) -> i64 {
    if index_price_scaled == 0 {
        return 0;
    }

    let diff = mark_price_scaled as i128 - index_price_scaled as i128;
    // funding_pct = diff / index_price (as percentage * 10000 = bps)
    let funding_bps_raw = diff
        .checked_mul(10_000)
        .unwrap_or(0)
        / index_price_scaled as i128;

    // Clamp to ±30 bps (0.3%)
    let clamped = funding_bps_raw.clamp(-30, 30);

    // Divide by 24 for hourly rate
    clamped / 24
}

/// Compute liquidation price for a long position
/// Liquidation at: entry_price * (1 - 1/leverage + maintenance_margin_rate)
/// Returns liquidation price scaled 1e6
pub fn long_liquidation_price(
    entry_price_scaled: u64,
    leverage: u8,
    maintenance_margin_bps: u16, // e.g. 625 = 6.25%
) -> u64 {
    // liq_price = entry * (1 - 1/leverage + maintenance_margin_rate)
    // = entry * (leverage - 1 + maintenance_margin) / leverage
    let numerator_bps = (10_000u64)
        .saturating_sub(10_000 / leverage as u64)
        .saturating_add(maintenance_margin_bps as u64);

    (entry_price_scaled as u128)
        .checked_mul(numerator_bps as u128)
        .unwrap_or(0)
        .checked_div(10_000)
        .unwrap_or(0) as u64
}

/// Compute liquidation price for a short position
pub fn short_liquidation_price(
    entry_price_scaled: u64,
    leverage: u8,
    maintenance_margin_bps: u16,
) -> u64 {
    let numerator_bps = (10_000u64)
        .saturating_add(10_000 / leverage as u64)
        .saturating_sub(maintenance_margin_bps as u64);

    (entry_price_scaled as u128)
        .checked_mul(numerator_bps as u128)
        .unwrap_or(0)
        .checked_div(10_000)
        .unwrap_or(0) as u64
}
