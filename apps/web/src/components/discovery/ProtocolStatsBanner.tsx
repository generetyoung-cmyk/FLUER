"use client";

import React from "react";
import { useQuery } from "@tanstack/react-query";
import { getProtocolStats } from "@/lib/api/fluer";
import { useAppStore } from "@/lib/store/useAppStore";
import { formatUSD, formatCount } from "@/lib/utils";

export function ProtocolStatsBanner() {
  const { data } = useQuery({
    queryKey: ["protocol-stats"],
    queryFn: getProtocolStats,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });

  const wsStats = useAppStore((s) => s.stats);
  const stats = wsStats ?? data;

  const items = [
    { label: "24h Volume", value: stats ? formatUSD(stats.total_volume_24h) : "—" },
    { label: "Open Interest", value: stats ? formatUSD(stats.total_oi) : "—" },
    { label: "Active Markets", value: stats ? stats.active_markets.toString() : "—" },
    { label: "Predictions", value: stats ? stats.active_predictions.toString() : "—" },
    { label: "Tokens Launched", value: stats ? formatCount(stats.total_tokens_launched) : "—" },
    { label: "Graduated", value: stats ? formatCount(stats.total_graduated) : "—" },
  ];

  return (
    <div className="flex items-center gap-0 h-8 bg-bg-elevated border-b border-border-subtle shrink-0 overflow-x-auto">
      {items.map(({ label, value }, i) => (
        <div key={label} className="flex items-center gap-2 px-4 border-r border-border-subtle shrink-0 h-full">
          <span className="text-2xs text-text-tertiary uppercase tracking-wider">{label}</span>
          <span className="text-xs font-mono font-semibold text-text-primary">{value}</span>
        </div>
      ))}
      <div className="flex items-center gap-1.5 px-4 ml-auto shrink-0">
        <span className="live-dot" />
        <span className="text-2xs text-text-tertiary font-mono">Solana Mainnet</span>
      </div>
    </div>
  );
}
