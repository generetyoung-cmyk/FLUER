"use client";

import React, { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import { listPredictions } from "@/lib/api/fluer";
import { formatUSD, formatDuration, timeAgo, cn } from "@/lib/utils";
import type { PredictionMarket, PredictionStatus } from "@/lib/types";
import { Skeleton } from "@/components/ui/Skeleton";
import { useWallet } from "@solana/wallet-adapter-react";

type FilterStatus = "all" | "Active" | "Resolved";

const STATUS_TABS: { id: FilterStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Active", label: "Active" },
  { id: "Resolved", label: "Resolved" },
];

export function PredictionFeed() {
  const [statusFilter, setStatusFilter] = useState<FilterStatus>("Active");
  const { publicKey } = useWallet();

  const { data, isLoading } = useQuery({
    queryKey: ["predictions", statusFilter],
    queryFn: () =>
      listPredictions({
        status: statusFilter === "all" ? undefined : statusFilter,
        limit: 50,
      }),
    staleTime: 20_000,
    refetchInterval: 30_000,
  });

  const predictions = data?.predictions ?? [];

  return (
    <div>
      {/* Filter tabs */}
      <div className="flex gap-1 mb-4">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setStatusFilter(tab.id)}
            className={cn(
              "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
              statusFilter === tab.id
                ? "bg-bg-hover text-text-primary border border-border-default"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-48 rounded-xl" />
          ))}
        </div>
      ) : predictions.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {predictions.map((p) => (
            <PredictionCard key={p.id} prediction={p} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-text-tertiary">
          <p className="text-sm">No prediction markets yet</p>
          <p className="text-xs mt-1">Markets are created when tokens meet graduation criteria</p>
        </div>
      )}
    </div>
  );
}

function PredictionCard({ prediction: p }: { prediction: PredictionMarket }) {
  const { publicKey } = useWallet();
  const [betSide, setBetSide] = useState<"Yes" | "No" | null>(null);
  const [betAmount, setBetAmount] = useState("10");

  const now = Math.floor(Date.now() / 1000);
  const timeLeft = p.resolution_timestamp - now;
  const isActive = p.status === "Active" && timeLeft > 0;
  const isResolved = p.status === "Resolved";

  const totalPool = p.yes_pool_usd + p.no_pool_usd;
  const yesPct = totalPool > 0 ? (p.yes_pool_usd / totalPool) * 100 : 50;
  const noPct = 100 - yesPct;

  return (
    <div className="card hover:border-border-strong transition-colors flex flex-col gap-3">
      {/* Token header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-bg-hover overflow-hidden shrink-0">
          {p.token_image ? (
            <Image
              src={p.token_image}
              alt={p.token_symbol}
              width={32}
              height={32}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xs font-bold text-text-tertiary">
              {p.token_symbol.slice(0, 2)}
            </div>
          )}
        </div>
        <div>
          <p className="text-xs font-medium text-text-primary">{p.token_name}</p>
          <p className="text-2xs text-text-tertiary font-mono">{p.token_symbol}</p>
        </div>

        {/* Status badge */}
        <div className="ml-auto">
          <span
            className={cn(
              "badge text-2xs",
              isActive ? "badge-positive" :
              isResolved ? "badge-neutral" :
              "badge-warning"
            )}
          >
            {p.status}
          </span>
        </div>
      </div>

      {/* Question */}
      <p className="text-sm font-medium text-text-primary leading-snug">{p.title}</p>

      {/* Probability bar */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5">
          <span className="text-positive font-semibold">{yesPct.toFixed(0)}% Yes</span>
          <span className="text-negative font-semibold">{noPct.toFixed(0)}% No</span>
        </div>
        <div className="h-2 rounded-full overflow-hidden bg-bg-raised flex">
          <div
            className="bg-positive transition-all duration-500"
            style={{ width: `${yesPct}%` }}
          />
          <div
            className="bg-negative flex-1"
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center justify-between text-xs text-text-tertiary">
        <span>Pool: <span className="text-text-secondary font-mono">{formatUSD(totalPool)}</span></span>
        {isActive && timeLeft > 0 ? (
          <span>Ends in <span className="text-text-secondary">{formatDuration(timeLeft)}</span></span>
        ) : isResolved ? (
          <span className="text-positive">
            Resolved: <span className="font-semibold">{p.outcome}</span>
          </span>
        ) : null}
      </div>

      {/* Bet interface (active markets only) */}
      {isActive && publicKey && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
          <div className="flex gap-1.5">
            <button
              onClick={() => setBetSide("Yes")}
              className={cn(
                "flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors",
                betSide === "Yes"
                  ? "bg-positive text-white"
                  : "bg-bg-positive text-positive hover:bg-positive/20"
              )}
            >
              Yes
            </button>
            <button
              onClick={() => setBetSide("No")}
              className={cn(
                "flex-1 py-1.5 rounded-md text-xs font-semibold transition-colors",
                betSide === "No"
                  ? "bg-negative text-white"
                  : "bg-bg-negative text-negative hover:bg-negative/20"
              )}
            >
              No
            </button>
          </div>

          {betSide && (
            <div className="flex gap-1.5 animate-slide-down">
              <div className="relative flex-1">
                <input
                  type="number"
                  value={betAmount}
                  onChange={(e) => setBetAmount(e.target.value)}
                  className="input-field text-xs py-1.5 pr-12"
                  placeholder="10"
                  min="0.5"
                />
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-2xs text-text-tertiary">
                  USDC
                </span>
              </div>
              <button
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-semibold text-white transition-colors",
                  betSide === "Yes" ? "bg-positive hover:bg-green-600" : "bg-negative hover:bg-red-600"
                )}
              >
                Bet {betSide}
              </button>
            </div>
          )}
        </div>
      )}

      {isActive && !publicKey && (
        <div className="text-center text-xs text-text-tertiary pt-1 border-t border-border-subtle">
          Connect wallet to bet
        </div>
      )}
    </div>
  );
}
