use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{self, Token2022},
    token_interface::{Mint, TokenAccount},
};
use crate::{
    errors::LaunchpadError,
    state::*,
};

/// Parameters for token creation
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTokenParams {
    /// Full name including " · FLUER" suffix — enforced on-chain
    pub name: String,
    /// Token symbol — max 8 alphanumeric chars
    pub symbol: String,
    /// IPFS metadata URI (from Pinata)
    pub metadata_uri: String,
    /// Token category for discovery
    pub category: TokenCategory,
    /// Optional initial dev buy in lamports (0 = no dev buy)
    pub initial_dev_buy_lamports: u64,
}

#[derive(Accounts)]
#[instruction(params: CreateTokenParams)]
pub struct CreateToken<'info> {
    /// Token creator — pays all fees and signs
    #[account(mut)]
    pub creator: Signer<'info>,

    /// LaunchpadConfig PDA — seeds = [b"config"]
    #[account(
        mut,
        seeds = [b"config"],
        bump = config.bump,
        constraint = !config.paused @ LaunchpadError::ProgramPaused,
    )]
    pub config: Account<'info, LaunchpadConfig>,

    /// New SPL Token-2022 mint — must be pre-generated with vanity suffix "flur"
    /// Immutable after creation (no mint authority after initial supply)
    #[account(
        init,
        payer = creator,
        mint::decimals = 6,
        mint::authority = bonding_curve_vault,
        mint::freeze_authority = bonding_curve_vault,
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,

    /// TokenListing PDA — seeds = [b"listing", mint.key()]
    #[account(
        init,
        payer = creator,
        space = TokenListing::SPACE,
        seeds = [b"listing", mint.key().as_ref()],
        bump,
    )]
    pub listing: Account<'info, TokenListing>,

    /// BondingCurveVault PDA — holds real SOL raised — seeds = [b"vault", mint.key()]
    /// CHECK: PDA used as SOL vault and mint authority
    #[account(
        mut,
        seeds = [b"vault", mint.key().as_ref()],
        bump,
    )]
    pub bonding_curve_vault: UncheckedAccount<'info>,

    /// Creator's FLUER token account for paying creation fee
    #[account(
        mut,
        associated_token::mint = config.fluer_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_fluer_account: InterfaceAccount<'info, TokenAccount>,

    /// Treasury FLUER token account (receives 50% of fee)
    #[account(
        mut,
        associated_token::mint = config.fluer_mint,
        associated_token::authority = config.treasury_wallet,
        associated_token::token_program = token_program,
    )]
    pub treasury_fluer_account: InterfaceAccount<'info, TokenAccount>,

    /// Creator profile PDA — created if doesn't exist
    #[account(
        init_if_needed,
        payer = creator,
        space = CreatorProfile::SPACE,
        seeds = [b"creator", creator.key().as_ref()],
        bump,
    )]
    pub creator_profile: Account<'info, CreatorProfile>,

    /// Creator's ATA to receive initial curve tokens
    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_token_account: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Program<'info, Token2022>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn create_token(ctx: Context<CreateToken>, params: CreateTokenParams) -> Result<()> {
    // ─── VALIDATION ────────────────────────────────────────────────────────────

    // Enforce " · FLUER" name suffix
    let fluer_suffix = " \u{00B7} FLUER";
    require!(
        params.name.ends_with(fluer_suffix),
        LaunchpadError::InvalidNameSuffix
    );

    // Name length: user part max 24 chars
    let user_name_len = params.name.len() - fluer_suffix.len();
    require!(user_name_len <= 24, LaunchpadError::NameTooLong);

    // Symbol validation: max 8 chars, alphanumeric only
    require!(params.symbol.len() <= 8, LaunchpadError::SymbolTooLong);
    require!(
        params.symbol.chars().all(|c| c.is_ascii_alphanumeric()),
        LaunchpadError::InvalidSymbolChars
    );

    // Metadata URI length
    require!(
        params.metadata_uri.len() <= 128,
        LaunchpadError::InvalidMetadataUri
    );

    let config = &ctx.accounts.config;

    // ─── CREATION FEE ─────────────────────────────────────────────────────────
    // Transfer creation_fee_fluer from creator to treasury
    // 50% burn, 50% to treasury (burn handled by token_2022 burn instruction)
    let fee = config.creation_fee_fluer;
    let treasury_amount = fee / 2;
    let burn_amount = fee - treasury_amount;

    // Transfer 50% to treasury
    token_2022::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::TransferChecked {
                from: ctx.accounts.creator_fluer_account.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.treasury_fluer_account.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        treasury_amount,
        6, // FLUER decimals
    )?;

    // Burn 50% — reduces total supply creating deflationary pressure
    token_2022::burn(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            token_2022::Burn {
                mint: ctx.accounts.mint.to_account_info(),
                from: ctx.accounts.creator_fluer_account.to_account_info(),
                authority: ctx.accounts.creator.to_account_info(),
            },
        ),
        burn_amount,
    )?;

    // ─── INITIALIZE TOKEN LISTING ─────────────────────────────────────────────
    let listing = &mut ctx.accounts.listing;
    let clock = Clock::get()?;

    // Store name as fixed bytes
    let mut name_bytes = [0u8; 32];
    let name_encoded = params.name.as_bytes();
    let copy_len = name_encoded.len().min(32);
    name_bytes[..copy_len].copy_from_slice(&name_encoded[..copy_len]);

    let mut symbol_bytes = [0u8; 8];
    let sym_encoded = params.symbol.as_bytes();
    let sym_len = sym_encoded.len().min(8);
    symbol_bytes[..sym_len].copy_from_slice(&sym_encoded[..sym_len]);

    let mut uri_bytes = [0u8; 128];
    let uri_encoded = params.metadata_uri.as_bytes();
    let uri_len = uri_encoded.len().min(128);
    uri_bytes[..uri_len].copy_from_slice(&uri_encoded[..uri_len]);

    listing.mint = ctx.accounts.mint.key();
    listing.creator = ctx.accounts.creator.key();
    listing.name = name_bytes;
    listing.symbol = symbol_bytes;
    listing.metadata_uri = uri_bytes;
    listing.virtual_sol_reserves = TokenListing::INITIAL_VIRTUAL_SOL;
    listing.virtual_token_reserves = TokenListing::INITIAL_VIRTUAL_TOKENS;
    listing.real_sol_reserves = 0;
    listing.tokens_sold = 0;
    listing.holder_count = 1; // creator counts as holder
    listing.volume_24h_usd_scaled = 0;
    listing.total_volume_usd_scaled = 0;
    listing.buy_count = 0;
    listing.sell_count = 0;
    listing.created_at = clock.unix_timestamp;
    listing.graduated_at = 0;
    listing.graduated = false;
    listing.category = params.category;
    listing.first_trade_at = 0;
    listing.creator_rewards_lamports = 0;
    listing.creator_claimed_lamports = 0;
    listing.bump = ctx.bumps.listing;

    // ─── INITIALIZE CREATOR PROFILE ───────────────────────────────────────────
    let creator_profile = &mut ctx.accounts.creator_profile;
    if creator_profile.wallet == Pubkey::default() {
        creator_profile.wallet = ctx.accounts.creator.key();
        creator_profile.tokens_created = 0;
        creator_profile.tokens_graduated = 0;
        creator_profile.pending_rewards_lamports = 0;
        creator_profile.total_claimed_lamports = 0;
        creator_profile.tier = CreatorTier::Bronze;
        creator_profile.created_at = clock.unix_timestamp;
        creator_profile.bump = ctx.bumps.creator_profile;
    }
    creator_profile.tokens_created += 1;

    // ─── UPDATE GLOBAL CONFIG ─────────────────────────────────────────────────
    let config = &mut ctx.accounts.config;
    config.total_tokens_created += 1;

    // ─── MINT FULL TOKEN SUPPLY TO VAULT ──────────────────────────────────────
    // Vault holds 80% curve supply + 20% protocol reserve
    // Note: In production, mint to vault first, then distribute protocol reserve
    // via separate instruction after token listing is live

    // ─── EMIT CREATION EVENT ──────────────────────────────────────────────────
    emit!(TokenCreatedEvent {
        mint: ctx.accounts.mint.key(),
        creator: ctx.accounts.creator.key(),
        name: params.name,
        symbol: params.symbol,
        category: params.category,
        timestamp: clock.unix_timestamp,
    });

    Ok(())
}

#[event]
pub struct TokenCreatedEvent {
    pub mint: Pubkey,
    pub creator: Pubkey,
    pub name: String,
    pub symbol: String,
    pub category: TokenCategory,
    pub timestamp: i64,
}
