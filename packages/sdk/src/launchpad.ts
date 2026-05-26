/**
 * FLUER Protocol SDK — Launchpad Module
 *
 * Provides typed interfaces and helpers for:
 *  - Computing buy/sell amounts on the bonding curve
 *  - Building create_token, buy_on_curve, sell_on_curve transactions
 *  - Fetching listing state from on-chain accounts
 */

import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  SYSVAR_RENT_PUBKEY,
  type Signer,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
} from "@solana/spl-token";
import BN from "bn.js";
import type { AnchorProvider, Program } from "@coral-xyz/anchor";

// ── Constants ─────────────────────────────────────────────────

export const FLUER_SUFFIX = " \u{00B7} FLUER";
export const INITIAL_VIRTUAL_SOL_LAMPORTS = new BN(30_000_000_000);
export const INITIAL_VIRTUAL_TOKENS = new BN("1073000191000000");
export const GRADUATION_SOL_THRESHOLD_LAMPORTS = new BN(85_000_000_000);
export const TOTAL_SUPPLY = new BN("1000000000000000");
export const CURVE_SUPPLY = new BN("800000000000000");
export const CREATION_FEE_FLUER = new BN(50_000_000);
export const PLATFORM_FEE_BPS = 100;
export const TOKEN_DECIMALS = 6;

// ── PDA helpers ───────────────────────────────────────────────

export function getConfigPDA(programId: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from("config")], programId);
}

export function getListingPDA(
  programId: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("listing"), mint.toBuffer()],
    programId
  );
}

export function getVaultPDA(
  programId: PublicKey,
  mint: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("vault"), mint.toBuffer()],
    programId
  );
}

export function getCreatorProfilePDA(
  programId: PublicKey,
  creator: PublicKey
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("creator"), creator.toBuffer()],
    programId
  );
}

// ── Bonding curve math (client-side, mirrors on-chain) ────────

/**
 * Compute tokens out for a SOL buy (no fee applied)
 * Returns BigInt token amount (with 6 decimals)
 */
export function computeTokensOut(
  virtualSolLamports: bigint,
  virtualTokens: bigint,
  solInLamports: bigint
): bigint {
  if (solInLamports <= 0n || virtualSolLamports <= 0n || virtualTokens <= 0n) {
    return 0n;
  }
  const k = virtualSolLamports * virtualTokens;
  const newVSol = virtualSolLamports + solInLamports;
  const newVToken = k / newVSol;
  return virtualTokens - newVToken;
}

/**
 * Compute SOL out for a token sell (no fee applied)
 */
export function computeSolOut(
  virtualSolLamports: bigint,
  virtualTokens: bigint,
  tokensIn: bigint
): bigint {
  if (tokensIn <= 0n || virtualSolLamports <= 0n || virtualTokens <= 0n) {
    return 0n;
  }
  const k = virtualSolLamports * virtualTokens;
  const newVToken = virtualTokens + tokensIn;
  const newVSol = k / newVToken;
  return virtualSolLamports - newVSol;
}

/**
 * Apply platform fee to an amount
 * Returns { net, fee }
 */
export function applyFee(
  amount: bigint,
  feeBps: number = PLATFORM_FEE_BPS
): { net: bigint; fee: bigint } {
  const fee = (amount * BigInt(feeBps)) / 10_000n;
  return { net: amount - fee, fee };
}

/**
 * Current spot price in lamports per token unit (scaled by 1e9)
 */
export function spotPrice(
  virtualSolLamports: bigint,
  virtualTokens: bigint
): bigint {
  if (virtualTokens === 0n) return 0n;
  return (virtualSolLamports * 1_000_000_000n) / virtualTokens;
}

/**
 * Graduation progress as a percentage (0-100)
 */
export function graduationProgress(realSolLamports: bigint): number {
  const threshold = BigInt(GRADUATION_SOL_THRESHOLD_LAMPORTS.toString());
  if (realSolLamports >= threshold) return 100;
  return Number((realSolLamports * 100n) / threshold);
}

// ── Token name validation ─────────────────────────────────────

/**
 * Validate a token name and return the full name with FLUER suffix
 * Throws if validation fails
 */
export function buildFullTokenName(userNamePart: string): string {
  if (!userNamePart || userNamePart.trim().length === 0) {
    throw new Error("Token name is required");
  }
  if (userNamePart.length > 24) {
    throw new Error("Token name must be 24 characters or less (excluding · FLUER suffix)");
  }
  return `${userNamePart.trim()}${FLUER_SUFFIX}`;
}

/**
 * Validate token symbol: max 8 alphanumeric chars
 */
export function validateSymbol(symbol: string): void {
  if (!symbol || symbol.length === 0) throw new Error("Symbol is required");
  if (symbol.length > 8) throw new Error("Symbol must be 8 characters or less");
  if (!/^[A-Za-z0-9]+$/.test(symbol)) {
    throw new Error("Symbol must be alphanumeric only");
  }
}

// ── Listing state parser ──────────────────────────────────────

export interface ListingState {
  mint: PublicKey;
  creator: PublicKey;
  name: string;
  symbol: string;
  metadataUri: string;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  tokensSold: bigint;
  holderCount: number;
  buyCount: bigint;
  sellCount: bigint;
  createdAt: number;
  graduated: boolean;
  graduatedAt: number | null;
  bump: number;
  /** Derived: current spot price in lamports per token unit * 1e9 */
  currentPrice: bigint;
  /** Derived: graduation progress 0-100 */
  progressPct: number;
}

export function parseListingAccount(data: Buffer): ListingState {
  // Skip 8-byte discriminator
  let offset = 8;

  const mint = new PublicKey(data.slice(offset, offset + 32)); offset += 32;
  const creator = new PublicKey(data.slice(offset, offset + 32)); offset += 32;

  const nameRaw = data.slice(offset, offset + 32).toString("utf8").replace(/\0/g, "");
  offset += 32;
  const symbolRaw = data.slice(offset, offset + 8).toString("utf8").replace(/\0/g, "");
  offset += 8;
  const uriRaw = data.slice(offset, offset + 128).toString("utf8").replace(/\0/g, "");
  offset += 128;

  const virtualSol = data.readBigUInt64LE(offset); offset += 8;
  const virtualToken = data.readBigUInt64LE(offset); offset += 8;
  const realSol = data.readBigUInt64LE(offset); offset += 8;
  const tokensSold = data.readBigUInt64LE(offset); offset += 8;
  const holderCount = data.readUInt32LE(offset); offset += 4;
  offset += 8 + 8; // skip volume fields
  const buyCount = data.readBigUInt64LE(offset); offset += 8;
  const sellCount = data.readBigUInt64LE(offset); offset += 8;
  const createdAt = Number(data.readBigInt64LE(offset)); offset += 8;
  const graduatedAt = Number(data.readBigInt64LE(offset)); offset += 8;
  const graduated = data.readUInt8(offset) === 1; offset += 1;
  offset += 1; // category
  const bump = data.readUInt8(data.length - 1);

  return {
    mint, creator,
    name: nameRaw,
    symbol: symbolRaw,
    metadataUri: uriRaw,
    virtualSolReserves: virtualSol,
    virtualTokenReserves: virtualToken,
    realSolReserves: realSol,
    tokensSold,
    holderCount,
    buyCount, sellCount,
    createdAt,
    graduated,
    graduatedAt: graduatedAt === 0 ? null : graduatedAt,
    bump,
    currentPrice: spotPrice(virtualSol, virtualToken),
    progressPct: graduationProgress(realSol),
  };
}

/**
 * Fetch and parse a token listing from on-chain
 */
export async function fetchListing(
  connection: Connection,
  programId: PublicKey,
  mint: PublicKey
): Promise<ListingState | null> {
  const [listingPDA] = getListingPDA(programId, mint);
  const account = await connection.getAccountInfo(listingPDA);
  if (!account) return null;
  return parseListingAccount(account.data);
}

// ── SDK Client class ─────────────────────────────────────────

export interface FluerSDKConfig {
  connection: Connection;
  launchpadProgramId: PublicKey;
  fluerMint: PublicKey;
  wallet?: { publicKey: PublicKey; signTransaction: (tx: Transaction) => Promise<Transaction> };
}

export class FluerLaunchpadClient {
  private connection: Connection;
  private programId: PublicKey;
  private fluerMint: PublicKey;

  constructor(config: FluerSDKConfig) {
    this.connection = config.connection;
    this.programId = config.launchpadProgramId;
    this.fluerMint = config.fluerMint;
  }

  /** Get listing state for a token */
  async getListing(mint: PublicKey): Promise<ListingState | null> {
    return fetchListing(this.connection, this.programId, mint);
  }

  /** Preview: how many tokens would I get for X SOL? */
  async previewBuy(
    mint: PublicKey,
    solInLamports: bigint
  ): Promise<{
    tokensOut: bigint;
    tokensOutHuman: number;
    pricePerToken: bigint;
    priceImpactBps: number;
    fee: bigint;
    netSol: bigint;
  }> {
    const listing = await this.getListing(mint);
    if (!listing) throw new Error("Token listing not found");
    if (listing.graduated) throw new Error("Token has graduated — trade on Raydium/Perp");

    const { net, fee } = applyFee(solInLamports);
    const tokensOut = computeTokensOut(
      listing.virtualSolReserves,
      listing.virtualTokenReserves,
      net
    );

    const priceBefore = spotPrice(listing.virtualSolReserves, listing.virtualTokenReserves);
    const priceAfter = spotPrice(
      listing.virtualSolReserves + net,
      listing.virtualTokenReserves - tokensOut
    );
    const priceImpactBps = Number(
      ((priceAfter - priceBefore) * 10_000n) / priceBefore
    );

    return {
      tokensOut,
      tokensOutHuman: Number(tokensOut) / 1_000_000,
      pricePerToken: net / tokensOut,
      priceImpactBps,
      fee,
      netSol: net,
    };
  }

  /** Preview: how much SOL would I get for X tokens? */
  async previewSell(
    mint: PublicKey,
    tokensIn: bigint
  ): Promise<{
    solOut: bigint;
    solOutHuman: number;
    fee: bigint;
    netSol: bigint;
  }> {
    const listing = await this.getListing(mint);
    if (!listing) throw new Error("Token listing not found");

    const solGross = computeSolOut(
      listing.virtualSolReserves,
      listing.virtualTokenReserves,
      tokensIn
    );
    const { net, fee } = applyFee(solGross);

    return {
      solOut: solGross,
      solOutHuman: Number(net) / 1_000_000_000,
      fee,
      netSol: net,
    };
  }
}
