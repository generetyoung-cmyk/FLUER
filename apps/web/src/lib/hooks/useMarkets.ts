// ── useMarkets.ts ─────────────────────────────────────────────
// React Query hooks for market data with WebSocket price injection

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useCallback } from "react";
import { listMarkets, getMarket } from "@/lib/api/fluer";
import { useAppStore } from "@/lib/store/useAppStore";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import type { PerpMarket, WsEvent } from "@/lib/types";

/** Fetch all active perpetual markets with real-time price injection */
export function useMarkets(opts?: { sort?: string; limit?: number }) {
  const queryClient = useQueryClient();
  const updatePrice = useAppStore((s) => s.updatePrice);

  const query = useQuery({
    queryKey: ["markets", opts],
    queryFn: () =>
      listMarkets({
        sort: opts?.sort ?? "volume",
        limit: opts?.limit ?? 50,
      }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Inject WebSocket price updates into the cached market list
  const handleEvent = useCallback(
    (event: WsEvent) => {
      if (event.type !== "PRICE_UPDATE") return;

      updatePrice(event.market_id, {
        price: event.price,
        change_24h: event.change_24h,
        volume_24h: event.volume_24h,
        timestamp: event.timestamp,
      });

      // Patch the cached markets list so the table reflects live prices
      queryClient.setQueryData(
        ["markets", opts],
        (old: { markets: PerpMarket[]; total: number } | undefined) => {
          if (!old) return old;
          return {
            ...old,
            markets: old.markets.map((m) =>
              m.id === event.market_id
                ? {
                    ...m,
                    mark_price: event.price,
                    change_24h: event.change_24h,
                    volume_24h: event.volume_24h,
                  }
                : m
            ),
          };
        }
      );
    },
    [updatePrice, queryClient, opts]
  );

  useWebSocket({ onEvent: handleEvent, enabled: true });

  return query;
}

/** Fetch a single market with real-time updates */
export function useMarket(marketId: string | null) {
  const queryClient = useQueryClient();
  const updatePrice = useAppStore((s) => s.updatePrice);

  const query = useQuery({
    queryKey: ["market", marketId],
    queryFn: () => getMarket(marketId!),
    enabled: !!marketId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const handleEvent = useCallback(
    (event: WsEvent) => {
      if (event.type !== "PRICE_UPDATE" || event.market_id !== marketId) return;

      updatePrice(marketId!, {
        price: event.price,
        change_24h: event.change_24h,
        volume_24h: event.volume_24h,
        timestamp: event.timestamp,
      });

      queryClient.setQueryData(
        ["market", marketId],
        (old: PerpMarket | undefined) =>
          old
            ? { ...old, mark_price: event.price, change_24h: event.change_24h }
            : old
      );
    },
    [marketId, updatePrice, queryClient]
  );

  useWebSocket({
    onEvent: handleEvent,
    subscriptions: marketId ? [marketId] : [],
    enabled: !!marketId,
  });

  return query;
}
