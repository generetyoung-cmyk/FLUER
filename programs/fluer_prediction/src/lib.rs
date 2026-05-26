use anchor_lang::prelude::*;

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;
use state::Resolution;

declare_id!("FLUERPredctMrktxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[program]
pub mod fluer_prediction {
    use super::*;

    /// Initialize the prediction market program configuration.
    pub fn initialize(
        ctx: Context<InitializePredConfig>,
        params: InitPredConfigParams,
    ) -> Result<()> {
        let config = &mut ctx.accounts.config;
        config.authority = ctx.accounts.authority.key();
        config.fluer_mint = params.fluer_mint;
        config.usdc_mint = params.usdc_mint;
        config.treasury = params.treasury;
        config.creation_fee_fluer = params.creation_fee_fluer;
        config.protocol_fee_bps = params.protocol_fee_bps;
        config.creator_royalty_bps = params.creator_royalty_bps;
        config.min_bet_usdc = params.min_bet_usdc;
        config.paused = false;
        config.total_markets_created = 0;
        config.total_volume_usd = 0;
        config.bump = ctx.bumps.config;
        Ok(())
    }

    /// Create a new prediction market for a specific token.
    /// Creator must hold 50 FLUER (creation fee).
    pub fn create_market(
        ctx: Context<CreateMarket>,
        params: CreateMarketParams,
    ) -> Result<()> {
        instructions::create_market(ctx, params)
    }

    /// Place a bet on YES or NO outcome.
    /// amount_usdc: USDC amount (6 decimals)
    /// min_shares: Slippage protection
    pub fn place_bet(
        ctx: Context<PlaceBet>,
        is_yes: bool,
        amount_usdc: u64,
        min_shares: u64,
    ) -> Result<()> {
        instructions::place_bet(ctx, is_yes, amount_usdc, min_shares)
    }

    /// Resolve a prediction market. Called by admin multisig.
    /// outcome: Yes | No | Void
    pub fn resolve_market(ctx: Context<ResolveMarket>, outcome: Resolution) -> Result<()> {
        instructions::resolve_market(ctx, outcome)
    }

    /// Claim winnings for a resolved market.
    /// Winners receive: (your_shares / winning_pool) * total_pool * (1 - fees)
    /// Losers receive: 0
    /// Voided markets: full refund
    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        instructions::claim_winnings(ctx)
    }
}

// ── Initialize instruction (not in instructions module for brevity) ────────

use state::PredictionConfig;

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitPredConfigParams {
    pub fluer_mint: Pubkey,
    pub usdc_mint: Pubkey,
    pub treasury: Pubkey,
    pub creation_fee_fluer: u64,
    pub protocol_fee_bps: u16,
    pub creator_royalty_bps: u16,
    pub min_bet_usdc: u64,
}

#[derive(Accounts)]
pub struct InitializePredConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = PredictionConfig::SPACE,
        seeds = [b"pred_config"],
        bump,
    )]
    pub config: Account<'info, PredictionConfig>,

    pub system_program: Program<'info, System>,
}
