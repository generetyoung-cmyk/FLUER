"use client";

import React, { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { listTokens } from "@/lib/api/fluer";
import { useAppStore } from "@/lib/store/useAppStore";
import { formatUSD, formatPrice, timeAgo, stripFluerSuffix, cn } from "@/lib/utils";
import type { WsEvent } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";

export function LaunchFeed() {
  const [recentLaunches, setRecentLaunches] = useState<any[]>([]);

  // Fetch existing tokens (newest first)
  const { data, isLoading } = useQuery({
    queryKey: ["recent-launches"],
    queryFn: () => listTokens({ sort: "newest", limit: 30 }),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  // Listen for new launch events from WS
  useAppStore.subscribe(
    (state) => state.liveFeed,
    (feed) => {
      const newLaunches = feed
        .filter((e): e is Extract<WsEvent, { type: "TOKEN_LAUNCHED" }> =>
          e.type === "TOKEN_LAUNCHED"
        )
        .map((e) => ({
          mint: e.mint,
          name: e.name,
          symbol: e.symbol,
          creator: e.creator,
          timestamp: e.timestamp,
          isNew: true,
        }));
      if (newLaunches.length > 0) {
        setRecentLaunches((prev) => [...newLaunches, ...prev].slice(0, 20));
      }
    }
  );

  const tokens = data?.tokens ?? [];
  const allItems = [...recentLaunches, ...tokens];

  if (isLoading) {
    return (
      <div className="p-3 flex flex-col gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col divide-y divide-border-subtle">
      {allItems.map((token, i) => {
        const name = "name" in token ? stripFluerSuffix(token.name) : token.name;
        const isNew = "isNew" in token && token.isNew;

        return (
          <Link
            key={token.mint + i}
            href={`/token/${token.mint}`}
            className={cn(
              "flex items-center gap-2.5 px-3 py-2.5 hover:bg-bg-hover transition-colors",
              isNew && "animate-fade-in"
            )}
          >
            {/* Token image */}
            <div className="w-9 h-9 rounded-full bg-bg-hover overflow-hidden shrink-0 flex items-center justify-center">
              {token.image_url ? (
                <Image
                  src={token.image_url}
                  alt={token.symbol ?? name}
                  width={36}
                  height={36}
                  className="w-full h-full object-cover"
                  unoptimized
                  onError={() => {}}
                />
              ) : (
                <span className="text-xs font-bold text-text-tertiary">
                  {(token.symbol ?? name).slice(0, 2)}
                </span>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-1">
                <span className="text-sm font-medium text-text-primary truncate">
                  {name}
                </span>
                {isNew && (
                  <span className="badge badge-accent text-2xs shrink-0">NEW</span>
                )}
              </div>
              <div className="flex items-center justify-between mt-0.5">
                <span className="text-xs text-text-tertiary font-mono">{token.symbol}</span>
                <span className="text-2xs text-text-tertiary">
                  {timeAgo(token.created_at ?? token.timestamp)}
                </span>
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
