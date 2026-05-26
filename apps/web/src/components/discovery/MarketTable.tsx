"use client";

import React, { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { listTokens } from "@/lib/api/fluer";
import { getTrendingPools, getNewPools } from "@/lib/api/gecko";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  formatUSD,
  formatPrice,
  formatChange,
  formatCount,
  graduationProgress,
  cn,
  priceChangeColor,
  stripFluerSuffix,
} from "@/lib/utils";
import type { TokenListing, DiscoveryTab } from "@/lib/types";
import {
  TrendingIcon,
  NewIcon,
  GraduatedIcon,
  FlameIcon,
  VolumeIcon,
  PerpIcon,
} from "@/components/ui/icons/NavIcons";
import { Skeleton } from "@/components/ui/Skeleton";

const TABS: { id: DiscoveryTab; label: string; icon: React.ComponentType<any> }[] = [
  { id: "trending", label: "Trending", icon: TrendingIcon },
  { id: "new", label: "New", icon: NewIcon },
  { id: "high_volume", label: "Volume", icon: VolumeIcon },
  { id: "graduated", label: "Graduated", icon: GraduatedIcon },
  { id: "perps", label: "Perps", icon: PerpIcon },
];

interface MarketTableProps {
  className?: string;
}

function GraduationBar({ pct }: { pct: number }) {
  return (
    <div className="w-full h-1 bg-bg-raised rounded-full overflow-hidden">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          pct >= 90 ? "bg-warning" : "bg-accent-primary"
        )}
        style={{ width: `${Math.min(100, pct)}%` }}
      />
    </div>
  );
}

function TokenImage({ src, alt, size = 28 }: { src: string; alt: string; size?: number }) {
  const [error, setError] = useState(false);

  if (error || !src) {
    return (
      <div
        className="rounded-full bg-bg-hover flex items-center justify-center
                   text-text-tertiary text-xs font-bold shrink-0"
        style={{ width: size, height: size }}
      >
        {alt.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      className="rounded-full overflow-hidden shrink-0 bg-bg-hover"
      style={{ width: size, height: size }}
    >
      <Image
        src={src}
        alt={alt}
        width={size}
        height={size}
        className="w-full h-full object-cover"
        onError={() => setError(true)}
        unoptimized
      />
    </div>
  );
}

export function MarketTable({ className }: MarketTableProps) {
  const [activeTab, setActiveTab] = useState<DiscoveryTab>("trending");
  const [sortCol, setSortCol] = useState<string>("volume_24h_usd");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Fetch FLUER tokens
  const { data: tokensData, isLoading } = useQuery({
    queryKey: ["tokens", activeTab],
    queryFn: () =>
      listTokens({
        sort: activeTab === "high_volume" ? "volume" : activeTab === "new" ? "newest" : "trending",
        graduated: activeTab === "graduated",
        limit: 50,
      }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  const tokens = tokensData?.tokens ?? [];

  // Sort tokens
  const sorted = useMemo(() => {
    return [...tokens].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortCol) {
        case "price_usd":        aVal = a.price_usd; bVal = b.price_usd; break;
        case "change_24h":       aVal = a.change_24h; bVal = b.change_24h; break;
        case "market_cap_usd":   aVal = a.market_cap_usd; bVal = b.market_cap_usd; break;
        case "holder_count":     aVal = a.holder_count; bVal = b.holder_count; break;
        case "created_at":       aVal = a.created_at; bVal = b.created_at; break;
        default:                 aVal = a.volume_24h_usd; bVal = b.volume_24h_usd; break;
      }
      return sortDir === "desc" ? bVal - aVal : aVal - bVal;
    });
  }, [tokens, sortCol, sortDir]);

  const handleSort = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "desc" ? "asc" : "desc"));
      } else {
        setSortCol(col);
        setSortDir("desc");
      }
    },
    [sortCol]
  );

  const SortIndicator = ({ col }: { col: string }) => {
    if (sortCol !== col) return <span className="text-text-tertiary opacity-30">↕</span>;
    return <span className="text-accent-primary">{sortDir === "desc" ? "↓" : "↑"}</span>;
  };

  return (
    <div className={cn("flex flex-col bg-bg-base", className)}>
      {/* ── Tabs ──────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-3 py-2 border-b border-border-subtle bg-bg-elevated">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                active
                  ? "text-text-primary bg-bg-hover"
                  : "text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
              )}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Table ─────────────────────────────────────────── */}
      <div className="overflow-auto flex-1">
        <table className="data-table w-full min-w-[700px]">
          <thead>
            <tr>
              <th className="w-8 text-center">#</th>
              <th className="min-w-[180px]">Token</th>
              <th
                className="cursor-pointer hover:text-text-secondary text-right"
                onClick={() => handleSort("price_usd")}
              >
                Price <SortIndicator col="price_usd" />
              </th>
              <th
                className="cursor-pointer hover:text-text-secondary text-right"
                onClick={() => handleSort("change_24h")}
              >
                24h % <SortIndicator col="change_24h" />
              </th>
              <th
                className="cursor-pointer hover:text-text-secondary text-right"
                onClick={() => handleSort("volume_24h_usd")}
              >
                Volume 24h <SortIndicator col="volume_24h_usd" />
              </th>
              <th
                className="cursor-pointer hover:text-text-secondary text-right"
                onClick={() => handleSort("market_cap_usd")}
              >
                Mkt Cap <SortIndicator col="market_cap_usd" />
              </th>
              <th
                className="cursor-pointer hover:text-text-secondary text-right"
                onClick={() => handleSort("holder_count")}
              >
                Holders <SortIndicator col="holder_count" />
              </th>
              <th className="min-w-[100px]">Progress</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 12 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 8 }).map((_, j) => (
                      <td key={j}>
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))
              : sorted.map((token, idx) => (
                  <TokenRow
                    key={token.mint}
                    token={token}
                    rank={idx + 1}
                  />
                ))}
          </tbody>
        </table>

        {!isLoading && sorted.length === 0 && (
          <div className="flex items-center justify-center py-16 text-text-tertiary text-sm">
            No tokens found
          </div>
        )}
      </div>
    </div>
  );
}

function TokenRow({ token, rank }: { token: TokenListing; rank: number }) {
  const progress = graduationProgress(token.real_sol_reserves / 1e9);
  const displayName = stripFluerSuffix(token.name);

  return (
    <tr
      className="group cursor-pointer"
      onClick={() => window.location.href = `/token/${token.mint}`}
    >
      <td className="text-center text-text-tertiary font-mono">{rank}</td>

      {/* Token identity */}
      <td>
        <div className="flex items-center gap-2">
          <TokenImage
            src={token.image_url}
            alt={token.symbol}
            size={28}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-text-primary font-medium text-sm truncate max-w-[100px]">
                {displayName}
              </span>
              {token.graduated && (
                <span className="badge badge-positive text-2xs">GRAD</span>
              )}
            </div>
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-text-tertiary text-xs font-mono">{token.symbol}</span>
              <span className="text-text-tertiary text-2xs opacity-50">·</span>
              <span className="text-text-tertiary text-2xs font-mono truncate max-w-[60px]">
                {token.mint.slice(0, 6)}...{token.mint.slice(-4)}
              </span>
            </div>
          </div>
        </div>
      </td>

      {/* Price */}
      <td className="text-right font-mono text-text-primary">
        {formatPrice(token.price_usd)}
      </td>

      {/* 24h change */}
      <td className={cn("text-right font-mono font-medium", priceChangeColor(token.change_24h))}>
        {formatChange(token.change_24h)}
      </td>

      {/* Volume */}
      <td className="text-right font-mono text-text-secondary">
        {formatUSD(token.volume_24h_usd)}
      </td>

      {/* Market Cap */}
      <td className="text-right font-mono text-text-secondary">
        {formatUSD(token.market_cap_usd)}
      </td>

      {/* Holders */}
      <td className="text-right font-mono text-text-secondary">
        {formatCount(token.holder_count)}
      </td>

      {/* Graduation progress */}
      <td>
        <div className="pr-2">
          <div className="flex items-center justify-between mb-1">
            <span className="text-2xs text-text-tertiary font-mono">
              {progress.toFixed(0)}%
            </span>
            {token.graduated && (
              <span className="text-2xs text-positive">✓</span>
            )}
          </div>
          <GraduationBar pct={progress} />
        </div>
      </td>
    </tr>
  );
}
