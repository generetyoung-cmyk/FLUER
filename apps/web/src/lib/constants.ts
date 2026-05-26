// ── FLUER Protocol — Constants ────────────────────────────────

// Solana RPC — use Helius for reliable mainnet access
export const SOLANA_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_HELIUS_RPC_URL ??
  `https://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

export const SOLANA_WS_ENDPOINT =
  process.env.NEXT_PUBLIC_HELIUS_WS_URL ??
  `wss://mainnet.helius-rpc.com/?api-key=${process.env.NEXT_PUBLIC_HELIUS_API_KEY}`;

// Program IDs — update after deployment
export const PROGRAM_IDS = {
  LAUNCHPAD:   process.env.NEXT_PUBLIC_LAUNCHPAD_PROGRAM_ID   ?? "FLUERLnchPdxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  PERP_ENGINE: process.env.NEXT_PUBLIC_PERP_ENGINE_PROGRAM_ID ?? "FLUERPerpEngnxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  PREDICTION:  process.env.NEXT_PUBLIC_PREDICTION_PROGRAM_ID  ?? "FLUERPredctMrktxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  FLUER_TOKEN: process.env.NEXT_PUBLIC_FLUER_TOKEN_PROGRAM_ID ?? "FLUERTkn1111111111111111111111111111111111111",
} as const;

// $FLUER token mint address
export const FLUER_MINT = process.env.NEXT_PUBLIC_FLUER_MINT ?? "";

// Backend API base URL
export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "https://api.fluer.io";

// WebSocket endpoint for real-time data
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "wss://api.fluer.io/ws";

// GeckoTerminal API (no auth required for public endpoints)
export const GECKO_TERMINAL_API = "https://api.geckoterminal.com/api/v2";

// Pyth network hermes endpoint
export const PYTH_HERMES_URL = "https://hermes.pyth.network";

// Solana explorer URL (mainnet)
export const EXPLORER_URL = "https://solscan.io";

// FLUER brand
export const FLUER_SUFFIX = " \u{00B7} FLUER"; // " · FLUER"
export const FLUER_VANITY_SUFFIX = "flur";

// Launchpad constraints
export const LAUNCHPAD = {
  MAX_NAME_USER_CHARS: 24,     // User portion, suffix added automatically
  MAX_SYMBOL_CHARS: 8,
  MAX_DESCRIPTION_CHARS: 500,
  MAX_IMAGE_SIZE_MB: 2,
  CREATION_FEE_FLUER: 50,      // $FLUER tokens
  INITIAL_VIRTUAL_SOL: 30,     // SOL
  GRADUATION_SOL_THRESHOLD: 85, // SOL
  ANTI_SNIPE_WINDOW_SECS: 30,
  ANTI_SNIPE_MAX_SOL: 0.1,
} as const;

// Perpetual market constraints
export const PERP = {
  MAX_LEVERAGE: 5,
  TAKER_FEE_BPS: 10,           // 0.1%
  MAKER_REBATE_BPS: 2,         // 0.02%
  MAINTENANCE_MARGIN_BPS: 625, // 6.25%
  INITIAL_MARGIN_BPS: 2000,    // 20%
  FUNDING_INTERVAL_SECS: 3600, // 1 hour
  MIN_COLLATERAL_USD: 1,
  MAX_POSITION_USD: 100_000,
} as const;

// Prediction market constraints
export const PREDICTION = {
  CREATION_FEE_FLUER: 50,
  MIN_BET_USD: 0.5,
  CREATOR_ROYALTY_PCT: 0.5,
  PROTOCOL_FEE_PCT: 2,
} as const;

// Chart configuration
export const CHART = {
  DEFAULT_RESOLUTION: "1h",
  RESOLUTIONS: ["1m", "5m", "15m", "1h", "4h", "1d", "1w"] as const,
  DEFAULT_BARS: 500,
  MAX_BARS: 5000,
} as const;

// Format helpers
export const FORMAT = {
  MAX_PRICE_DECIMALS: 8,
  DEFAULT_PRICE_DECIMALS: 4,
} as const;
