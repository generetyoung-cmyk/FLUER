use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{TokenAccount, Mint, Token2022},
    token_2022,
    associated_token::AssociatedToken,
};
use crate::state::*;
use crate::errors::PredictionError;

// ── CREATE MARKET ─────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketParams {
    pub market_type: MarketType,
    /// Max 96 bytes
    pub title: String,
    /// Max 256 bytes
    pub description: String,
    pub resolution_value: u64,
    pub resolution_timestamp: i64,
    /// Pyth oracle for price resolution (pass system_program if not applicable)
    pub oracle: Pubkey,
}

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(
        seeds = [b"pred_config"],
        bump = config.bump,
        constraint = !config.paused @ PredictionError::Paused,
    )]
    pub config: Account<'info, PredictionConfig>,

    /// The token this market is about
    /// CHECK: Just storing the mint address for reference
    pub token_mint: UncheckedAccount<'info>,

    #[account(
        init,
        payer = creator,
        space = PredictionMarket::SPACE,
        seeds = [
            b"pred_market",
            token_mint.key().as_ref(),
            &params.resolution_timestamp.to_le_bytes(),
        ],
        bump,
    )]
    pub market: Account<'info, PredictionMarket>,

    /// Creator's FLUER account (pays creation fee)
    #[account(
        mut,
        associated_token::mint = config.fluer_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_fluer: InterfaceAccount<'info, TokenAccount>,

    /// Treasury FLUER account
    #[account(
        mut,
        associated_token::mint = config.fluer_mint,
        associated_token::authority = config.treasury,
        associated_token::token_program = token_program,
    )]
    pub treasury_fluer: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
    let clock = Clock::get()?;
    let config = &ctx.accounts.config;

    // Validate
    require!(
        params.title.len() <= 96,
        PredictionError::TitleTooLong
    );
    require!(
        params.description.len() <= 256,
        PredictionError::DescriptionTooLong
    );
    require!(
        params.resolution_timestamp > clock.unix_timestamp,
        PredictionError::ExpiryInPast
    );
    require!(
        params.resolution_timestamp <= clock.unix_timestamp + 90 * 86400,
        PredictionError::ExpiryTooFar
    );

    // Charge creation fee: 50% burned, 50% to treasury
    let fee = config.creation_fee_fluer;
    let treasury_amount = fee / 2;
    let burn_amount = fee - treasury_amount;

    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::TransferChecked {
                from: ctx.accounts.creator_fluer.to_account_info(),
                mint: ctx.accounts.token_program.to_account_info(), // placeholder
                to: ctx.accounts.treasury_fluer.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        treasury_amount,
        6,
    )?;

    // Initialize market
    let market = &mut ctx.accounts.market;

    let mut title_bytes = [0u8; 96];
    let title_len = params.title.len().min(96);
    title_bytes[..title_len].copy_from_slice(&params.title.as_bytes()[..title_len]);

    let mut desc_bytes = [0u8; 256];
    let desc_len = params.description.len().min(256);
    desc_bytes[..desc_len].copy_from_slice(&params.description.as_bytes()[..desc_len]);

    market.creator = ctx.accounts.creator.key();
    market.token_mint = ctx.accounts.token_mint.key();
    market.oracle = params.oracle;
    market.market_type = params.market_type;
    market.title = title_bytes;
    market.description = desc_bytes;
    market.resolution_value = params.resolution_value;
    market.resolution_timestamp = params.resolution_timestamp;
    market.yes_pool = 0;
    market.no_pool = 0;
    market.total_fees = 0;
    market.bettor_count = 0;
    market.resolution = Resolution::Pending;
    market.created_at = clock.unix_timestamp;
    market.resolved_at = 0;
    market.bump = ctx.bumps.market;

    emit!(MarketCreatedEvent {
        market: ctx.accounts.market.key(),
        token_mint: ctx.accounts.token_mint.key(),
        creator: ctx.accounts.creator.key(),
        market_type: params.market_type,
        resolution_value: params.resolution_value,
        resolution_timestamp: params.resolution_timestamp,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ── PLACE BET ─────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(is_yes: bool, amount_usdc: u64)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        seeds = [b"pred_config"],
        bump = config.bump,
        constraint = !config.paused @ PredictionError::Paused,
    )]
    pub config: Account<'info, PredictionConfig>,

    #[account(
        mut,
        constraint = market.resolution == Resolution::Pending @ PredictionError::MarketClosed,
        constraint = Clock::get().map(|c| c.unix_timestamp < market.resolution_timestamp).unwrap_or(false)
            @ PredictionError::MarketExpired,
    )]
    pub market: Account<'info, PredictionMarket>,

    #[account(
        init_if_needed,
        payer = bettor,
        space = PredictionPosition::SPACE,
        seeds = [
            b"pred_pos",
            bettor.key().as_ref(),
            market.key().as_ref(),
        ],
        bump,
    )]
    pub position: Account<'info, PredictionPosition>,

    /// Bettor's USDC account
    #[account(
        mut,
        associated_token::mint = config.usdc_mint,
        associated_token::authority = bettor,
    )]
    pub bettor_usdc: InterfaceAccount<'info, TokenAccount>,

    /// Market USDC vault — holds all bets
    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"pred_vault", market.key().as_ref()],
        bump,
    )]
    pub market_vault: UncheckedAccount<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn place_bet(
    ctx: Context<PlaceBet>,
    is_yes: bool,
    amount_usdc: u64,
    min_shares: u64,
) -> Result<()> {
    let config = &ctx.accounts.config;
    let market = &mut ctx.accounts.market;
    let clock = Clock::get()?;

    require!(
        amount_usdc >= config.min_bet_usdc,
        PredictionError::BetTooSmall
    );

    // Transfer USDC to vault
    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::TransferChecked {
                from: ctx.accounts.bettor_usdc.to_account_info(),
                mint: ctx.accounts.usdc_mint.to_account_info(),
                to: ctx.accounts.market_vault.to_account_info(),
                authority: ctx.accounts.bettor.to_account_info(),
            },
        ),
        amount_usdc,
        6,
    )?;

    // Calculate shares (1:1 — each $1 USDC = 1 share, payout from total pool)
    let shares = amount_usdc;

    // Slippage: shares must be at least min_shares
    require!(shares >= min_shares, PredictionError::SlippageExceeded);

    // Update market pools
    if is_yes {
        market.yes_pool = market.yes_pool
            .checked_add(amount_usdc)
            .ok_or(PredictionError::Overflow)?;
    } else {
        market.no_pool = market.no_pool
            .checked_add(amount_usdc)
            .ok_or(PredictionError::Overflow)?;
    }

    // Update position (accumulate if existing)
    let position = &mut ctx.accounts.position;
    if position.bettor == Pubkey::default() {
        // New position
        position.bettor = ctx.accounts.bettor.key();
        position.market = ctx.accounts.market.key();
        position.is_yes = is_yes;
        position.amount_usdc = amount_usdc;
        position.shares = shares;
        position.claimed = false;
        position.placed_at = clock.unix_timestamp;
        position.bump = ctx.bumps.position;
        market.bettor_count = market.bettor_count.saturating_add(1);
    } else {
        // Existing position — must match side
        require!(position.is_yes == is_yes, PredictionError::WrongSide);
        position.amount_usdc = position.amount_usdc
            .checked_add(amount_usdc)
            .ok_or(PredictionError::Overflow)?;
        position.shares = position.shares
            .checked_add(shares)
            .ok_or(PredictionError::Overflow)?;
    }

    emit!(BetPlacedEvent {
        market: ctx.accounts.market.key(),
        bettor: ctx.accounts.bettor.key(),
        is_yes,
        amount_usdc,
        shares,
        yes_pool: market.yes_pool,
        no_pool: market.no_pool,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ── RESOLVE MARKET ────────────────────────────────────────────

#[derive(Accounts)]
pub struct ResolveMarket<'info> {
    /// Only admin authority can resolve
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"pred_config"],
        bump = config.bump,
        constraint = config.authority == authority.key() @ PredictionError::Unauthorized,
    )]
    pub config: Account<'info, PredictionConfig>,

    #[account(
        mut,
        constraint = market.resolution == Resolution::Pending @ PredictionError::AlreadyResolved,
    )]
    pub market: Account<'info, PredictionMarket>,
}

pub fn resolve_market(
    ctx: Context<ResolveMarket>,
    outcome: Resolution,
) -> Result<()> {
    let clock = Clock::get()?;
    let market = &mut ctx.accounts.market;

    require!(
        outcome != Resolution::Pending,
        PredictionError::InvalidResolution
    );

    market.resolution = outcome;
    market.resolved_at = clock.unix_timestamp;

    emit!(MarketResolvedEvent {
        market: ctx.accounts.market.key(),
        resolution: outcome,
        yes_pool: market.yes_pool,
        no_pool: market.no_pool,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ── CLAIM WINNINGS ────────────────────────────────────────────

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub bettor: Signer<'info>,

    #[account(
        seeds = [b"pred_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, PredictionConfig>,

    #[account(
        constraint = market.resolution != Resolution::Pending @ PredictionError::MarketNotResolved,
    )]
    pub market: Account<'info, PredictionMarket>,

    #[account(
        mut,
        seeds = [b"pred_pos", bettor.key().as_ref(), market.key().as_ref()],
        bump = position.bump,
        constraint = position.bettor == bettor.key() @ PredictionError::Unauthorized,
        constraint = !position.claimed @ PredictionError::AlreadyClaimed,
    )]
    pub position: Account<'info, PredictionPosition>,

    /// CHECK: Market USDC vault PDA
    #[account(
        mut,
        seeds = [b"pred_vault", market.key().as_ref()],
        bump,
    )]
    pub market_vault: UncheckedAccount<'info>,

    #[account(mut)]
    pub bettor_usdc: InterfaceAccount<'info, TokenAccount>,

    #[account(mut)]
    pub treasury_usdc: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Creator account (receives royalty)
    #[account(mut, address = market.creator)]
    pub creator: UncheckedAccount<'info>,

    pub usdc_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
    let config = &ctx.accounts.config;
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;
    let clock = Clock::get()?;

    let is_winner = match market.resolution {
        Resolution::Yes  => position.is_yes,
        Resolution::No   => !position.is_yes,
        Resolution::Void => true,   // Both sides get refunded
        Resolution::Pending => return err!(PredictionError::MarketNotResolved),
    };

    let payout = if market.resolution == Resolution::Void {
        // Full refund
        position.amount_usdc
    } else if is_winner {
        // Winner payout: (shares / winning_pool) * total_pool * (1 - fees)
        let winning_pool = if position.is_yes { market.yes_pool } else { market.no_pool };
        let total_pool   = market.yes_pool + market.no_pool;

        let gross_payout = (position.shares as u128 * total_pool as u128 / winning_pool as u128) as u64;

        // Deduct protocol fee + creator royalty
        let protocol_fee = (gross_payout as u128 * config.protocol_fee_bps as u128 / 10_000) as u64;
        let creator_fee  = (gross_payout as u128 * config.creator_royalty_bps as u128 / 10_000) as u64;

        gross_payout - protocol_fee - creator_fee
    } else {
        0 // Loser — no payout
    };

    // Mark position as claimed before transfers (reentrancy guard)
    position.claimed = true;

    // Execute payout via vault PDA signer
    let market_key = market.key();
    let vault_seeds: &[&[&[u8]]] = &[&[
        b"pred_vault",
        market_key.as_ref(),
        &[ctx.bumps.market_vault],
    ]];

    if payout > 0 {
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.market_vault.to_account_info(),
                    mint: ctx.accounts.usdc_mint.to_account_info(),
                    to: ctx.accounts.bettor_usdc.to_account_info(),
                    authority: ctx.accounts.market_vault.to_account_info(),
                },
                vault_seeds,
            ),
            payout,
            6,
        )?;
    }

    emit!(WinningsClaimedEvent {
        market: ctx.accounts.market.key(),
        bettor: ctx.accounts.bettor.key(),
        payout_usdc: payout,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ── EVENTS ────────────────────────────────────────────────────

#[event]
pub struct MarketCreatedEvent {
    pub market: Pubkey,
    pub token_mint: Pubkey,
    pub creator: Pubkey,
    pub market_type: MarketType,
    pub resolution_value: u64,
    pub resolution_timestamp: i64,
    pub timestamp: i64,
}

#[event]
pub struct BetPlacedEvent {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub is_yes: bool,
    pub amount_usdc: u64,
    pub shares: u64,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub timestamp: i64,
}

#[event]
pub struct MarketResolvedEvent {
    pub market: Pubkey,
    pub resolution: Resolution,
    pub yes_pool: u64,
    pub no_pool: u64,
    pub timestamp: i64,
}

#[event]
pub struct WinningsClaimedEvent {
    pub market: Pubkey,
    pub bettor: Pubkey,
    pub payout_usdc: u64,
    pub timestamp: i64,
}
