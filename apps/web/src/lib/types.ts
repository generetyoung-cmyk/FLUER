// ── FLUER Protocol — Shared TypeScript Types ──────────────────

// ── Market / Perp ─────────────────────────────────────────────

export type MarketTier = 1 | 2 | 3;

export type TradeSide = "Long" | "Short";

export interface PerpMarket {
  id: string;
  base_mint: string;
  symbol: string;
  name: string;
  tier: MarketTier;
  mark_price: number;
  index_price: number;
  change_24h: number;
  volume_24h: number;
  long_oi: number;
  short_oi: number;
  long_oi_pct: number;
  short_oi_pct: number;
  funding_rate_hourly: number;
  next_funding_in: number; // seconds
  taker_fee_bps: number;
  maintenance_margin_bps: number;
  insurance_fund: number;
  created_at: number;
  active: boolean;
}

export interface CandleBar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RecentTrade {
  id: string;
  side: TradeSide;
  size_usd: number;
  price: number;
  trader: string;
  timestamp: number;
}

export interface Position {
  id: string;
  trader: string;
  market_id: string;
  market_symbol: string;
  side: TradeSide;
  base_amount: number;
  notional_usdc: number;
  collateral_usdc: number;
  leverage: number;
  entry_price: number;
  mark_price: number;
  liquidation_price: number;
  unrealized_pnl: number;
  unrealized_pnl_pct: number;
  funding_pnl: number;
  margin_ratio: number;
  opened_at: number;
}

export type OrderType = "Market" | "Limit";

export interface OrderFormState {
  side: TradeSide;
  collateral_usdc: string;
  leverage: number;
  order_type: OrderType;
  limit_price?: string;
  slippage_bps: number;
}

// ── Launchpad / Token ─────────────────────────────────────────

export type TokenCategory =
  | "Meme"
  | "DeFi"
  | "AI"
  | "Gaming"
  | "RWA"
  | "Social"
  | "Infrastructure"
  | "Other";

export type CreatorTier = "Bronze" | "Silver" | "Gold" | "Diamond";

export interface TokenListing {
  mint: string;
  creator: string;
  name: string;               // includes " · FLUER" suffix
  symbol: string;
  description: string;
  image_url: string;
  metadata_uri: string;
  category: TokenCategory;

  // Bonding curve state
  virtual_sol_reserves: number;
  virtual_token_reserves: number;
  real_sol_reserves: number;
  tokens_sold: number;
  total_supply: number;

  // Price
  price_sol: number;
  price_usd: number;
  market_cap_usd: number;

  // Progress toward graduation
  graduation_progress_pct: number;
  graduation_threshold_sol: number;

  // Analytics
  holder_count: number;
  volume_24h_usd: number;
  buy_count: number;
  sell_count: number;
  change_1h: number;
  change_24h: number;

  // Status
  graduated: boolean;
  graduated_at: number | null;
  perp_market_id: string | null;
  created_at: number;

  // Social links
  website?: string;
  twitter?: string;
  telegram?: string;
}

export interface CreatorProfile {
  wallet: string;
  tokens_created: number;
  tokens_graduated: number;
  pending_rewards_sol: number;
  total_claimed_sol: number;
  tier: CreatorTier;
}

export interface LaunchFormState {
  name: string;           // user portion (max 24 chars)
  symbol: string;
  description: string;
  image_file: File | null;
  image_preview: string | null;
  image_cid: string | null;
  category: TokenCategory;
  initial_buy_sol: string;
  anti_snipe: boolean;
  website: string;
  twitter: string;
  telegram: string;
}

export interface PreparedLaunch {
  full_name: string;
  metadata_uri: string;
  mint_pubkey: string;
  transaction_base64: string;
  fees: {
    network_fee_sol: number;
    protocol_fee_fluer: number;
    estimated_total_sol: number;
  };
}

// ── Prediction Market ─────────────────────────────────────────

export type PredictionType =
  | "PriceTarget"
  | "VolumeThreshold"
  | "HolderGrowth"
  | "ExchangeListing"
  | "Custom";

export type PredictionStatus =
  | "Active"
  | "Resolved"
  | "Void"
  | "Pending";

export type PredictionOutcome = "Yes" | "No" | "Void" | "Pending";

export interface PredictionMarket {
  id: string;
  token_mint: string;
  token_name: string;
  token_symbol: string;
  token_image: string;

  type: PredictionType;
  title: string;
  description: string;
  status: PredictionStatus;
  outcome: PredictionOutcome;

  yes_probability: number;   // 0-100
  no_probability: number;    // 0-100
  yes_pool_usd: number;
  no_pool_usd: number;
  total_volume_usd: number;

  resolution_timestamp: number;
  created_at: number;
  creator: string;

  // Market-specific params
  price_target?: number;
  holder_target?: number;
  volume_target?: number;
}

// ── WebSocket Events ──────────────────────────────────────────

export type WsEvent =
  | { type: "PRICE_UPDATE"; market_id: string; price: number; change_24h: number; volume_24h: number; timestamp: number }
  | { type: "TRADE"; market_id: string; side: string; size_usd: number; price: number; timestamp: number }
  | { type: "FUNDING_RATE"; market_id: string; rate_hourly: number; timestamp: number }
  | { type: "TOKEN_LAUNCHED"; mint: string; name: string; symbol: string; creator: string; timestamp: number }
  | { type: "TOKEN_GRADUATED"; mint: string; name: string; symbol: string; perp_market_id: string | null; timestamp: number }
  | { type: "CURVE_TRADE"; mint: string; side: string; sol_amount: number; token_amount: number; price_usd: number; trader: string; timestamp: number }
  | { type: "PREDICTION_CREATED"; market_id: string; token_mint: string; title: string; timestamp: number }
  | { type: "PREDICTION_RESOLVED"; market_id: string; outcome: string; timestamp: number }
  | { type: "LIQUIDATION"; market_id: string; trader: string; side: string; size_usd: number; timestamp: number }
  | { type: "PROTOCOL_STATS"; total_volume_24h: number; active_markets: number; total_oi: number; active_predictions: number; timestamp: number };

// ── Discovery ─────────────────────────────────────────────────

export type DiscoveryTab =
  | "trending"
  | "new"
  | "graduated"
  | "perps"
  | "predictions"
  | "high_volume";

export interface DiscoveryFilters {
  tab: DiscoveryTab;
  categories: TokenCategory[];
  graduation_status: "all" | "curve" | "graduated";
  sort: "volume" | "trending" | "newest" | "market_cap";
  min_volume: number | null;
  max_volume: number | null;
}

// ── Protocol Stats ────────────────────────────────────────────

export interface ProtocolStats {
  total_volume_24h: number;
  active_markets: number;
  total_oi: number;
  active_predictions: number;
  total_tokens_launched: number;
  total_graduated: number;
  total_fees_collected: number;
  timestamp: number;
}
