"use client";

import { useEffect, useCallback, useRef } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import type { WsEvent } from "@/lib/types";

/**
 * PumpPortal live feed hook — bridges pump.fun events into FLUER's live feed.
 * Used in the discovery page to show real-time launches from the Phase 1 launchpad.
 *
 * PumpPortal WebSocket: wss://pumpportal.fun/api/data
 */
export function usePumpPortalFeed() {
  const wsRef = useRef<WebSocket | null>(null);
  const pushFeedEvent = useAppStore((s) => s.pushFeedEvent);
  const solPriceUsd = useAppStore((s) => s.solPriceUsd);
  const isMounted = useRef(true);

  const connect = useCallback(() => {
    if (!isMounted.current) return;

    const ws = new WebSocket("wss://pumpportal.fun/api/data");
    wsRef.current = ws;

    ws.onopen = () => {
      // Subscribe to new FLUER-suffix token creations
      ws.send(JSON.stringify({ method: "subscribeNewToken" }));
    };

    ws.onmessage = (evt) => {
      if (!isMounted.current) return;
      try {
        const data = JSON.parse(evt.data);

        // Filter: only show tokens with · FLUER suffix
        if (
          data.txType === "create" &&
          (data.name?.includes("· FLUER") || data.name?.includes("FLUER"))
        ) {
          const event: WsEvent = {
            type: "TOKEN_LAUNCHED",
            mint: data.mint,
            name: data.name,
            symbol: data.symbol,
            creator: data.traderPublicKey,
            timestamp: Math.floor(Date.now() / 1000),
          };
          pushFeedEvent(event);
        }

        // Curve trades on FLUER tokens
        if (
          (data.txType === "buy" || data.txType === "sell") &&
          data.mint
        ) {
          const priceUsd = solPriceUsd > 0
            ? (data.solAmount / data.tokenAmount) * solPriceUsd * 1e6
            : 0;

          const event: WsEvent = {
            type: "CURVE_TRADE",
            mint: data.mint,
            side: data.txType === "buy" ? "Buy" : "Sell",
            sol_amount: data.solAmount ?? 0,
            token_amount: data.tokenAmount ?? 0,
            price_usd: priceUsd,
            trader: data.traderPublicKey ?? "",
            timestamp: Math.floor(Date.now() / 1000),
          };
          pushFeedEvent(event);
        }
      } catch {
        // Ignore parse errors
      }
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      // Reconnect after 3s
      setTimeout(() => {
        if (isMounted.current) connect();
      }, 3_000);
    };
  }, [pushFeedEvent, solPriceUsd]);

  useEffect(() => {
    isMounted.current = true;
    connect();

    return () => {
      isMounted.current = false;
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close(1000);
        wsRef.current = null;
      }
    };
  }, [connect]);
}
