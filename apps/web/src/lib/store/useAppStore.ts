import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { WsEvent, ProtocolStats, PerpMarket } from "@/lib/types";

interface PriceUpdate {
  price: number;
  change_24h: number;
  volume_24h: number;
  timestamp: number;
  direction: "up" | "down" | "neutral";
}

interface AppStore {
  // ── Real-time prices keyed by market_id ───────────────────
  prices: Record<string, PriceUpdate>;
  updatePrice: (marketId: string, update: Omit<PriceUpdate, "direction">) => void;

  // ── Protocol-level stats ──────────────────────────────────
  stats: ProtocolStats | null;
  setStats: (stats: ProtocolStats) => void;

  // ── Live feed events (last 200) ───────────────────────────
  liveFeed: WsEvent[];
  pushFeedEvent: (event: WsEvent) => void;

  // ── WebSocket status ──────────────────────────────────────
  wsConnected: boolean;
  setWsConnected: (connected: boolean) => void;

  // ── SOL price (USD) from Pyth ─────────────────────────────
  solPriceUsd: number;
  setSolPrice: (price: number) => void;

  // ── Selected market for trade page ───────────────────────
  activeMarketId: string | null;
  setActiveMarket: (id: string | null) => void;

  // ── Global loading state ──────────────────────────────────
  appReady: boolean;
  setAppReady: (ready: boolean) => void;
}

export const useAppStore = create<AppStore>()(
  subscribeWithSelector((set, get) => ({
    prices: {},
    updatePrice: (marketId, update) => {
      const current = get().prices[marketId];
      const direction =
        !current
          ? "neutral"
          : update.price > current.price
          ? "up"
          : update.price < current.price
          ? "down"
          : "neutral";

      set((state) => ({
        prices: {
          ...state.prices,
          [marketId]: { ...update, direction },
        },
      }));
    },

    stats: null,
    setStats: (stats) => set({ stats }),

    liveFeed: [],
    pushFeedEvent: (event) =>
      set((state) => ({
        liveFeed: [event, ...state.liveFeed].slice(0, 200),
      })),

    wsConnected: false,
    setWsConnected: (connected) => set({ wsConnected: connected }),

    solPriceUsd: 0,
    setSolPrice: (price) => set({ solPriceUsd: price }),

    activeMarketId: null,
    setActiveMarket: (id) => set({ activeMarketId: id }),

    appReady: false,
    setAppReady: (ready) => set({ appReady: ready }),
  }))
);

// ── Selectors ─────────────────────────────────────────────────

export const selectPrice = (marketId: string) => (state: AppStore) =>
  state.prices[marketId];

export const selectFeedByType = (type: WsEvent["type"]) => (state: AppStore) =>
  state.liveFeed.filter((e) => e.type === type);
