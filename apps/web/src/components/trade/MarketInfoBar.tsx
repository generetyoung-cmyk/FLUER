"use client";

import React from "react";
import Link from "next/link";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  formatPrice, formatUSD, formatChange, formatDuration,
  priceChangeColor, cn,
} from "@/lib/utils";
import type { PerpMarket } from "@/lib/types";
import { ExternalLinkIcon, ChevronDownIcon } from "@/components/ui/icons/NavIcons";
import { EXPLORER_URL } from "@/lib/constants";

interface MarketInfoBarProps {
  market: PerpMarket;
  wsConnected: boolean;
}

export function MarketInfoBar({ market, wsConnected }: MarketInfoBarProps) {
  const priceData = useAppStore((s) => s.prices[market.id]);

  const livePrice  = priceData?.price     ?? market.mark_price;
  const change24h  = priceData?.change_24h ?? market.change_24h;
  const volume24h  = priceData?.volume_24h ?? market.volume_24h;
  const direction  = priceData?.direction  ?? "neutral";

  const isLong = market.funding_rate_hourly < 0; // negative = longs pay shorts

  const stats: { label: string; value: React.ReactNode }[] = [
    {
      label: "Index Price",
      value: (
        <span className="font-mono text-text-secondary">
          {formatPrice(market.index_price)}
        </span>
      ),
    },
    {
      label: "24h Change",
      value: (
        <span className={cn("font-mono font-semibold", priceChangeColor(change24h))}>
          {formatChange(change24h)}
        </span>
      ),
    },
    {
      label: "24h Volume",
      value: <span className="font-mono text-text-primary">{formatUSD(volume24h)}</span>,
    },
    {
      label: "Open Interest",
      value: (
        <div className="flex flex-col items-end gap-0.5">
          <span className="font-mono text-text-primary">
            {formatUSD(market.long_oi + market.short_oi)}
          </span>
          {/* L/S bar */}
          <div className="flex w-16 h-1 rounded-full overflow-hidden bg-bg-raised">
            <div
              className="bg-positive h-full"
              style={{ width: `${market.long_oi_pct}%` }}
            />
            <div
              className="bg-negative h-full"
              style={{ width: `${market.short_oi_pct}%` }}
            />
          </div>
        </div>
      ),
    },
    {
      label: "Funding Rate",
      value: (
        <span
          className={cn(
            "font-mono font-medium",
            market.funding_rate_hourly > 0 ? "text-negative" : "text-positive"
          )}
        >
          {market.funding_rate_hourly > 0 ? "+" : ""}
          {(market.funding_rate_hourly * 100).toFixed(4)}%/h
        </span>
      ),
    },
    {
      label: "Next Funding",
      value: (
        <span className="font-mono text-text-secondary">
          {formatDuration(market.next_funding_in)}
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex items-center gap-0 border-b border-border-subtle bg-bg-elevated
                 shrink-0 overflow-x-auto"
      style={{ height: 48 }}
    >
      {/* Market selector */}
      <div
        className="flex items-center gap-2.5 px-4 h-full border-r border-border-subtle
                   hover:bg-bg-hover cursor-pointer transition-colors min-w-[160px]"
      >
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-bold text-text-primary">{market.symbol}</span>
            <span className="badge badge-neutral text-2xs">PERP</span>
          </div>
        </div>
        <ChevronDownIcon size={12} className="text-text-tertiary ml-auto" />
      </div>

      {/* Live price */}
      <div className="flex items-center px-4 h-full border-r border-border-subtle min-w-[120px]">
        <span
          className={cn(
            "font-mono font-bold text-lg transition-colors duration-300",
            direction === "up" ? "text-positive" :
            direction === "down" ? "text-negative" : "text-text-primary",
          )}
          key={livePrice} // Re-mount to trigger CSS transition
        >
          {formatPrice(livePrice)}
        </span>
      </div>

      {/* Stats */}
      <div className="flex items-center flex-1 gap-0 overflow-x-auto">
        {stats.map(({ label, value }) => (
          <div
            key={label}
            className="flex flex-col px-4 h-full justify-center border-r border-border-subtle
                       last:border-r-0 min-w-[100px] shrink-0"
          >
            <span className="text-2xs text-text-tertiary uppercase tracking-wider mb-0.5">
              {label}
            </span>
            <div className="text-sm">{value}</div>
          </div>
        ))}
      </div>

      {/* WS status + explorer link */}
      <div className="flex items-center gap-3 px-4 shrink-0">
        <div className="flex items-center gap-1.5 text-xs text-text-tertiary">
          <span
            className={cn(
              "w-1.5 h-1.5 rounded-full",
              wsConnected ? "bg-positive animate-pulse" : "bg-text-tertiary"
            )}
          />
          {wsConnected ? "Live" : "Connecting"}
        </div>
        <a
          href={`${EXPLORER_URL}/account/${market.base_mint}`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-text-tertiary hover:text-text-secondary transition-colors"
          title="View on Solscan"
        >
          <ExternalLinkIcon size={13} />
        </a>
      </div>
    </div>
  );
}
