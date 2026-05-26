"use client";

import React, { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { getRecentTrades } from "@/lib/api/fluer";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import { useAppStore } from "@/lib/store/useAppStore";
import { formatPrice, formatUSD, cn, truncateAddress } from "@/lib/utils";
import type { RecentTrade, WsEvent } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";

interface RecentTradesProps {
  marketId: string;
}

export function RecentTrades({ marketId }: RecentTradesProps) {
  const [liveTrades, setLiveTrades] = useState<RecentTrade[]>([]);
  const listRef = useRef<HTMLDivElement>(null);

  const { data: initialTrades, isLoading } = useQuery({
    queryKey: ["recent-trades", marketId],
    queryFn: () => getRecentTrades(marketId),
    staleTime: 30_000,
  });

  // Prepend incoming WS trades
  const handleWsEvent = React.useCallback((event: WsEvent) => {
    if (event.type === "TRADE" && event.market_id === marketId) {
      const newTrade: RecentTrade = {
        id: `ws-${event.timestamp}`,
        side: event.side as "Long" | "Short",
        size_usd: event.size_usd,
        price: event.price,
        trader: "",
        timestamp: event.timestamp,
      };
      setLiveTrades((prev) => [newTrade, ...prev].slice(0, 50));
    }
  }, [marketId]);

  useWebSocket({ onEvent: handleWsEvent, subscriptions: [marketId] });

  const allTrades = [...liveTrades, ...(initialTrades ?? [])].slice(0, 50);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <span className="text-xs font-medium text-text-secondary">Recent Trades</span>
        <div className="flex gap-3 text-2xs text-text-tertiary font-mono">
          <span className="w-20 text-right">Price</span>
          <span className="w-20 text-right">Size</span>
          <span className="w-16 text-right">Time</span>
        </div>
      </div>

      <div ref={listRef} className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="p-2 flex flex-col gap-1">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        ) : (
          allTrades.map((trade, i) => (
            <TradeRow key={`${trade.id}-${i}`} trade={trade} isNew={i === 0 && liveTrades.length > 0} />
          ))
        )}
      </div>
    </div>
  );
}

function TradeRow({ trade, isNew }: { trade: RecentTrade; isNew: boolean }) {
  const isLong = trade.side === "Long";
  const time = new Date(trade.timestamp * 1000);
  const timeStr = `${time.getHours().toString().padStart(2,"0")}:${time.getMinutes().toString().padStart(2,"0")}:${time.getSeconds().toString().padStart(2,"0")}`;

  return (
    <div
      className={cn(
        "flex items-center gap-0 px-3 py-1 hover:bg-bg-hover transition-colors",
        isNew && "animate-fade-in"
      )}
    >
      <span
        className={cn(
          "w-20 font-mono text-xs font-medium",
          isLong ? "text-positive" : "text-negative"
        )}
      >
        {formatPrice(trade.price)}
      </span>
      <span className="flex-1 text-right font-mono text-xs text-text-secondary">
        {formatUSD(trade.size_usd, { decimals: 0 })}
      </span>
      <span className="w-16 text-right font-mono text-2xs text-text-tertiary">
        {timeStr}
      </span>
    </div>
  );
}
