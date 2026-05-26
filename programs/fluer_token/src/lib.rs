use anchor_lang::prelude::*;
use anchor_spl::{
    token_interface::{Mint, TokenAccount, Token2022},
    token_2022,
    associated_token::AssociatedToken,
};

declare_id!("FLUERTkn1111111111111111111111111111111111111");

// ── TOKENOMICS ────────────────────────────────────────────────
// Total Supply:        1,000,000,000 $FLUER (1 billion)
// Decimals:            6
// Distribution:
//   40% — Liquidity / DEX (400M)
//   20% — Team (200M, 4-year vest, 1-year cliff)
//   15% — Community / Airdrops (150M)
//   15% — Ecosystem fund (150M)
//   10% — Public sale (100M)
//
// Deflationary mechanics:
//   - 50% of each creation fee (50 FLUER) is burned
//   - Staked $FLUER earns protocol fee share (from trading + creation fees)
//   - Staking tiers unlock reduced platform fees + enhanced rewards

/// Global staking configuration
#[account]
pub struct StakingConfig {
    pub authority: Pubkey,
    pub fluer_mint: Pubkey,
    /// Total $FLUER currently staked across all users
    pub total_staked: u64,
    /// Accumulated rewards per staked token (scaled 1e12 for precision)
    pub reward_per_token: u128,
    /// Total rewards distributed lifetime
    pub total_rewards_distributed: u64,
    /// Total $FLUER burned from creation fees
    pub total_burned: u64,
    pub paused: bool,
    pub bump: u8,
}

impl StakingConfig {
    pub const SPACE: usize = 8 + 32 + 32 + 8 + 16 + 8 + 8 + 1 + 1;
}

/// Per-user staking position
#[account]
pub struct StakePosition {
    pub staker: Pubkey,
    /// Amount of $FLUER staked
    pub staked_amount: u64,
    /// Reward debt — used to compute unclaimed rewards
    /// unclaimed = staked * reward_per_token - reward_debt
    pub reward_debt: u128,
    /// Accumulated unclaimed rewards (transferred here when staked/unstaked)
    pub pending_rewards: u64,
    /// Timestamp of last stake or unstake action
    pub last_action_at: i64,
    /// Tier based on staked amount
    pub tier: StakeTier,
    pub bump: u8,
}

impl StakePosition {
    pub const SPACE: usize = 8 + 32 + 8 + 16 + 8 + 8 + 1 + 1;

    /// Compute tier from staked amount
    pub fn compute_tier(staked: u64) -> StakeTier {
        // Staked amount in whole FLUER (dividing by 1e6)
        let whole = staked / 1_000_000;
        match whole {
            0..=99         => StakeTier::None,
            100..=999      => StakeTier::Bronze,    // 100–999 FLUER
            1_000..=9_999  => StakeTier::Silver,    // 1K–9.99K
            10_000..=49_999 => StakeTier::Gold,     // 10K–49.99K
            _              => StakeTier::Diamond,   // 50K+
        }
    }

    /// Fee discount in basis points for this tier (applied to trading fee)
    pub fn fee_discount_bps(&self) -> u16 {
        match self.tier {
            StakeTier::None    => 0,
            StakeTier::Bronze  => 10,   // 0.1% discount → effective taker fee 0.09%
            StakeTier::Silver  => 20,   // 0.2% discount
            StakeTier::Gold    => 50,   // 0.5% discount
            StakeTier::Diamond => 100,  // 1.0% discount → free taker fee
        }
    }

    /// Reward multiplier in basis points (1x = 10_000)
    pub fn reward_multiplier_bps(&self) -> u16 {
        match self.tier {
            StakeTier::None    => 10_000,
            StakeTier::Bronze  => 11_000, // 1.1x
            StakeTier::Silver  => 12_500, // 1.25x
            StakeTier::Gold    => 15_000, // 1.5x
            StakeTier::Diamond => 20_000, // 2.0x
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Default)]
pub enum StakeTier {
    #[default]
    None,
    Bronze,
    Silver,
    Gold,
    Diamond,
}

// ── INSTRUCTIONS ──────────────────────────────────────────────

#[derive(Accounts)]
pub struct Stake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

    #[account(
        seeds = [b"staking_config"],
        bump = config.bump,
        constraint = !config.paused,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        init_if_needed,
        payer = staker,
        space = StakePosition::SPACE,
        seeds = [b"stake_pos", staker.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, StakePosition>,

    #[account(address = config.fluer_mint)]
    pub fluer_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = fluer_mint,
        associated_token::authority = staker,
        associated_token::token_program = token_program,
    )]
    pub staker_fluer: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Staking vault PDA holds all staked tokens
    #[account(
        mut,
        seeds = [b"staking_vault"],
        bump,
    )]
    pub staking_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Unstake<'info> {
    #[account(mut)]
    pub staker: Signer<'info>,

    #[account(
        seeds = [b"staking_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, StakingConfig>,

    #[account(
        mut,
        seeds = [b"stake_pos", staker.key().as_ref()],
        bump = position.bump,
        constraint = position.staker == staker.key(),
    )]
    pub position: Account<'info, StakePosition>,

    #[account(address = config.fluer_mint)]
    pub fluer_mint: InterfaceAccount<'info, Mint>,

    #[account(
        mut,
        associated_token::mint = fluer_mint,
        associated_token::authority = staker,
        associated_token::token_program = token_program,
    )]
    pub staker_fluer: InterfaceAccount<'info, TokenAccount>,

    /// CHECK: Staking vault
    #[account(mut, seeds = [b"staking_vault"], bump)]
    pub staking_vault: UncheckedAccount<'info>,

    pub token_program: Program<'info, Token2022>,
    pub system_program: Program<'info, System>,
}

#[program]
pub mod fluer_token {
    use super::*;

    /// Stake $FLUER to earn protocol fee share and unlock tier benefits.
    pub fn stake(ctx: Context<Stake>, amount: u64) -> Result<()> {
        require!(amount > 0, FluerTokenError::ZeroAmount);

        let config = &mut ctx.accounts.config;
        let position = &mut ctx.accounts.position;
        let clock = Clock::get()?;

        // Settle pending rewards before updating stake
        let pending = compute_pending_rewards(position, config.reward_per_token);
        position.pending_rewards = position.pending_rewards
            .checked_add(pending)
            .ok_or(FluerTokenError::Overflow)?;

        // Transfer FLUER from staker to vault
        token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.staker_fluer.to_account_info(),
                    mint: ctx.accounts.fluer_mint.to_account_info(),
                    to: ctx.accounts.staking_vault.to_account_info(),
                    authority: ctx.accounts.staker.to_account_info(),
                },
            ),
            amount,
            6,
        )?;

        // Update position
        if position.staker == Pubkey::default() {
            position.staker = ctx.accounts.staker.key();
            position.bump = ctx.bumps.position;
        }
        position.staked_amount = position.staked_amount
            .checked_add(amount)
            .ok_or(FluerTokenError::Overflow)?;
        position.reward_debt = compute_reward_debt(position.staked_amount, config.reward_per_token);
        position.last_action_at = clock.unix_timestamp;
        position.tier = StakePosition::compute_tier(position.staked_amount);

        config.total_staked = config.total_staked
            .checked_add(amount)
            .ok_or(FluerTokenError::Overflow)?;

        emit!(StakeEvent {
            staker: ctx.accounts.staker.key(),
            amount,
            total_staked: position.staked_amount,
            tier: position.tier,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Unstake $FLUER and claim accumulated rewards.
    pub fn unstake(ctx: Context<Unstake>, amount: u64) -> Result<()> {
        let config = &mut ctx.accounts.config;
        let position = &mut ctx.accounts.position;
        let clock = Clock::get()?;

        require!(amount > 0, FluerTokenError::ZeroAmount);
        require!(
            position.staked_amount >= amount,
            FluerTokenError::InsufficientStake
        );

        // Settle pending rewards
        let pending = compute_pending_rewards(position, config.reward_per_token);
        let total_rewards = position.pending_rewards
            .checked_add(pending)
            .ok_or(FluerTokenError::Overflow)?;

        // Update position
        position.staked_amount = position.staked_amount
            .checked_sub(amount)
            .ok_or(FluerTokenError::Overflow)?;
        position.reward_debt = compute_reward_debt(position.staked_amount, config.reward_per_token);
        position.pending_rewards = 0;
        position.last_action_at = clock.unix_timestamp;
        position.tier = StakePosition::compute_tier(position.staked_amount);

        config.total_staked = config.total_staked
            .checked_sub(amount)
            .ok_or(FluerTokenError::Overflow)?;

        // Return staked FLUER via vault PDA signer
        let vault_seeds: &[&[&[u8]]] = &[&[b"staking_vault", &[ctx.bumps.staking_vault]]];

        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.staking_vault.to_account_info(),
                    mint: ctx.accounts.fluer_mint.to_account_info(),
                    to: ctx.accounts.staker_fluer.to_account_info(),
                    authority: ctx.accounts.staking_vault.to_account_info(),
                },
                vault_seeds,
            ),
            amount + total_rewards,
            6,
        )?;

        emit!(UnstakeEvent {
            staker: ctx.accounts.staker.key(),
            amount,
            rewards_claimed: total_rewards,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

// ── Math helpers ──────────────────────────────────────────────

/// Compute unclaimed rewards for a position
fn compute_pending_rewards(position: &StakePosition, global_reward_per_token: u128) -> u64 {
    if position.staked_amount == 0 {
        return 0;
    }
    let accumulated = (position.staked_amount as u128)
        .checked_mul(global_reward_per_token)
        .unwrap_or(0)
        / 1_000_000_000_000; // scale factor

    let pending = accumulated.saturating_sub(position.reward_debt as u128);
    pending as u64
}

/// Compute reward debt snapshot
fn compute_reward_debt(staked: u64, reward_per_token: u128) -> u128 {
    (staked as u128)
        .checked_mul(reward_per_token)
        .unwrap_or(0)
        / 1_000_000_000_000
}

// ── Events ────────────────────────────────────────────────────

#[event]
pub struct StakeEvent {
    pub staker: Pubkey,
    pub amount: u64,
    pub total_staked: u64,
    pub tier: StakeTier,
    pub timestamp: i64,
}

#[event]
pub struct UnstakeEvent {
    pub staker: Pubkey,
    pub amount: u64,
    pub rewards_claimed: u64,
    pub timestamp: i64,
}

// ── Errors ────────────────────────────────────────────────────

#[error_code]
pub enum FluerTokenError {
    #[msg("Amount must be greater than zero")]
    ZeroAmount,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
    #[msg("Arithmetic overflow")]
    Overflow,
}
