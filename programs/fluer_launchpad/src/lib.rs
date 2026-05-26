use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod math;
pub mod state;

use instructions::*;

declare_id!("FLUERLnchPdxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod fluer_launchpad {
    use super::*;

    /// Initialize the FLUER Launchpad with global configuration.
    /// Called once by the admin authority.
    pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
        instructions::initialize::initialize(ctx, params)
    }

    /// Create a new token on the FLUER bonding curve.
    /// Token name MUST end with " · FLUER" — enforced on-chain.
    /// Creation fee of 50 FLUER is charged: 50% burned, 50% to treasury.
    pub fn create_token(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
        instructions::create_token::create_token(ctx, params)
    }

    /// Buy tokens from the bonding curve.
    /// sol_amount: lamports to spend (before fee)
    /// min_tokens_out: minimum tokens expected (slippage protection)
    /// Emits CurveTradeEvent; triggers GraduationEvent if threshold hit.
    pub fn buy_on_curve(
        ctx: Context<BuyOnCurve>,
        sol_amount: u64,
        min_tokens_out: u64,
    ) -> Result<()> {
        instructions::curve_trade::buy_on_curve(ctx, sol_amount, min_tokens_out)
    }

    /// Sell tokens back to the bonding curve for SOL.
    /// token_amount: tokens to sell
    /// min_sol_out: minimum SOL expected (slippage protection)
    pub fn sell_on_curve(
        ctx: Context<SellOnCurve>,
        token_amount: u64,
        min_sol_out: u64,
    ) -> Result<()> {
        instructions::curve_trade::sell_on_curve(ctx, token_amount, min_sol_out)
    }
}
