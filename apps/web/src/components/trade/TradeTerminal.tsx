"use client";

import React, { useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getMarket } from "@/lib/api/fluer";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import { useAppStore } from "@/lib/store/useAppStore";
import { useTradeStore } from "@/lib/store/useTradeStore";
import { TradingChart } from "./TradingChart";
import { OrderPanel } from "./OrderPanel";
import { MarketInfoBar } from "./MarketInfoBar";
import { PositionsPanel } from "./PositionsPanel";
import { RecentTrades } from "./RecentTrades";
import { Skeleton } from "@/components/ui/Skeleton";
import type { WsEvent } from "@/lib/types";

interface TradeTerminalProps {
  marketId: string;
}

export function TradeTerminal({ marketId }: TradeTerminalProps) {
  const updatePrice = useAppStore((s) => s.updatePrice);
  const pushFeedEvent = useAppStore((s) => s.pushFeedEvent);
  const setWsConnected = useAppStore((s) => s.setWsConnected);

  // Fetch market data
  const { data: market, isLoading } = useQuery({
    queryKey: ["market", marketId],
    queryFn: () => getMarket(marketId),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  // WebSocket subscriptions for this market
  const handleWsEvent = useCallback(
    (event: WsEvent) => {
      if (event.type === "PRICE_UPDATE" && event.market_id === marketId) {
        updatePrice(marketId, {
          price: event.price,
          change_24h: event.change_24h,
          volume_24h: event.volume_24h,
          timestamp: event.timestamp,
        });
      }
      if (["TRADE", "FUNDING_RATE", "LIQUIDATION"].includes(event.type)) {
        pushFeedEvent(event);
      }
    },
    [marketId, updatePrice, pushFeedEvent]
  );

  const { status } = useWebSocket({
    onEvent: handleWsEvent,
    subscriptions: [marketId],
    enabled: true,
  });

  useEffect(() => {
    setWsConnected(status === "connected");
  }, [status, setWsConnected]);

  if (isLoading || !market) {
    return (
      <div className="flex-1 flex flex-col gap-0 overflow-hidden">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="flex-1 w-full" />
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden min-h-0">
      {/* Market info bar */}
      <MarketInfoBar market={market} wsConnected={status === "connected"} />

      {/* Main trade layout */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Chart + positions */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">
          {/* Chart */}
          <TradingChart
            marketId={marketId}
            height={420}
            className="flex-1 min-h-0"
          />

          {/* Positions / orders tabs */}
          <div className="border-t border-border-subtle" style={{ height: 200 }}>
            <PositionsPanel market={market} />
          </div>
        </div>

        {/* Right sidebar: order panel + recent trades */}
        <div className="flex flex-col border-l border-border-subtle overflow-hidden"
             style={{ width: 320 }}>
          {/* Order form */}
          <div className="flex-1 overflow-y-auto min-h-0">
            <OrderPanel market={market} />
          </div>

          {/* Recent trades */}
          <div className="border-t border-border-subtle" style={{ height: 220 }}>
            <RecentTrades marketId={marketId} />
          </div>
        </div>
      </div>
    </div>
  );
}
