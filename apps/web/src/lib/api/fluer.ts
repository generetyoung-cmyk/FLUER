import axios, { AxiosError } from "axios";
import { API_BASE_URL } from "@/lib/constants";
import type {
  PerpMarket,
  TokenListing,
  PredictionMarket,
  PreparedLaunch,
  LaunchFormState,
  ProtocolStats,
  CandleBar,
  RecentTrade,
  Position,
  DiscoveryFilters,
} from "@/lib/types";

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { "Content-Type": "application/json" },
});

// Attach wallet auth token if present
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem("fluer_auth_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Markets ───────────────────────────────────────────────────

export async function listMarkets(params?: {
  page?: number;
  limit?: number;
  sort?: string;
  category?: string;
}): Promise<{ markets: PerpMarket[]; total: number }> {
  const { data } = await api.get("/api/v1/markets", { params });
  return data;
}

export async function getMarket(marketId: string): Promise<PerpMarket> {
  const { data } = await api.get(`/api/v1/markets/${marketId}`);
  return data;
}

export async function getCandles(
  marketId: string,
  resolution: string,
  from?: number,
  to?: number,
  limit?: number
): Promise<CandleBar[]> {
  const { data } = await api.get(`/api/v1/markets/${marketId}/candles`, {
    params: { resolution, from, to, limit },
  });
  return data.bars;
}

export async function getRecentTrades(marketId: string): Promise<RecentTrade[]> {
  const { data } = await api.get(`/api/v1/markets/${marketId}/trades`);
  return data.trades;
}

export async function getOrderbookDepth(marketId: string) {
  const { data } = await api.get(`/api/v1/markets/${marketId}/orderbook`);
  return data;
}

export async function getFundingHistory(marketId: string) {
  const { data } = await api.get(`/api/v1/markets/${marketId}/funding-history`);
  return data.history;
}

// ── Tokens ────────────────────────────────────────────────────

export async function listTokens(params?: {
  page?: number;
  limit?: number;
  sort?: string;
  category?: string;
  graduated?: boolean;
}): Promise<{ tokens: TokenListing[]; total: number }> {
  const { data } = await api.get("/api/v1/tokens", { params });
  return data;
}

export async function getToken(ca: string): Promise<TokenListing> {
  const { data } = await api.get(`/api/v1/tokens/${ca}`);
  return data;
}

export async function getTokenChart(
  ca: string,
  resolution: string,
  from?: number,
  to?: number
): Promise<CandleBar[]> {
  const { data } = await api.get(`/api/v1/tokens/${ca}/chart`, {
    params: { resolution, from, to },
  });
  return data.bars;
}

export async function getTrending(): Promise<TokenListing[]> {
  const { data } = await api.get("/api/v1/tokens/trending");
  return data.tokens;
}

// ── Launch ────────────────────────────────────────────────────

export async function uploadTokenImage(imageFile: File): Promise<{
  cid: string;
  url: string;
  gateway_url: string;
}> {
  const formData = new FormData();
  formData.append("image", imageFile);

  const { data } = await api.post("/api/v1/launch/upload-metadata", formData, {
    headers: { "Content-Type": "multipart/form-data" },
    timeout: 30_000,
  });
  return data;
}

export async function prepareLaunch(params: {
  name: string;
  symbol: string;
  description: string;
  category: string;
  creator_wallet: string;
  initial_buy_sol?: number;
  website?: string;
  twitter?: string;
  telegram?: string;
  anti_snipe?: boolean;
  image_cid: string;
  use_pumpportal?: boolean;
}): Promise<PreparedLaunch> {
  const { data } = await api.post("/api/v1/launch/prepare", params);
  return data;
}

export async function getVanityKeypair(): Promise<{
  pubkey: string;
  suffix: string;
  status: string;
}> {
  const { data } = await api.post("/api/v1/launch/vanity-keypair");
  return data;
}

export async function estimateLaunchFee(): Promise<{
  network_fee_sol: number;
  protocol_fee_fluer: number;
  total_estimated_sol: number;
}> {
  const { data } = await api.get("/api/v1/launch/estimate-fee");
  return data;
}

// ── Predictions ───────────────────────────────────────────────

export async function listPredictions(params?: {
  page?: number;
  limit?: number;
  status?: string;
  token?: string;
}): Promise<{ predictions: PredictionMarket[]; total: number }> {
  const { data } = await api.get("/api/v1/predictions", { params });
  return data;
}

export async function getPrediction(marketId: string): Promise<PredictionMarket> {
  const { data } = await api.get(`/api/v1/predictions/${marketId}`);
  return data;
}

export async function getPredictionsForToken(ca: string): Promise<PredictionMarket[]> {
  const { data } = await api.get(`/api/v1/predictions/token/${ca}`);
  return data.predictions;
}

// ── Portfolio ─────────────────────────────────────────────────

export async function getPositions(wallet: string): Promise<Position[]> {
  const { data } = await api.get(`/api/v1/positions/${wallet}`);
  return data.positions;
}

export async function getPortfolio(wallet: string) {
  const { data } = await api.get(`/api/v1/portfolio/${wallet}`);
  return data;
}

// ── Discovery ─────────────────────────────────────────────────

export async function discover(filters: Partial<DiscoveryFilters> & {
  page?: number;
  limit?: number;
}): Promise<{ tokens: TokenListing[]; markets: PerpMarket[]; total: number }> {
  const { data } = await api.get("/api/v1/discover", { params: filters });
  return data;
}

export async function search(query: string): Promise<{
  tokens: TokenListing[];
  markets: PerpMarket[];
  predictions: PredictionMarket[];
}> {
  const { data } = await api.get("/api/v1/search", { params: { q: query } });
  return data;
}

// ── Protocol Stats ────────────────────────────────────────────

export async function getProtocolStats(): Promise<ProtocolStats> {
  const { data } = await api.get("/api/v1/stats/protocol");
  return data;
}

// ── Error handling helper ─────────────────────────────────────

export function isApiError(err: unknown): err is AxiosError {
  return axios.isAxiosError(err);
}

export function getApiErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    return (
      (err.response?.data as any)?.message ??
      (err.response?.data as any)?.error ??
      err.message ??
      "Request failed"
    );
  }
  if (err instanceof Error) return err.message;
  return "Unknown error";
}
