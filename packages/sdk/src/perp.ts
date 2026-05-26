/**
 * FLUER Protocol SDK — Perpetual Engine Module
 * Phase 2 helpers for interacting with fluer_perp_engine program
 */

import type { Connection } from "@solana/web3.js";
import { PublicKey } from "@solana/web3.js";

// ── vAMM price impact math (mirrors Rust on-chain math) ───────

export function computeOpenLong(
  baseReserve: bigint,
  quoteReserve: bigint,
  quoteAmount: bigint
): { baseOut: bigint; entryPrice: bigint; priceImpactBps: number } {
  if (quoteAmount <= 0n || baseReserve <= 0n || quoteReserve <= 0n) {
    throw new Error("Invalid reserves or amount");
  }

  const k = baseReserve * quoteReserve;
  const newQuote = quoteReserve + quoteAmount;
  const newBase = k / newQuote;
  const baseOut = baseReserve - newBase;

  if (baseOut <= 0n) throw new Error("Zero base output — position too small");

  const entryPrice = (quoteAmount * 1_000_000n) / baseOut;

  // Price before: quote/base * 1e6
  const priceBefore = (quoteReserve * 1_000_000n) / baseReserve;
  const priceAfter = (newQuote * 1_000_000n) / newBase;
  const priceImpactBps = Number(
    ((priceAfter - priceBefore) * 10_000n) / priceBefore
  );

  return { baseOut, entryPrice, priceImpactBps };
}

export function computeOpenShort(
  baseReserve: bigint,
  quoteReserve: bigint,
  baseAmount: bigint
): { quoteOut: bigint; entryPrice: bigint; priceImpactBps: number } {
  const k = baseReserve * quoteReserve;
  const newBase = baseReserve + baseAmount;
  const newQuote = k / newBase;
  const quoteOut = quoteReserve - newQuote;

  if (quoteOut <= 0n) throw new Error("Zero quote output");

  const entryPrice = (quoteOut * 1_000_000n) / baseAmount;

  const priceBefore = (quoteReserve * 1_000_000n) / baseReserve;
  const priceAfter = (newQuote * 1_000_000n) / newBase;
  const priceImpactBps = Number(
    ((priceBefore - priceAfter) * 10_000n) / priceBefore
  );

  return { quoteOut, entryPrice, priceImpactBps };
}

export function markPrice(baseReserve: bigint, quoteReserve: bigint): bigint {
  if (baseReserve === 0n) return 0n;
  return (quoteReserve * 1_000_000n) / baseReserve;
}

export function longLiquidationPrice(
  entryPrice: bigint,
  leverage: number,
  maintenanceMarginBps: number
): bigint {
  // liq = entry * (1 - 1/leverage + maintMargin)
  const numeratorBps =
    10_000n -
    10_000n / BigInt(leverage) +
    BigInt(maintenanceMarginBps);
  return (entryPrice * numeratorBps) / 10_000n;
}

export function shortLiquidationPrice(
  entryPrice: bigint,
  leverage: number,
  maintenanceMarginBps: number
): bigint {
  const numeratorBps =
    10_000n +
    10_000n / BigInt(leverage) -
    BigInt(maintenanceMarginBps);
  return (entryPrice * numeratorBps) / 10_000n;
}

export function longPnl(
  baseAmount: bigint,
  entryPrice: bigint,
  currentPrice: bigint
): bigint {
  return ((currentPrice - entryPrice) * baseAmount) / 1_000_000n;
}

export function shortPnl(
  baseAmount: bigint,
  entryPrice: bigint,
  currentPrice: bigint
): bigint {
  return ((entryPrice - currentPrice) * baseAmount) / 1_000_000n;
}

// ── PDA helpers ──────────────────────────────────────────────

export function getMarketPDA(programId: PublicKey, baseMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("market"), baseMint.toBuffer()],
    programId
  );
}

export function getPositionPDA(
  programId: PublicKey,
  trader: PublicKey,
  market: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), trader.toBuffer(), market.toBuffer()],
    programId
  );
}
