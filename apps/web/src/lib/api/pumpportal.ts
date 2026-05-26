import axios from "axios";

// ── PumpPortal API ─────────────────────────────────────────────
// Phase 1 launchpad integration: token creation via pump.fun infrastructure
// Phase 2: native FLUER launchpad program (fluer_launchpad)
//
// PumpPortal docs: https://pumpportal.fun/api-documentation/

const PUMPPORTAL_BASE = "https://pumpportal.fun/api";

export interface PumpPortalCreateParams {
  /** Creator wallet public key */
  publicKey: string;
  /** Full token name including " · FLUER" suffix */
  name: string;
  /** Token symbol — max 8 chars */
  symbol: string;
  /** IPFS metadata URI */
  metadataUri: string;
  /** Vanity mint keypair public key (ends in 'flur') */
  mintPublicKey: string;
  /** Initial buy in SOL (0 for no dev buy) */
  initialBuySol?: number;
  /** Slippage in % (default: 15) */
  slippage?: number;
  /** Priority fee in SOL (default: 0.00005) */
  priorityFee?: number;
}

/**
 * Build an unsigned create+buy transaction via PumpPortal
 * Returns base64-encoded VersionedTransaction bytes ready for wallet signing
 */
export async function buildPumpPortalCreateTx(
  params: PumpPortalCreateParams
): Promise<Uint8Array> {
  const body = {
    publicKey: params.publicKey,
    action: "create",
    tokenMetadata: {
      name: params.name,
      symbol: params.symbol,
      uri: params.metadataUri,
    },
    mint: params.mintPublicKey,
    denominatedInSol: "true",
    amount: params.initialBuySol ?? 0,
    slippage: params.slippage ?? 15,
    priorityFee: params.priorityFee ?? 0.00005,
    pool: "pump",
  };

  const resp = await axios.post(`${PUMPPORTAL_BASE}/trade-local`, body, {
    responseType: "arraybuffer",
    timeout: 30_000,
    headers: { "Content-Type": "application/json" },
  });

  if (resp.status !== 200) {
    throw new Error(`PumpPortal error ${resp.status}`);
  }

  return new Uint8Array(resp.data);
}

/**
 * Build a buy transaction for an existing pump.fun token
 */
export async function buildPumpPortalBuyTx(params: {
  publicKey: string;
  mint: string;
  amountSol: number;
  slippage?: number;
  priorityFee?: number;
}): Promise<Uint8Array> {
  const body = {
    publicKey: params.publicKey,
    action: "buy",
    mint: params.mint,
    denominatedInSol: "true",
    amount: params.amountSol,
    slippage: params.slippage ?? 15,
    priorityFee: params.priorityFee ?? 0.00005,
    pool: "pump",
  };

  const resp = await axios.post(`${PUMPPORTAL_BASE}/trade-local`, body, {
    responseType: "arraybuffer",
    timeout: 15_000,
    headers: { "Content-Type": "application/json" },
  });

  return new Uint8Array(resp.data);
}

/**
 * Build a sell transaction for a pump.fun token
 */
export async function buildPumpPortalSellTx(params: {
  publicKey: string;
  mint: string;
  /** Amount in tokens (not SOL) */
  amountTokens: number;
  slippage?: number;
  priorityFee?: number;
}): Promise<Uint8Array> {
  const body = {
    publicKey: params.publicKey,
    action: "sell",
    mint: params.mint,
    denominatedInSol: "false",
    amount: params.amountTokens,
    slippage: params.slippage ?? 15,
    priorityFee: params.priorityFee ?? 0.00005,
    pool: "pump",
  };

  const resp = await axios.post(`${PUMPPORTAL_BASE}/trade-local`, body, {
    responseType: "arraybuffer",
    timeout: 15_000,
    headers: { "Content-Type": "application/json" },
  });

  return new Uint8Array(resp.data);
}

/**
 * Subscribe to real-time pump.fun events via PumpPortal WebSocket
 * Events: newToken, trade
 */
export function subscribePumpPortalEvents(
  onToken: (token: PumpPortalTokenEvent) => void,
  onTrade: (trade: PumpPortalTradeEvent) => void
): WebSocket {
  const ws = new WebSocket("wss://pumpportal.fun/api/data");

  ws.onopen = () => {
    // Subscribe to new token creations
    ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    // Subscribe to all trades (filter by mint client-side)
    ws.send(JSON.stringify({ method: "subscribeTokenTrade" }));
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.txType === "create") {
        onToken(data as PumpPortalTokenEvent);
      } else if (data.txType === "buy" || data.txType === "sell") {
        onTrade(data as PumpPortalTradeEvent);
      }
    } catch {
      // Ignore parse errors
    }
  };

  return ws;
}

export interface PumpPortalTokenEvent {
  txType: "create";
  signature: string;
  mint: string;
  traderPublicKey: string;
  initialBuy: number;
  solAmount: number;
  tokenAmount: number;
  bondingCurveKey: string;
  name: string;
  symbol: string;
  uri: string;
  timestamp: number;
}

export interface PumpPortalTradeEvent {
  txType: "buy" | "sell";
  signature: string;
  mint: string;
  traderPublicKey: string;
  tokenAmount: number;
  solAmount: number;
  bondingCurveKey: string;
  vSolInBondingCurve: number;
  vTokensInBondingCurve: number;
  marketCapSol: number;
  timestamp: number;
}
