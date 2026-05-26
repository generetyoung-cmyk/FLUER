use anchor_lang::prelude::*;
use anchor_lang::system_program;
use anchor_spl::{
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount},
    associated_token::AssociatedToken,
};
use crate::{
    errors::LaunchpadError,
    math::{compute_tokens_out, compute_sol_out, apply_fee, check_slippage, update_reserves_buy, update_reserves_sell},
    state::*,
};

// ─────────────────────────────────────────────────────────────
// BUY INSTRUCTION
// ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct BuyOnCurve<'info> {
    #[account(mut)]
    pub buyer: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = !config.paused @ LaunchpadError::ProgramPaused,
    )]
    pub config: Account<'info, LaunchpadConfig>,

    #[account(
        mut,
        seeds = [b"listing", mint.key().as_ref()],
        bump = listing.bump,
        constraint = !listing.graduated @ LaunchpadError::CurveGraduated,
    )]
    pub listing: Account<'info, TokenListing>,

    #[account(address = listing.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA vault holding real SOL
    #[account(
        mut,
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve_vault: UncheckedAccount<'info>,

    /// Buyer's ATA to receive tokens
    #[account(
        init_if_needed,
        payer = buyer,
        associated_token::mint = mint,
        associated_token::authority = buyer,
        associated_token::token_program = token_program,
    )]
    pub buyer_token_account: InterfaceAccount<'info, TokenAccount>,

    /// Treasury receives platform fee SOL
    /// CHECK: Treasury wallet from config
    #[account(
        mut,
        address = config.treasury_wallet,
    )]
    pub treasury: UncheckedAccount<'info>,

    /// Creator account for accumulating rewards
    /// CHECK: creator from listing
    #[account(
        mut,
        address = listing.creator,
    )]
    pub creator_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn buy_on_curve(
    ctx: Context<BuyOnCurve>,
    sol_amount: u64,
    min_tokens_out: u64,
) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Anti-bot: enforce snipe protection window
    if listing.first_trade_at == 0 {
        listing.first_trade_at = clock.unix_timestamp;
    }
    let in_snipe_window = clock.unix_timestamp - listing.first_trade_at
        < TokenListing::ANTI_SNIPE_WINDOW_SECS;

    if in_snipe_window {
        require!(
            sol_amount <= TokenListing::ANTI_SNIPE_MAX_LAMPORTS,
            LaunchpadError::AntiBotMaxPurchaseExceeded
        );
    }

    // Apply platform fee (taken from sol_amount)
    let (sol_net, fee_sol) = apply_fee(sol_amount, config.platform_fee_bps)?;

    // Compute tokens out using net SOL (after fee)
    let tokens_out = compute_tokens_out(
        listing.virtual_sol_reserves,
        listing.virtual_token_reserves,
        sol_net,
    )?;

    // Slippage protection
    check_slippage(tokens_out, min_tokens_out)?;

    // Calculate fee splits:
    // 70% to treasury, 30% to creator
    let creator_fee = fee_sol
        .checked_mul(TokenListing::CREATOR_FEE_SHARE_BPS as u64)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(LaunchpadError::DivisionByZero)?;
    let treasury_fee = fee_sol
        .checked_sub(creator_fee)
        .ok_or(LaunchpadError::MathUnderflow)?;

    // Transfer SOL from buyer to vault (net amount)
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.bonding_curve_vault.to_account_info(),
            },
        ),
        sol_net,
    )?;

    // Transfer fee to treasury
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),
            },
        ),
        treasury_fee,
    )?;

    // Transfer creator fee to creator
    system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            system_program::Transfer {
                from: ctx.accounts.buyer.to_account_info(),
                to: ctx.accounts.creator_account.to_account_info(),
            },
        ),
        creator_fee,
    )?;

    // Mint tokens to buyer from vault PDA authority
    let mint_key = ctx.accounts.mint.key();
    let vault_seeds: &[&[&[u8]]] = &[&[
        b"vault",
        mint_key.as_ref(),
        &[ctx.bumps.bonding_curve_vault],
    ]];

    token_2022::mint_to(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            token_2022::MintTo {
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.buyer_token_account.to_account_info(),
                authority: ctx.accounts.bonding_curve_vault.to_account_info(),
            },
            vault_seeds,
        ),
        tokens_out,
    )?;

    // Update reserves
    update_reserves_buy(
        &mut listing.virtual_sol_reserves,
        &mut listing.virtual_token_reserves,
        &mut listing.real_sol_reserves,
        sol_net,
        tokens_out,
    )?;

    listing.tokens_sold = listing
        .tokens_sold
        .checked_add(tokens_out)
        .ok_or(LaunchpadError::MathOverflow)?;
    listing.buy_count += 1;
    listing.creator_rewards_lamports = listing
        .creator_rewards_lamports
        .checked_add(creator_fee)
        .ok_or(LaunchpadError::MathOverflow)?;

    let entry_price_lamports = sol_net
        .checked_div(tokens_out / 1_000_000) // normalize to tokens (6 decimals)
        .unwrap_or(0);

    emit!(CurveTradeEvent {
        mint: listing.mint,
        side: TradeSide::Buy,
        sol_amount: sol_amount,
        token_amount: tokens_out,
        price_lamports_per_token: entry_price_lamports,
        virtual_sol_reserves: listing.virtual_sol_reserves,
        virtual_token_reserves: listing.virtual_token_reserves,
        real_sol_reserves: listing.real_sol_reserves,
        trader: ctx.accounts.buyer.key(),
        timestamp: clock.unix_timestamp,
    });

    // Auto-check graduation after every buy
    let should_graduate = listing.real_sol_reserves >= TokenListing::GRADUATION_SOL_THRESHOLD;
    if should_graduate {
        listing.graduated = true;
        listing.graduated_at = clock.unix_timestamp;
        emit!(GraduationEvent {
            mint: listing.mint,
            creator: listing.creator,
            real_sol_raised: listing.real_sol_reserves,
            total_volume: listing.total_volume_usd_scaled,
            timestamp: clock.unix_timestamp,
        });
    }

    Ok(())
}

// ─────────────────────────────────────────────────────────────
// SELL INSTRUCTION
// ─────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct SellOnCurve<'info> {
    #[account(mut)]
    pub seller: Signer<'info>,

    #[account(
        seeds = [b"config"],
        bump = config.bump,
        constraint = !config.paused @ LaunchpadError::ProgramPaused,
    )]
    pub config: Account<'info, LaunchpadConfig>,

    #[account(
        mut,
        seeds = [b"listing", mint.key().as_ref()],
        bump = listing.bump,
        constraint = !listing.graduated @ LaunchpadError::CurveGraduated,
    )]
    pub listing: Account<'info, TokenListing>,

    #[account(address = listing.mint)]
    pub mint: InterfaceAccount<'info, Mint>,

    /// CHECK: PDA vault
    #[account(
        mut,
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve_vault: UncheckedAccount<'info>,

    #[account(
        mut,
        associated_token::mint = mint,
        associated_token::authority = seller,
        associated_token::token_program = token_program,
    )]
    pub seller_token_account: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Treasury from config
    #[account(mut, address = config.treasury_wallet)]
    pub treasury: UncheckedAccount<'info>,

    /// CHECK: Creator from listing
    #[account(mut, address = listing.creator)]
    pub creator_account: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

pub fn sell_on_curve(
    ctx: Context<SellOnCurve>,
    token_amount: u64,
    min_sol_out: u64,
) -> Result<()> {
    let listing = &mut ctx.accounts.listing;
    let config = &ctx.accounts.config;
    let clock = Clock::get()?;

    // Compute gross SOL out before fee
    let sol_gross = compute_sol_out(
        listing.virtual_sol_reserves,
        listing.virtual_token_reserves,
        token_amount,
    )?;

    // Apply platform fee on SOL output
    let (sol_net, fee_sol) = apply_fee(sol_gross, config.platform_fee_bps)?;

    // Slippage check
    check_slippage(sol_net, min_sol_out)?;

    // Fee splits
    let creator_fee = fee_sol
        .checked_mul(TokenListing::CREATOR_FEE_SHARE_BPS as u64)
        .ok_or(LaunchpadError::MathOverflow)?
        .checked_div(10_000)
        .ok_or(LaunchpadError::DivisionByZero)?;
    let treasury_fee = fee_sol
        .checked_sub(creator_fee)
        .ok_or(LaunchpadError::MathUnderflow)?;

    // Burn seller's tokens
    token_2022::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.seller_token_account.to_account_info(),
                authority: ctx.accounts.seller.to_account_info(),
            },
        ),
        token_amount,
    )?;

    // Transfer net SOL from vault to seller using PDA signer
    let mint_key = ctx.accounts.mint.key();
    let vault_seeds: &[&[&[u8]]] = &[&[
        b"vault",
        mint_key.as_ref(),
        &[ctx.bumps.bonding_curve_vault],
    ]];

    let vault_info = ctx.accounts.bonding_curve_vault.to_account_info();

    // Transfer net SOL to seller
    **vault_info.try_borrow_mut_lamports()? -= sol_net + fee_sol;
    **ctx.accounts.seller.try_borrow_mut_lamports()? += sol_net;
    **ctx.accounts.treasury.try_borrow_mut_lamports()? += treasury_fee;
    **ctx.accounts.creator_account.try_borrow_mut_lamports()? += creator_fee;

    // Update reserves
    update_reserves_sell(
        &mut listing.virtual_sol_reserves,
        &mut listing.virtual_token_reserves,
        &mut listing.real_sol_reserves,
        sol_gross,
        token_amount,
    )?;

    listing.sell_count += 1;
    listing.creator_rewards_lamports = listing
        .creator_rewards_lamports
        .checked_add(creator_fee)
        .ok_or(LaunchpadError::MathOverflow)?;

    let exit_price_lamports = sol_net.checked_div(token_amount / 1_000_000).unwrap_or(0);

    emit!(CurveTradeEvent {
        mint: listing.mint,
        side: TradeSide::Sell,
        sol_amount: sol_net,
        token_amount,
        price_lamports_per_token: exit_price_lamports,
        virtual_sol_reserves: listing.virtual_sol_reserves,
        virtual_token_reserves: listing.virtual_token_reserves,
        real_sol_reserves: listing.real_sol_reserves,
        trader: ctx.accounts.seller.key(),
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

// ─────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum TradeSide {
    Buy,
    Sell,
}

#[event]
pub struct CurveTradeEvent {
    pub mint: Pubkey,
    pub side: TradeSide,
    pub sol_amount: u64,
    pub token_amount: u64,
    pub price_lamports_per_token: u64,
    pub virtual_sol_reserves: u64,
    pub virtual_token_reserves: u64,
    pub real_sol_reserves: u64,
    pub trader: Pubkey,
    pub timestamp: i64,
}

#[event]
pub struct GraduationEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub real_sol_raised: u64,
    pub total_volume: u64,
    pub timestamp: i64,
}
