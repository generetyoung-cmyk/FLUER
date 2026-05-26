import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { EXPLORER_URL, FLUER_SUFFIX } from "./constants";

// ── Tailwind class merging ────────────────────────────────────

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ── Number formatting ─────────────────────────────────────────

/** Format USD value with appropriate scale suffix */
export function formatUSD(
  value: number,
  opts: { decimals?: number; compact?: boolean; prefix?: boolean } = {}
): string {
  const { decimals = 2, compact = true, prefix = true } = opts;
  const sign = prefix ? "$" : "";

  if (!isFinite(value) || isNaN(value)) return `${sign}0`;

  const abs = Math.abs(value);

  if (compact) {
    if (abs >= 1_000_000_000)
      return `${sign}${(value / 1_000_000_000).toFixed(decimals)}B`;
    if (abs >= 1_000_000)
      return `${sign}${(value / 1_000_000).toFixed(decimals)}M`;
    if (abs >= 1_000)
      return `${sign}${(value / 1_000).toFixed(decimals)}K`;
  }

  return `${sign}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Format a token price with smart precision */
export function formatPrice(price: number, opts: { decimals?: number } = {}): string {
  if (!isFinite(price) || isNaN(price) || price === 0) return "0.00";

  // Smart precision based on price magnitude
  if (opts.decimals !== undefined) {
    return price.toFixed(opts.decimals);
  }

  if (price >= 1000)   return price.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (price >= 1)      return price.toFixed(4);
  if (price >= 0.001)  return price.toFixed(6);
  if (price >= 0.0001) return price.toFixed(8);

  // Very small prices — use scientific notation threshold
  if (price < 0.000001) {
    const str = price.toFixed(12);
    const trimmed = str.replace(/\.?0+$/, "");
    return trimmed;
  }

  return price.toFixed(8);
}

/** Format SOL amount */
export function formatSOL(lamports: number, opts: { full?: boolean } = {}): string {
  const sol = lamports / 1_000_000_000;
  if (opts.full) return `${sol.toFixed(4)} SOL`;
  if (sol >= 1000) return `${(sol / 1000).toFixed(2)}K SOL`;
  if (sol >= 1) return `${sol.toFixed(3)} SOL`;
  return `${sol.toFixed(6)} SOL`;
}

/** Format a percentage change with sign */
export function formatChange(pct: number, opts: { digits?: number } = {}): string {
  const digits = opts.digits ?? 2;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(digits)}%`;
}

/** Format a large count (e.g., holder count) */
export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString("en-US");
}

/** Format funding rate */
export function formatFunding(rateBps: number): string {
  // rateBps is hourly rate in bps * 100 (so 100 = 0.01%)
  const pct = rateBps / 100 / 100; // convert to percentage
  const sign = pct > 0 ? "+" : "";
  return `${sign}${(pct * 100).toFixed(4)}%/h`;
}

// ── Address formatting ────────────────────────────────────────

export function truncateAddress(address: string, chars = 4): string {
  if (!address || address.length < chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
}

export function explorerUrl(type: "tx" | "address" | "token", id: string): string {
  switch (type) {
    case "tx":      return `${EXPLORER_URL}/tx/${id}`;
    case "address": return `${EXPLORER_URL}/account/${id}`;
    case "token":   return `${EXPLORER_URL}/token/${id}`;
  }
}

// ── Time formatting ───────────────────────────────────────────

export function timeAgo(timestamp: number): string {
  const now = Date.now() / 1000;
  const diff = now - timestamp;

  if (diff < 60)    return `${Math.floor(diff)}s ago`;
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60)   return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatTimestamp(ts: number, opts: { includeTime?: boolean } = {}): string {
  const d = new Date(ts * 1000);
  if (opts.includeTime) {
    return d.toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Token helpers ─────────────────────────────────────────────

/** Strip " · FLUER" suffix for display */
export function stripFluerSuffix(name: string): string {
  return name.replace(FLUER_SUFFIX, "").trim();
}

/** Add " · FLUER" suffix if not already present */
export function ensureFluerSuffix(name: string): string {
  if (name.endsWith(FLUER_SUFFIX)) return name;
  return `${name}${FLUER_SUFFIX}`;
}

/** Validate symbol: max 8 alphanumeric chars */
export function validateSymbol(symbol: string): string | null {
  if (symbol.length === 0) return "Symbol is required";
  if (symbol.length > 8) return "Symbol must be 8 characters or less";
  if (!/^[A-Za-z0-9]+$/.test(symbol)) return "Only letters and numbers allowed";
  return null;
}

/** Validate token name user portion */
export function validateTokenName(name: string): string | null {
  if (name.length === 0) return "Name is required";
  if (name.length > 24) return "Name must be 24 characters or less";
  return null;
}

// ── Bonding curve math (client-side preview) ──────────────────

/**
 * Estimate tokens out for a given SOL buy (no fee)
 * Uses same constant-product formula as the on-chain program
 */
export function estimateTokensOut(
  virtualSol: number,
  virtualTokens: number,
  solIn: number
): number {
  if (solIn <= 0 || virtualSol <= 0 || virtualTokens <= 0) return 0;
  const k = virtualSol * virtualTokens;
  const newVSol = virtualSol + solIn;
  const newVToken = k / newVSol;
  return Math.max(0, virtualTokens - newVToken);
}

/**
 * Estimate SOL out for a given token sell
 */
export function estimateSolOut(
  virtualSol: number,
  virtualTokens: number,
  tokensIn: number
): number {
  if (tokensIn <= 0 || virtualSol <= 0 || virtualTokens <= 0) return 0;
  const k = virtualSol * virtualTokens;
  const newVToken = virtualTokens + tokensIn;
  const newVSol = k / newVToken;
  return Math.max(0, virtualSol - newVSol);
}

/** Current spot price from reserves (SOL per token unit) */
export function spotPrice(virtualSol: number, virtualTokens: number): number {
  if (virtualTokens <= 0) return 0;
  return virtualSol / virtualTokens;
}

/** Graduation progress 0–100% */
export function graduationProgress(realSolRaised: number, thresholdSol = 85): number {
  return Math.min(100, (realSolRaised / thresholdSol) * 100);
}

// ── Class helpers ─────────────────────────────────────────────

export function priceChangeColor(change: number): string {
  if (change > 0) return "text-positive";
  if (change < 0) return "text-negative";
  return "text-text-secondary";
}

export function sideColor(side: string): string {
  return side.toLowerCase() === "long" ? "text-positive" : "text-negative";
}

export function sideBg(side: string): string {
  return side.toLowerCase() === "long" ? "bg-bg-positive" : "bg-bg-negative";
}
