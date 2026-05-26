use anchor_lang::prelude::*;

pub mod math;
pub mod state;

use state::*;
use math::vamm::{self, MarketTier};

declare_id!("FLUERPerpEngnxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

#[error_code]
pub enum PerpError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Market is not active")]
    MarketInactive,
    #[msg("Leverage exceeds maximum allowed")]
    LeverageTooHigh,
    #[msg("Insufficient collateral for this position")]
    InsufficientCollateral,
    #[msg("No position found")]
    NoPosition,
    #[msg("Position not liquidatable — margin ratio above threshold")]
    NotLiquidatable,
    #[msg("Slippage exceeded")]
    SlippageExceeded,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Oracle stale — last update too old")]
    OracleStale,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateMarketParams {
    pub base_mint: Pubkey,
    pub market_symbol: String, // max 14 chars + "-PERP" appended
    pub tier: MarketTier,
    pub oracle: Pubkey,
    pub spot_price_usd_scaled: u64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct OpenPositionParams {
    pub side: PositionSide,
    pub collateral_usdc: u64,
    pub leverage: u8,
    pub min_base_out: u64, // slippage protection
}

#[derive(Accounts)]
#[instruction(params: CreateMarketParams)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        seeds = [b"perp_config"],
        bump = config.bump,
        constraint = !config.paused @ PerpError::Paused,
    )]
    pub config: Account<'info, PerpEngineConfig>,

    #[account(
        init,
        payer = authority,
        space = PerpMarket::SPACE,
        seeds = [b"market", params.base_mint.as_ref()],
        bump,
    )]
    pub market: Account<'info, PerpMarket>,

    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(params: OpenPositionParams)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        seeds = [b"perp_config"],
        bump = config.bump,
        constraint = !config.paused @ PerpError::Paused,
    )]
    pub config: Account<'info, PerpEngineConfig>,

    #[account(
        mut,
        seeds = [b"market", market.base_mint.as_ref()],
        bump = market.bump,
        constraint = market.active @ PerpError::MarketInactive,
    )]
    pub market: Account<'info, PerpMarket>,

    #[account(
        init,
        payer = trader,
        space = Position::SPACE,
        seeds = [b"position", trader.key().as_ref(), market.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,

    // USDC collateral accounts (simplified — real implementation uses USDC SPL)
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ClosePosition<'info> {
    #[account(mut)]
    pub trader: Signer<'info>,

    #[account(
        seeds = [b"perp_config"],
        bump = config.bump,
    )]
    pub config: Account<'info, PerpEngineConfig>,

    #[account(
        mut,
        seeds = [b"market", market.base_mint.as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, PerpMarket>,

    #[account(
        mut,
        seeds = [b"position", trader.key().as_ref(), market.key().as_ref()],
        bump = position.bump,
        constraint = position.trader == trader.key() @ PerpError::Unauthorized,
        close = trader,
    )]
    pub position: Account<'info, Position>,

    pub system_program: Program<'info, System>,
}

#[program]
pub mod fluer_perp_engine {
    use super::*;

    /// Create a new permissionless perpetual market for any Solana token.
    /// Called by Market Factory Engine when graduation criteria are met.
    pub fn create_market(ctx: Context<CreateMarket>, params: CreateMarketParams) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let clock = Clock::get()?;

        require!(params.market_symbol.len() <= 11, PerpError::MathOverflow);

        let mut symbol_bytes = [0u8; 16];
        let full_symbol = format!("{}-PERP", params.market_symbol);
        let sym_bytes = full_symbol.as_bytes();
        let copy_len = sym_bytes.len().min(16);
        symbol_bytes[..copy_len].copy_from_slice(&sym_bytes[..copy_len]);

        let (base_reserve, quote_reserve) = vamm::compute_initial_reserves(
            params.spot_price_usd_scaled,
            params.tier,
        );

        market.base_mint = params.base_mint;
        market.market_symbol = symbol_bytes;
        market.tier = params.tier;
        market.base_asset_reserve = base_reserve;
        market.quote_asset_reserve = quote_reserve;
        market.long_open_interest = 0;
        market.short_open_interest = 0;
        market.oracle = params.oracle;
        market.last_index_price = params.spot_price_usd_scaled;
        market.last_mark_price = vamm::mark_price(base_reserve, quote_reserve)
            .unwrap_or(params.spot_price_usd_scaled);
        market.last_oracle_update = clock.unix_timestamp;
        market.cumulative_long_funding = 0;
        market.cumulative_short_funding = 0;
        market.last_funding_time = clock.unix_timestamp;
        market.hourly_funding_rate = 0;
        market.volume_24h_usd = 0;
        market.total_volume_usd = 0;
        market.trade_count = 0;
        market.liq_count = 0;
        market.created_at = clock.unix_timestamp;
        market.active = true;
        market.bump = ctx.bumps.market;

        emit!(MarketCreatedEvent {
            base_mint: params.base_mint,
            market_symbol: full_symbol,
            tier: params.tier,
            spot_price: params.spot_price_usd_scaled,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Open a leveraged position in a perpetual market.
    pub fn open_position(ctx: Context<OpenPosition>, params: OpenPositionParams) -> Result<()> {
        let config = &ctx.accounts.config;
        let market = &mut ctx.accounts.market;
        let position = &mut ctx.accounts.position;
        let clock = Clock::get()?;

        require!(params.leverage >= 1 && params.leverage <= config.max_leverage, PerpError::LeverageTooHigh);
        require!(params.collateral_usdc >= 1_000_000, PerpError::InsufficientCollateral); // Min $1

        let notional = (params.collateral_usdc as u128)
            .checked_mul(params.leverage as u128)
            .ok_or(PerpError::MathOverflow)? as u64;

        let (base_amount, entry_price) = match params.side {
            PositionSide::Long => {
                vamm::open_long(
                    market.base_asset_reserve,
                    market.quote_asset_reserve,
                    notional,
                ).map_err(|_| PerpError::MathOverflow)?
            }
            PositionSide::Short => {
                // For short, we need base_amount first — estimate from price
                let approx_base = (notional as u128)
                    .checked_mul(1_000_000)
                    .ok_or(PerpError::MathOverflow)?
                    .checked_div(market.last_mark_price as u128)
                    .ok_or(PerpError::MathOverflow)? as u64;

                vamm::open_short(
                    market.base_asset_reserve,
                    market.quote_asset_reserve,
                    approx_base,
                ).map_err(|_| PerpError::MathOverflow)?
            }
        };

        require!(base_amount >= params.min_base_out, PerpError::SlippageExceeded);

        // Update vAMM reserves
        match params.side {
            PositionSide::Long => {
                market.base_asset_reserve = market.base_asset_reserve.saturating_sub(base_amount);
                market.quote_asset_reserve = market.quote_asset_reserve.saturating_add(notional);
                market.long_open_interest = market.long_open_interest.saturating_add(base_amount);
            }
            PositionSide::Short => {
                market.base_asset_reserve = market.base_asset_reserve.saturating_add(base_amount);
                market.quote_asset_reserve = market.quote_asset_reserve.saturating_sub(notional);
                market.short_open_interest = market.short_open_interest.saturating_add(base_amount);
            }
        }

        // Compute liquidation price
        let liquidation_price = match params.side {
            PositionSide::Long => vamm::long_liquidation_price(
                entry_price,
                params.leverage,
                config.maintenance_margin_bps,
            ),
            PositionSide::Short => vamm::short_liquidation_price(
                entry_price,
                params.leverage,
                config.maintenance_margin_bps,
            ),
        };

        let funding_at_open = match params.side {
            PositionSide::Long => market.cumulative_long_funding,
            PositionSide::Short => market.cumulative_short_funding,
        };

        position.trader = ctx.accounts.trader.key();
        position.market = ctx.accounts.market.key();
        position.base_mint = market.base_mint;
        position.side = params.side;
        position.base_amount = base_amount;
        position.notional_usdc = notional;
        position.collateral_usdc = params.collateral_usdc;
        position.leverage = params.leverage;
        position.entry_price = entry_price;
        position.liquidation_price = liquidation_price;
        position.funding_rate_at_open = funding_at_open;
        position.funding_pnl = 0;
        position.opened_at = clock.unix_timestamp;
        position.bump = ctx.bumps.position;

        market.trade_count += 1;
        market.total_volume_usd = market.total_volume_usd.saturating_add(notional);
        market.last_mark_price = vamm::mark_price(
            market.base_asset_reserve,
            market.quote_asset_reserve,
        ).unwrap_or(market.last_mark_price);

        emit!(PositionOpenedEvent {
            trader: ctx.accounts.trader.key(),
            market: ctx.accounts.market.key(),
            side: params.side,
            base_amount,
            notional_usdc: notional,
            collateral_usdc: params.collateral_usdc,
            leverage: params.leverage,
            entry_price,
            liquidation_price,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }

    /// Close an existing position and realize PnL.
    pub fn close_position(ctx: Context<ClosePosition>, min_usdc_out: u64) -> Result<()> {
        let market = &mut ctx.accounts.market;
        let position = &ctx.accounts.position;
        let clock = Clock::get()?;

        let current_mark = vamm::mark_price(
            market.base_asset_reserve,
            market.quote_asset_reserve,
        ).map_err(|_| PerpError::MathOverflow)?;

        let pnl = match position.side {
            PositionSide::Long => vamm::long_pnl(
                position.base_amount,
                position.entry_price,
                current_mark,
            ),
            PositionSide::Short => vamm::short_pnl(
                position.base_amount,
                position.entry_price,
                current_mark,
            ),
        };

        let pnl_with_funding = pnl + position.funding_pnl;
        let return_usdc = if pnl_with_funding >= 0 {
            position.collateral_usdc.saturating_add(pnl_with_funding as u64)
        } else {
            position.collateral_usdc.saturating_sub((-pnl_with_funding) as u64)
        };

        require!(return_usdc >= min_usdc_out, PerpError::SlippageExceeded);

        // Update reserves (reverse the open operation)
        match position.side {
            PositionSide::Long => {
                market.base_asset_reserve = market.base_asset_reserve.saturating_add(position.base_amount);
                market.quote_asset_reserve = market.quote_asset_reserve.saturating_sub(position.notional_usdc);
                market.long_open_interest = market.long_open_interest.saturating_sub(position.base_amount);
            }
            PositionSide::Short => {
                market.base_asset_reserve = market.base_asset_reserve.saturating_sub(position.base_amount);
                market.quote_asset_reserve = market.quote_asset_reserve.saturating_add(position.notional_usdc);
                market.short_open_interest = market.short_open_interest.saturating_sub(position.base_amount);
            }
        }

        market.last_mark_price = vamm::mark_price(
            market.base_asset_reserve,
            market.quote_asset_reserve,
        ).unwrap_or(market.last_mark_price);

        emit!(PositionClosedEvent {
            trader: ctx.accounts.trader.key(),
            market: ctx.accounts.market.key(),
            side: position.side,
            base_amount: position.base_amount,
            entry_price: position.entry_price,
            exit_price: current_mark,
            realized_pnl: pnl_with_funding,
            return_usdc,
            timestamp: clock.unix_timestamp,
        });

        Ok(())
    }
}

#[event]
pub struct MarketCreatedEvent {
    pub base_mint: Pubkey,
    pub market_symbol: String,
    pub tier: MarketTier,
    pub spot_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionOpenedEvent {
    pub trader: Pubkey,
    pub market: Pubkey,
    pub side: PositionSide,
    pub base_amount: u64,
    pub notional_usdc: u64,
    pub collateral_usdc: u64,
    pub leverage: u8,
    pub entry_price: u64,
    pub liquidation_price: u64,
    pub timestamp: i64,
}

#[event]
pub struct PositionClosedEvent {
    pub trader: Pubkey,
    pub market: Pubkey,
    pub side: PositionSide,
    pub base_amount: u64,
    pub entry_price: u64,
    pub exit_price: u64,
    pub realized_pnl: i64,
    pub return_usdc: u64,
    pub timestamp: i64,
}
