"use client";

import React, { useEffect } from "react";
import { useAppStore } from "@/lib/store/useAppStore";
import { useWebSocket } from "@/lib/hooks/useWebSocket";
import { formatUSD, formatPrice, timeAgo, cn, truncateAddress } from "@/lib/utils";
import type { WsEvent } from "@/lib/types";

interface LiveFeedProps {
  className?: string;
}

export function LiveFeed({ className }: LiveFeedProps) {
  const { liveFeed, pushFeedEvent, setWsConnected } = useAppStore((s) => ({
    liveFeed: s.liveFeed,
    pushFeedEvent: s.pushFeedEvent,
    setWsConnected: s.setWsConnected,
  }));

  const { status } = useWebSocket({
    onEvent: pushFeedEvent,
    enabled: true,
  });

  useEffect(() => {
    setWsConnected(status === "connected");
  }, [status, setWsConnected]);

  return (
    <div className={cn("flex flex-col bg-bg-elevated", className)}>
      {/* Header */}
      <div className="px-3 py-2 border-b border-border-subtle shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-text-secondary">Live Feed</span>
          <div className="flex items-center gap-1.5 text-2xs text-text-tertiary">
            <span
              className={cn(
                "w-1.5 h-1.5 rounded-full",
                status === "connected" ? "bg-positive animate-pulse" : "bg-text-tertiary"
              )}
            />
            {status === "connected" ? "Connected" : "Reconnecting..."}
          </div>
        </div>
      </div>

      {/* Events */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {liveFeed.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-text-tertiary text-xs">
            Waiting for events...
          </div>
        ) : (
          liveFeed.map((event, i) => (
            <FeedEvent key={`${event.type}-${i}`} event={event} isNew={i === 0} />
          ))
        )}
      </div>
    </div>
  );
}

function FeedEvent({ event, isNew }: { event: WsEvent; isNew: boolean }) {
  const config = getEventConfig(event);
  if (!config) return null;

  return (
    <div
      className={cn(
        "px-3 py-2 border-b border-border-subtle hover:bg-bg-hover transition-colors",
        isNew && "animate-fade-in"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Icon */}
        <div
          className={cn(
            "w-5 h-5 rounded-sm flex items-center justify-center shrink-0 mt-0.5",
            config.bgColor
          )}
        >
          <span className="text-2xs">{config.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-1">
            <span className={cn("text-xs font-medium truncate", config.textColor)}>
              {config.title}
            </span>
            <span className="text-2xs text-text-tertiary shrink-0">
              {timeAgo("timestamp" in event ? (event as any).timestamp : Date.now() / 1000)}
            </span>
          </div>
          <p className="text-2xs text-text-tertiary mt-0.5 truncate">{config.body}</p>
        </div>
      </div>
    </div>
  );
}

function getEventConfig(event: WsEvent): {
  icon: string;
  title: string;
  body: string;
  textColor: string;
  bgColor: string;
} | null {
  switch (event.type) {
    case "TOKEN_LAUNCHED":
      return {
        icon: "🚀",
        title: `${event.symbol} Launched`,
        body: `${event.name} by ${truncateAddress(event.creator)}`,
        textColor: "text-accent-primary",
        bgColor: "bg-accent-muted",
      };
    case "TOKEN_GRADUATED":
      return {
        icon: "🎓",
        title: `${event.symbol} Graduated`,
        body: event.perp_market_id ? "Perpetual market opened" : "Raydium LP deployed",
        textColor: "text-positive",
        bgColor: "bg-bg-positive",
      };
    case "CURVE_TRADE":
      return {
        icon: event.side === "Buy" ? "↑" : "↓",
        title: `${event.side} ${event.side === "Buy" ? formatUSD(event.sol_amount * 200) : "—"}`,
        body: `${truncateAddress(event.trader)} · ${formatPrice(event.price_usd)}`,
        textColor: event.side === "Buy" ? "text-positive" : "text-negative",
        bgColor: event.side === "Buy" ? "bg-bg-positive" : "bg-bg-negative",
      };
    case "TRADE":
      return {
        icon: event.side === "Long" ? "L" : "S",
        title: `${event.side} ${formatUSD(event.size_usd)}`,
        body: `${event.market_id} @ ${formatPrice(event.price)}`,
        textColor: event.side === "Long" ? "text-positive" : "text-negative",
        bgColor: event.side === "Long" ? "bg-bg-positive" : "bg-bg-negative",
      };
    case "LIQUIDATION":
      return {
        icon: "⚡",
        title: `Liquidation ${formatUSD(event.size_usd)}`,
        body: `${event.market_id} · ${event.side} · ${truncateAddress(event.trader)}`,
        textColor: "text-warning",
        bgColor: "bg-bg-warning",
      };
    case "PREDICTION_CREATED":
      return {
        icon: "◎",
        title: "New Prediction",
        body: event.title,
        textColor: "text-info",
        bgColor: "bg-blue-500/10",
      };
    case "PREDICTION_RESOLVED":
      return {
        icon: "✓",
        title: "Market Resolved",
        body: `Outcome: ${event.outcome}`,
        textColor: "text-positive",
        bgColor: "bg-bg-positive",
      };
    default:
      return null;
  }
}
