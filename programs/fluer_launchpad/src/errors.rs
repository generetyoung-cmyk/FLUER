use anchor_lang::prelude::*;

#[error_code]
pub enum LaunchpadError {
    // Token naming errors
    #[msg("Token name must end with ' \u{00B7} FLUER'")]
    InvalidNameSuffix,
    #[msg("Token name too long — max 24 chars before suffix")]
    NameTooLong,
    #[msg("Token symbol too long — max 8 alphanumeric chars")]
    SymbolTooLong,
    #[msg("Token symbol contains invalid characters — only alphanumeric allowed")]
    InvalidSymbolChars,
    #[msg("Description too long — max 500 chars")]
    DescriptionTooLong,
    #[msg("Metadata URI too long or invalid")]
    InvalidMetadataUri,

    // Curve errors
    #[msg("Insufficient SOL — amount too small to execute")]
    InsufficientSolAmount,
    #[msg("Slippage exceeded — price moved beyond tolerance")]
    SlippageExceeded,
    #[msg("Bonding curve is fully graduated — no more curve trades")]
    CurveGraduated,
    #[msg("Arithmetic overflow in bonding curve calculation")]
    MathOverflow,
    #[msg("Arithmetic underflow in bonding curve calculation")]
    MathUnderflow,
    #[msg("Division by zero in bonding curve")]
    DivisionByZero,
    #[msg("Zero tokens output — position too small")]
    ZeroTokensOut,
    #[msg("Zero SOL output — position too small")]
    ZeroSolOut,

    // Anti-bot errors
    #[msg("Anti-snipe: purchase exceeds max allowed in first 30 seconds")]
    AntiBotMaxPurchaseExceeded,
    #[msg("Anti-bot cooldown: too many transactions from this wallet")]
    AntiBotCooldownActive,

    // Fee errors
    #[msg("Insufficient FLUER balance for creation fee")]
    InsufficientFluerFee,
    #[msg("FLUER fee transfer failed")]
    FeeTransferFailed,

    // Authorization errors
    #[msg("Unauthorized — only admin can call this instruction")]
    Unauthorized,
    #[msg("Program is paused — operations temporarily suspended")]
    ProgramPaused,
    #[msg("Market has not graduated yet")]
    NotGraduated,
    #[msg("Creator rewards not yet available")]
    RewardsNotAvailable,
    #[msg("Creator rewards still vesting")]
    RewardsStillVesting,

    // Graduation errors
    #[msg("Graduation criteria not met")]
    GraduationCriteriaNotMet,
    #[msg("SOL price oracle stale or invalid")]
    OracleStale,
    #[msg("Oracle confidence interval too wide")]
    OracleConfidenceTooWide,
}
