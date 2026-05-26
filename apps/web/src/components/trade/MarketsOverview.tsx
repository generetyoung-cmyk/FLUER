"use client";

import React from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listMarkets } from "@/lib/api/fluer";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  formatPrice, formatUSD, formatChange, cn, priceChangeColor,
} from "@/lib/utils";
import type { PerpMarket } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { LongArrowIcon, ShortArrowIcon } from "@/components/ui/icons/NavIcons";

export function MarketsOverview() {
  const { data, isLoading } = useQuery({
    queryKey: ["markets-list"],
    queryFn: () => listMarkets({ limit: 50, sort: "volume" }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const markets = data?.markets ?? [];

  return (
    <div className="p-4">
      <table className="data-table w-full min-w-[700px]">
        <thead>
          <tr>
            <th className="text-left">Market</th>
            <th className="text-right">Mark Price</th>
            <th className="text-right">24h Change</th>
            <th className="text-right">Volume 24h</th>
            <th className="text-right">Open Interest</th>
            <th className="text-right">Long/Short</th>
            <th className="text-right">Funding /h</th>
            <th className="text-right">Action</th>
          </tr>
        </thead>
        <tbody>
          {isLoading
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j}><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            : markets.map((m) => <MarketRow key={m.id} market={m} />)}
        </tbody>
      </table>

      {!isLoading && markets.length === 0 && (
        <div className="flex items-center justify-center py-20 text-text-tertiary text-sm">
          No perpetual markets yet — graduate a token to create one
        </div>
      )}
    </div>
  );
}

function MarketRow({ market }: { market: PerpMarket }) {
  const livePrice = useAppStore((s) => s.prices[market.id]?.price ?? market.mark_price);
  const liveChange = useAppStore((s) => s.prices[market.id]?.change_24h ?? market.change_24h);

  const tierColors: Record<number, string> = {
    1: "text-text-tertiary",
    2: "text-accent-primary",
    3: "text-warning",
  };

  return (
    <tr className="cursor-pointer group">
      <td>
        <div className="flex items-center gap-2">
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-text-primary font-semibold text-sm">{market.symbol}</span>
              <span className={cn("text-2xs font-mono", tierColors[market.tier])}>
                T{market.tier}
              </span>
            </div>
            <span className="text-2xs text-text-tertiary font-mono">
              {market.base_mint.slice(0, 6)}...
            </span>
          </div>
        </div>
      </td>

      <td className="text-right font-mono font-semibold text-text-primary">
        {formatPrice(livePrice)}
      </td>

      <td className={cn("text-right font-mono font-medium", priceChangeColor(liveChange))}>
        {formatChange(liveChange)}
      </td>

      <td className="text-right font-mono text-text-secondary">
        {formatUSD(market.volume_24h)}
      </td>

      <td className="text-right font-mono text-text-secondary">
        {formatUSD(market.long_oi + market.short_oi)}
      </td>

      <td className="text-right">
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 text-xs">
            <span className="text-positive font-mono">{market.long_oi_pct.toFixed(0)}%</span>
            <span className="text-text-tertiary">/</span>
            <span className="text-negative font-mono">{market.short_oi_pct.toFixed(0)}%</span>
          </div>
          <div className="flex w-16 h-1 rounded-full overflow-hidden bg-bg-raised">
            <div className="bg-positive" style={{ width: `${market.long_oi_pct}%` }} />
            <div className="bg-negative" style={{ width: `${market.short_oi_pct}%` }} />
          </div>
        </div>
      </td>

      <td className={cn(
        "text-right font-mono text-xs",
        market.funding_rate_hourly > 0 ? "text-negative" : "text-positive"
      )}>
        {market.funding_rate_hourly > 0 ? "+" : ""}
        {(market.funding_rate_hourly * 100).toFixed(4)}%
      </td>

      <td className="text-right">
        <Link
          href={`/trade/${market.id}`}
          className="btn-secondary text-xs py-1 px-3 inline-flex"
          onClick={(e) => e.stopPropagation()}
        >
          Trade
        </Link>
      </td>
    </tr>
  );
}
