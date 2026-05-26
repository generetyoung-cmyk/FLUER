use anchor_lang::prelude::*;
use crate::{errors::LaunchpadError, state::LaunchpadConfig};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct InitializeParams {
    pub fluer_mint: Pubkey,
    pub treasury_wallet: Pubkey,
    pub sol_usd_oracle: Pubkey,
    pub creation_fee_fluer: u64,
    pub platform_fee_bps: u16,
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = LaunchpadConfig::SPACE,
        seeds = [b"config"],
        bump,
    )]
    pub config: Account<'info, LaunchpadConfig>,

    pub system_program: Program<'info, System>,
}

pub fn initialize(ctx: Context<Initialize>, params: InitializeParams) -> Result<()> {
    require!(
        params.platform_fee_bps <= 1000, // Max 10% fee
        LaunchpadError::Unauthorized
    );

    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.fluer_mint = params.fluer_mint;
    config.treasury_wallet = params.treasury_wallet;
    config.sol_usd_oracle = params.sol_usd_oracle;
    config.creation_fee_fluer = params.creation_fee_fluer;
    config.platform_fee_bps = params.platform_fee_bps;

    // Default graduation criteria
    config.graduation_market_cap_usd_scaled = 100_000 * 1_000_000; // $100K
    config.graduation_volume_24h_scaled = 50_000 * 1_000_000;      // $50K
    config.graduation_holders_min = 200;
    config.graduation_liquidity_usd_scaled = 20_000 * 1_000_000;   // $20K
    config.graduation_age_min_hours = 12;
    config.paused = false;
    config.total_tokens_created = 0;
    config.total_volume_lamports = 0;
    config.total_graduated = 0;
    config.bump = ctx.bumps.config;

    Ok(())
}
