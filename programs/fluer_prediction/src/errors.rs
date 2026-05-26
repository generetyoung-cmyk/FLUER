use anchor_lang::prelude::*;

#[error_code]
pub enum PredictionError {
    #[msg("Program is paused")]
    Paused,
    #[msg("Market is closed — resolution already set")]
    MarketClosed,
    #[msg("Market has expired — no more bets accepted")]
    MarketExpired,
    #[msg("Market has not been resolved yet")]
    MarketNotResolved,
    #[msg("Market already resolved")]
    AlreadyResolved,
    #[msg("Position already claimed")]
    AlreadyClaimed,
    #[msg("Bet amount below minimum")]
    BetTooSmall,
    #[msg("Insufficient FLUER balance for creation fee")]
    InsufficientFluerFee,
    #[msg("Title too long — max 96 chars")]
    TitleTooLong,
    #[msg("Description too long — max 256 chars")]
    DescriptionTooLong,
    #[msg("Expiry must be in the future")]
    ExpiryInPast,
    #[msg("Expiry cannot exceed 90 days from now")]
    ExpiryTooFar,
    #[msg("Slippage exceeded — shares below minimum")]
    SlippageExceeded,
    #[msg("You already have a position on the other side")]
    WrongSide,
    #[msg("Arithmetic overflow")]
    Overflow,
    #[msg("Unauthorized — caller is not the admin")]
    Unauthorized,
    #[msg("Invalid resolution outcome")]
    InvalidResolution,
    #[msg("Oracle price stale or unavailable")]
    OracleStale,
}
