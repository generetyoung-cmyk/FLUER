"use client";

import React, { useEffect } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useQuery } from "@tanstack/react-query";
import { getPositions } from "@/lib/api/fluer";
import { useTradeStore } from "@/lib/store/useTradeStore";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  formatUSD, formatPrice, formatChange, cn, sideColor, sideBg,
} from "@/lib/utils";
import type { PerpMarket, Position } from "@/lib/types";
import { LongArrowIcon, ShortArrowIcon } from "@/components/ui/icons/NavIcons";
import { Skeleton } from "@/components/ui/Skeleton";

interface PositionsPanelProps {
  market: PerpMarket;
}

export function PositionsPanel({ market }: PositionsPanelProps) {
  const { publicKey } = useWallet();
  const { activeTab, setActiveTab, setPositions, positions } = useTradeStore();
  const markPrice = useAppStore(
    (s) => s.prices[market.id]?.price ?? market.mark_price
  );

  const { data, isLoading } = useQuery({
    queryKey: ["positions", publicKey?.toBase58()],
    queryFn: () => getPositions(publicKey!.toBase58()),
    enabled: !!publicKey,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  useEffect(() => {
    if (data) setPositions(data);
  }, [data, setPositions]);

  const marketPositions = positions.filter((p) => p.market_id === market.id);

  const tabs = [
    { id: "positions" as const, label: "Positions", count: marketPositions.length },
    { id: "history" as const, label: "History" },
    { id: "funding" as const, label: "Funding" },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-border-subtle bg-bg-elevated shrink-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "px-4 py-2 text-xs font-medium transition-colors flex items-center gap-1.5",
              activeTab === tab.id
                ? "text-text-primary border-b-2 border-accent-primary -mb-px"
                : "text-text-tertiary hover:text-text-secondary"
            )}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="badge badge-accent text-2xs py-px px-1">{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto min-h-0">
        {activeTab === "positions" && (
          <PositionsTab
            positions={marketPositions}
            markPrice={markPrice}
            isLoading={isLoading && !!publicKey}
            wallet={publicKey?.toBase58()}
          />
        )}
        {activeTab === "history" && <HistoryTab marketId={market.id} wallet={publicKey?.toBase58()} />}
        {activeTab === "funding" && <FundingTab marketId={market.id} />}
      </div>
    </div>
  );
}

function PositionsTab({
  positions, markPrice, isLoading, wallet,
}: {
  positions: Position[];
  markPrice: number;
  isLoading: boolean;
  wallet?: string;
}) {
  if (!wallet) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        Connect wallet to view positions
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-3">
        <Skeleton className="h-12 w-full mb-2" />
        <Skeleton className="h-12 w-3/4" />
      </div>
    );
  }

  if (positions.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        No open positions
      </div>
    );
  }

  return (
    <table className="data-table w-full text-xs">
      <thead>
        <tr>
          <th>Side</th>
          <th className="text-right">Size</th>
          <th className="text-right">Entry</th>
          <th className="text-right">Mark</th>
          <th className="text-right">Liq. Price</th>
          <th className="text-right">Margin</th>
          <th className="text-right">uPnL</th>
          <th className="text-right">Actions</th>
        </tr>
      </thead>
      <tbody>
        {positions.map((pos) => {
          const pnl = pos.side === "Long"
            ? (markPrice - pos.entry_price) * pos.base_amount / 1e6
            : (pos.entry_price - markPrice) * pos.base_amount / 1e6;
          const pnlPct = (pnl / pos.collateral_usdc) * 100;

          return (
            <tr key={pos.id}>
              <td>
                <div className={cn("flex items-center gap-1 font-semibold", sideColor(pos.side))}>
                  {pos.side === "Long" ? <LongArrowIcon /> : <ShortArrowIcon />}
                  {pos.side} {pos.leverage}×
                </div>
              </td>
              <td className="text-right font-mono">{formatUSD(pos.notional_usdc)}</td>
              <td className="text-right font-mono">{formatPrice(pos.entry_price)}</td>
              <td className="text-right font-mono">{formatPrice(markPrice)}</td>
              <td className={cn("text-right font-mono", pos.side === "Long" ? "text-negative" : "text-positive")}>
                {formatPrice(pos.liquidation_price)}
              </td>
              <td className="text-right font-mono">{formatUSD(pos.collateral_usdc)}</td>
              <td className={cn("text-right font-mono font-semibold", pnl >= 0 ? "text-positive" : "text-negative")}>
                {pnl >= 0 ? "+" : ""}{formatUSD(pnl)}
                <span className="text-2xs ml-1 opacity-75">
                  ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(2)}%)
                </span>
              </td>
              <td className="text-right">
                <button className="btn-danger text-2xs py-0.5 px-2">
                  Close
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function HistoryTab({ marketId, wallet }: { marketId: string; wallet?: string }) {
  if (!wallet) {
    return (
      <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
        Connect wallet to view history
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-full text-text-tertiary text-sm">
      No trade history
    </div>
  );
}

function FundingTab({ marketId }: { marketId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["funding-history", marketId],
    queryFn: () =>
      fetch(`/api/v1/markets/${marketId}/funding-history`)
        .then((r) => r.json())
        .then((d) => d.history ?? []),
    staleTime: 60_000,
  });

  if (isLoading) {
    return <div className="p-3"><Skeleton className="h-full w-full" /></div>;
  }

  return (
    <table className="data-table w-full text-xs">
      <thead>
        <tr>
          <th>Time</th>
          <th className="text-right">Rate (/h)</th>
          <th className="text-right">Annualized</th>
        </tr>
      </thead>
      <tbody>
        {(data ?? []).map((row: any, i: number) => {
          const rate = row.rate * 100;
          const annualized = rate * 24 * 365;
          return (
            <tr key={i}>
              <td className="font-mono text-text-secondary">
                {new Date(row.timestamp * 1000).toLocaleTimeString()}
              </td>
              <td className={cn("text-right font-mono", rate > 0 ? "text-negative" : "text-positive")}>
                {rate > 0 ? "+" : ""}{rate.toFixed(4)}%
              </td>
              <td className={cn("text-right font-mono", annualized > 0 ? "text-negative" : "text-positive")}>
                {annualized > 0 ? "+" : ""}{annualized.toFixed(1)}%
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
