/// FLUER Bonding Curve Mathematics
/// Implements constant product AMM: v_sol * v_token = k
/// Derived from pump.fun's bonding curve with FLUER-specific extensions
use crate::errors::LaunchpadError;
use anchor_lang::prelude::*;

/// Compute tokens out for a given SOL input (BUY operation)
///
/// Formula:
///   new_v_sol   = v_sol + sol_in
///   new_v_token = k / new_v_sol
///   tokens_out  = v_token - new_v_token
///
/// k = v_sol * v_token (constant invariant)
pub fn compute_tokens_out(
    virtual_sol: u64,
    virtual_tokens: u64,
    sol_in: u64,
) -> Result<u64> {
    require!(sol_in > 0, LaunchpadError::InsufficientSolAmount);

    // k = v_sol * v_token — use u128 to prevent overflow
    let k: u128 = (virtual_sol as u128)
        .checked_mul(virtual_tokens as u128)
        .ok_or(LaunchpadError::MathOverflow)?;

    // new_v_sol = v_sol + sol_in
    let new_v_sol: u128 = (virtual_sol as u128)
        .checked_add(sol_in as u128)
        .ok_or(LaunchpadError::MathOverflow)?;

    require!(new_v_sol > 0, LaunchpadError::DivisionByZero);

    // new_v_token = k / new_v_sol
    let new_v_token: u128 = k
        .checked_div(new_v_sol)
        .ok_or(LaunchpadError::DivisionByZero)?;

    // tokens_out = v_token - new_v_token
    let tokens_out = (virtual_tokens as u128)
        .checked_sub(new_v_token)
        .ok_or(LaunchpadError::MathUnderflow)?;

    require!(tokens_out > 0, LaunchpadError::ZeroTokensOut);

    Ok(tokens_out as u64)
}

/// Compute SOL out for a given token input (SELL operation)
///
/// Formula:
///   new_v_token = v_token + tokens_in
///   new_v_sol   = k / new_v_token
///   sol_out     = v_sol - new_v_sol
pub fn compute_sol_out(
    virtual_sol: u64,
    virtual_tokens: u64,
    tokens_in: u64,
) -> Result<u64> {
    require!(tokens_in > 0, LaunchpadError::InsufficientSolAmount);

    let k: u128 = (virtual_sol as u128)
        .checked_mul(virtual_tokens as u128)
        .ok_or(LaunchpadError::MathOverflow)?;

    let new_v_token: u128 = (virtual_tokens as u128)
        .checked_add(tokens_in as u128)
        .ok_or(LaunchpadError::MathOverflow)?;

    require!(new_v_token > 0, LaunchpadError::DivisionByZero);

    let new_v_sol: u128 = k
        .checked_div(new_v_token)
        .ok_or(LaunchpadError::DivisionByZero)?;

    let sol_out = (virtual_sol as u128)
        .checked_sub(new_v_sol)
        .ok_or(LaunchpadError::MathUnderflow)?;

    require!(sol_out > 0, LaunchpadError::ZeroSolOut);

    Ok(sol_out as u64)
}

/// Compute current spot price in lamports per token (scaled by 1e9)
/// Returns price as lamports_per_token * PRICE_SCALE
pub fn compute_spot_price(virtual_sol: u64, virtual_tokens: u64) -> Result<u64> {
    require!(virtual_tokens > 0, LaunchpadError::DivisionByZero);

    // price = v_sol / v_token (lamports per token unit)
    // Scale up to preserve precision: price_scaled = v_sol * 1e9 / v_token
    const PRICE_SCALE: u128 = 1_000_000_000;

    let price_scaled = (virtual_sol as u128)
        .checked_mul(PRICE_SCALE)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(virtual_tokens as u128)
        .ok_or(LaunchpadError::DivisionByZero)?;

    Ok(price_scaled as u64)
}

/// Apply platform fee and return (net_amount, fee_amount)
/// fee_bps: fee in basis points (100 = 1%)
pub fn apply_fee(amount: u64, fee_bps: u16) -> Result<(u64, u64)> {
    let fee = (amount as u128)
        .checked_mul(fee_bps as u128)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(LaunchpadError::DivisionByZero)? as u64;

    let net = amount.checked_sub(fee).ok_or(LaunchpadError::MathUnderflow)?;

    Ok((net, fee))
}

/// Check slippage: verify actual_out >= min_out
pub fn check_slippage(actual_out: u64, min_out: u64) -> Result<()> {
    require!(actual_out >= min_out, LaunchpadError::SlippageExceeded);
    Ok(())
}

/// Update virtual reserves after a BUY
pub fn update_reserves_buy(
    virtual_sol: &mut u64,
    virtual_tokens: &mut u64,
    real_sol: &mut u64,
    sol_in: u64,
    tokens_out: u64,
) -> Result<()> {
    *virtual_sol = (*virtual_sol)
        .checked_add(sol_in)
        .ok_or(LaunchpadError::MathOverflow)?;

    *virtual_tokens = (*virtual_tokens)
        .checked_sub(tokens_out)
        .ok_or(LaunchpadError::MathUnderflow)?;

    *real_sol = (*real_sol)
        .checked_add(sol_in)
        .ok_or(LaunchpadError::MathOverflow)?;

    Ok(())
}

/// Update virtual reserves after a SELL
pub fn update_reserves_sell(
    virtual_sol: &mut u64,
    virtual_tokens: &mut u64,
    real_sol: &mut u64,
    sol_out: u64,
    tokens_in: u64,
) -> Result<()> {
    *virtual_sol = (*virtual_sol)
        .checked_sub(sol_out)
        .ok_or(LaunchpadError::MathUnderflow)?;

    *virtual_tokens = (*virtual_tokens)
        .checked_add(tokens_in)
        .ok_or(LaunchpadError::MathOverflow)?;

    *real_sol = (*real_sol)
        .checked_sub(sol_out)
        .ok_or(LaunchpadError::MathUnderflow)?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    const INIT_V_SOL: u64 = 30_000_000_000;     // 30 SOL
    const INIT_V_TOKEN: u64 = 1_073_000_191_000_000; // 1.073B tokens with 6 decimals

    #[test]
    fn test_buy_small_amount() {
        let sol_in = 1_000_000_000; // 1 SOL
        let tokens_out = compute_tokens_out(INIT_V_SOL, INIT_V_TOKEN, sol_in).unwrap();
        // At initial price: 1 SOL should buy ~34.3M tokens
        assert!(tokens_out > 0);
        assert!(tokens_out < INIT_V_TOKEN);
    }

    #[test]
    fn test_sell_round_trip() {
        let sol_in = 1_000_000_000;
        let tokens_out = compute_tokens_out(INIT_V_SOL, INIT_V_TOKEN, sol_in).unwrap();

        let new_v_sol = INIT_V_SOL + sol_in;
        let new_v_token = INIT_V_TOKEN - tokens_out;

        let sol_back = compute_sol_out(new_v_sol, new_v_token, tokens_out).unwrap();
        // Round trip should return close to original (minus fees)
        let diff = if sol_back > sol_in { sol_back - sol_in } else { sol_in - sol_back };
        // Less than 0.1% difference from round-trip
        assert!(diff < sol_in / 1000, "Round trip diff too large: {}", diff);
    }

    #[test]
    fn test_price_increases_with_buys() {
        let price_before = compute_spot_price(INIT_V_SOL, INIT_V_TOKEN).unwrap();

        let sol_in = 10_000_000_000; // 10 SOL
        let tokens_out = compute_tokens_out(INIT_V_SOL, INIT_V_TOKEN, sol_in).unwrap();
        let new_v_sol = INIT_V_SOL + sol_in;
        let new_v_token = INIT_V_TOKEN - tokens_out;

        let price_after = compute_spot_price(new_v_sol, new_v_token).unwrap();

        assert!(price_after > price_before, "Price should increase after buy");
    }

    #[test]
    fn test_fee_application() {
        let amount = 1_000_000_000; // 1 SOL
        let (net, fee) = apply_fee(amount, 100).unwrap(); // 1% fee
        assert_eq!(fee, 10_000_000); // 0.01 SOL
        assert_eq!(net, 990_000_000); // 0.99 SOL
        assert_eq!(net + fee, amount);
    }
}
