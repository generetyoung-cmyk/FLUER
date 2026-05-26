import axios from "axios";
import { GECKO_TERMINAL_API } from "@/lib/constants";

const gecko = axios.create({
  baseURL: GECKO_TERMINAL_API,
  timeout: 10_000,
  headers: { Accept: "application/json;version=20230302" },
});

// ── Token pools on Solana ─────────────────────────────────────

export interface GeckoPool {
  id: string;
  attributes: {
    address: string;
    name: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    base_token_price_native_currency: string;
    price_change_percentage: {
      m5: string; h1: string; h6: string; h24: string;
    };
    transactions: {
      m5: { buys: number; sells: number };
      h1: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume_usd: { m5: string; h1: string; h6: string; h24: string };
    liquidity_usd: string;
    market_cap_usd: string | null;
    fdv_usd: string | null;
    reserve_in_usd: string;
    pool_created_at: string;
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    dex: { data: { id: string } };
  };
}

export interface GeckoToken {
  id: string;
  attributes: {
    address: string;
    name: string;
    symbol: string;
    decimals: number;
    image_url: string | null;
    coingecko_coin_id: string | null;
    price_usd: string | null;
    fdv_usd: string | null;
    total_reserve_in_usd: string | null;
    volume_usd: { h24: string };
    market_cap_usd: string | null;
  };
}

export interface GeckoOHLCV {
  data: {
    id: string;
    attributes: {
      ohlcv_list: [number, number, number, number, number, number][];
      // [timestamp, open, high, low, close, volume]
    };
  };
}

/**
 * Get trending pools on Solana (real-time data from GeckoTerminal)
 */
export async function getTrendingPools(limit = 50): Promise<GeckoPool[]> {
  const { data } = await gecko.get(
    `/networks/solana/trending_pools?include=base_token,quote_token,dex&page=1`
  );
  return (data.data as GeckoPool[]).slice(0, limit);
}

/**
 * Get new pools on Solana (last 24 hours)
 */
export async function getNewPools(limit = 50): Promise<GeckoPool[]> {
  const { data } = await gecko.get(
    `/networks/solana/new_pools?include=base_token,quote_token,dex&page=1`
  );
  return (data.data as GeckoPool[]).slice(0, limit);
}

/**
 * Get pool data for a specific Solana pool address
 */
export async function getPool(poolAddress: string): Promise<GeckoPool | null> {
  try {
    const { data } = await gecko.get(
      `/networks/solana/pools/${poolAddress}?include=base_token,quote_token,dex`
    );
    return data.data as GeckoPool;
  } catch {
    return null;
  }
}

/**
 * Get OHLCV candles for a pool
 * resolution: minute | hour | day
 * aggregate: 1|5|15 (for minute), 1|4|12 (for hour), 1 (for day)
 */
export async function getPoolOHLCV(
  poolAddress: string,
  resolution: "minute" | "hour" | "day" = "hour",
  aggregate: number = 1,
  limit = 500,
  beforeTimestamp?: number
): Promise<[number, number, number, number, number, number][]> {
  const params: Record<string, string | number> = {
    aggregate,
    limit,
  };
  if (beforeTimestamp) params.before_timestamp = beforeTimestamp;

  const { data } = await gecko.get<GeckoOHLCV>(
    `/networks/solana/pools/${poolAddress}/ohlcv/${resolution}`,
    { params }
  );
  return data.data.attributes.ohlcv_list;
}

/**
 * Search tokens/pools by query string
 */
export async function searchTokens(query: string): Promise<{
  pools: GeckoPool[];
  tokens: GeckoToken[];
}> {
  const { data } = await gecko.get(
    `/search/pools?query=${encodeURIComponent(query)}&network=solana&include=base_token,quote_token`
  );
  return {
    pools: data.data ?? [],
    tokens: data.included?.filter((i: any) => i.type === "token") ?? [],
  };
}

/**
 * Get token info for a specific Solana token address
 */
export async function getTokenInfo(mintAddress: string): Promise<GeckoToken | null> {
  try {
    const { data } = await gecko.get(
      `/networks/solana/tokens/${mintAddress}?include=top_pools`
    );
    return data.data as GeckoToken;
  } catch {
    return null;
  }
}

/**
 * Get top pools for a token (for price chart)
 */
export async function getTokenTopPools(mintAddress: string): Promise<GeckoPool[]> {
  const { data } = await gecko.get(
    `/networks/solana/tokens/${mintAddress}/pools?include=base_token,quote_token,dex&page=1`
  );
  return data.data ?? [];
}

/**
 * Normalize GeckoTerminal resolution to our chart format
 */
export function geckoCandlesToBars(
  ohlcvList: [number, number, number, number, number, number][]
) {
  return ohlcvList.map(([time, open, high, low, close, volume]) => ({
    time,
    open,
    high,
    low,
    close,
    volume,
  }));
}

/**
 * Map our chart resolution string to GeckoTerminal params
 */
export function resolutionToGeckoParams(resolution: string): {
  type: "minute" | "hour" | "day";
  aggregate: number;
} {
  switch (resolution) {
    case "1m":  return { type: "minute", aggregate: 1 };
    case "5m":  return { type: "minute", aggregate: 5 };
    case "15m": return { type: "minute", aggregate: 15 };
    case "1h":  return { type: "hour", aggregate: 1 };
    case "4h":  return { type: "hour", aggregate: 4 };
    case "1d":  return { type: "day", aggregate: 1 };
    case "1w":  return { type: "day", aggregate: 7 };
    default:    return { type: "hour", aggregate: 1 };
  }
}
