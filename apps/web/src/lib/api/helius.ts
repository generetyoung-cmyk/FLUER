import axios from "axios";

const HELIUS_API_KEY = process.env.NEXT_PUBLIC_HELIUS_API_KEY ?? "";
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const HELIUS_API = `https://api.helius.xyz/v0`;

const helius = axios.create({ timeout: 10_000 });

// ── DAS (Digital Asset Standard) API ─────────────────────────

export interface DASAsset {
  id: string;
  content: {
    metadata: {
      name: string;
      symbol: string;
      description?: string;
      image?: string;
    };
    links?: { image?: string; external_url?: string };
    json_uri: string;
  };
  token_info?: {
    supply: number;
    decimals: number;
    price_info?: {
      price_per_token: number;
      currency: string;
    };
  };
}

/**
 * Fetch token metadata via Helius DAS API
 */
export async function getTokenMetadata(mintAddress: string): Promise<DASAsset | null> {
  try {
    const resp = await helius.post(HELIUS_RPC, {
      jsonrpc: "2.0",
      id: "fluer-das",
      method: "getAsset",
      params: { id: mintAddress },
    });
    return resp.data?.result ?? null;
  } catch {
    return null;
  }
}

/**
 * Batch fetch multiple token metadata via DAS
 */
export async function getTokenMetadataBatch(
  mintAddresses: string[]
): Promise<DASAsset[]> {
  if (!mintAddresses.length) return [];

  const chunks = chunkArray(mintAddresses, 100);
  const results: DASAsset[] = [];

  for (const chunk of chunks) {
    try {
      const resp = await helius.post(HELIUS_RPC, {
        jsonrpc: "2.0",
        id: "fluer-das-batch",
        method: "getAssetBatch",
        params: { ids: chunk },
      });
      if (resp.data?.result) {
        results.push(...resp.data.result);
      }
    } catch {
      // Continue with other chunks
    }
  }

  return results;
}

/**
 * Get token holders via DAS getTokenAccounts
 * Returns top holders with balances
 */
export async function getTokenHolders(
  mintAddress: string,
  limit = 20
): Promise<{
  address: string;
  amount: number;
  owner: string;
}[]> {
  try {
    const resp = await helius.post(HELIUS_RPC, {
      jsonrpc: "2.0",
      id: "fluer-holders",
      method: "getTokenAccounts",
      params: {
        mint: mintAddress,
        limit,
        options: { showZeroBalance: false },
      },
    });

    return (resp.data?.result?.token_accounts ?? []).map((acct: any) => ({
      address: acct.address,
      amount: acct.amount / Math.pow(10, acct.decimals ?? 6),
      owner: acct.owner,
    }));
  } catch {
    return [];
  }
}

/**
 * Get all transactions for a wallet involving FLUER programs
 */
export async function getWalletTransactions(
  wallet: string,
  programIds: string[],
  limit = 50
): Promise<any[]> {
  try {
    const resp = await helius.get(`${HELIUS_API}/addresses/${wallet}/transactions`, {
      params: {
        "api-key": HELIUS_API_KEY,
        limit,
        commitment: "confirmed",
      },
    });
    return resp.data ?? [];
  } catch {
    return [];
  }
}

/**
 * Subscribe to account changes via Helius Enhanced WebSocket
 * Use this for real-time bonding curve reserve updates
 */
export function subscribeToAccountChanges(
  accountPubkeys: string[],
  onUpdate: (pubkey: string, data: Buffer) => void
): WebSocket {
  const wsUrl = `wss://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
  const ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    // Subscribe to each account
    accountPubkeys.forEach((pubkey, i) => {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        id: i + 1,
        method: "accountSubscribe",
        params: [
          pubkey,
          { encoding: "base64", commitment: "confirmed" },
        ],
      }));
    });
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.method === "accountNotification") {
        const pubkey = data.params?.subscription;
        const rawData = data.params?.result?.value?.data?.[0];
        if (pubkey && rawData) {
          const bytes = Buffer.from(rawData, "base64");
          onUpdate(pubkey, bytes);
        }
      }
    } catch {
      // Ignore malformed messages
    }
  };

  return ws;
}

// ── Helpers ───────────────────────────────────────────────────

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Resolve IPFS/Arweave URI to a usable HTTP URL
 */
export function resolveMetadataUri(uri: string): string {
  if (!uri) return "";
  if (uri.startsWith("ipfs://")) {
    return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
  }
  if (uri.startsWith("ar://")) {
    return uri.replace("ar://", "https://arweave.net/");
  }
  return uri;
}

/**
 * Fetch metadata JSON from an IPFS/Arweave URI
 */
export async function fetchMetadataJson(uri: string): Promise<{
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
  website?: string;
  twitter?: string;
  telegram?: string;
} | null> {
  const url = resolveMetadataUri(uri);
  if (!url) return null;

  try {
    const resp = await axios.get(url, { timeout: 8_000 });
    return resp.data;
  } catch {
    return null;
  }
}
