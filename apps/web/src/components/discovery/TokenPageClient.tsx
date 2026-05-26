"use client";

import React, { useState, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useWallet } from "@solana/wallet-adapter-react";
import { getToken, getPredictionsForToken } from "@/lib/api/fluer";
import {
  formatPrice, formatUSD, formatChange, formatCount,
  stripFluerSuffix, graduationProgress, timeAgo,
  priceChangeColor, estimateTokensOut, estimateSolOut,
  cn, truncateAddress, explorerUrl,
} from "@/lib/utils";
import { LAUNCHPAD, EXPLORER_URL } from "@/lib/constants";
import { TradingChart } from "@/components/trade/TradingChart";
import { Skeleton } from "@/components/ui/Skeleton";
import {
  ExternalLinkIcon, GraduatedIcon, PerpIcon,
  PredictIcon, CopyIcon, CheckIcon,
} from "@/components/ui/icons/NavIcons";
import { SolanaIcon } from "@/components/ui/icons/NavIcons";

interface TokenPageClientProps {
  ca: string;
}

export function TokenPageClient({ ca }: TokenPageClientProps) {
  const { publicKey, connected } = useWallet();
  const [tradeSide, setTradeSide] = useState<"buy" | "sell">("buy");
  const [amount, setAmount] = useState("");
  const [copied, setCopied] = useState(false);

  const { data: token, isLoading } = useQuery({
    queryKey: ["token", ca],
    queryFn: () => getToken(ca),
    staleTime: 10_000,
    refetchInterval: 15_000,
  });

  const { data: predictions } = useQuery({
    queryKey: ["token-predictions", ca],
    queryFn: () => getPredictionsForToken(ca),
    staleTime: 30_000,
    enabled: !!token?.graduated,
  });

  const copyAddress = useCallback(async () => {
    await navigator.clipboard.writeText(ca);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [ca]);

  if (isLoading) {
    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-20 w-full mb-4 rounded-xl" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-64 col-span-2 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex-1 flex items-center justify-center text-text-tertiary">
        Token not found
      </div>
    );
  }

  const displayName = stripFluerSuffix(token.name);
  const progress = graduationProgress(token.real_sol_reserves / 1e9);

  // Preview trade calculation
  const numAmount = parseFloat(amount) || 0;
  const previewOut = tradeSide === "buy"
    ? estimateTokensOut(
        token.virtual_sol_reserves / 1e9,
        token.virtual_token_reserves / 1e6,
        numAmount
      )
    : estimateSolOut(
        token.virtual_sol_reserves / 1e9,
        token.virtual_token_reserves / 1e6,
        numAmount * 1e6
      );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-7xl mx-auto p-4 flex flex-col gap-4">
        {/* ── Token header ──────────────────────────────── */}
        <div className="flex items-start gap-4 p-4 card">
          {/* Image */}
          <div className="w-14 h-14 rounded-full overflow-hidden bg-bg-hover shrink-0">
            {token.image_url ? (
              <Image
                src={token.image_url}
                alt={token.symbol}
                width={56}
                height={56}
                className="w-full h-full object-cover"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-bold text-lg text-text-tertiary">
                {token.symbol.slice(0, 2)}
              </div>
            )}
          </div>

          {/* Identity */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-text-primary">{displayName}</h1>
              <span className="text-text-tertiary">·</span>
              <span className="text-accent-primary font-semibold">FLUER</span>
              {token.graduated && (
                <span className="badge badge-positive">Graduated</span>
              )}
            </div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-sm font-mono text-text-secondary">{token.symbol}</span>
              <span className="text-text-tertiary text-xs font-mono flex items-center gap-1">
                {truncateAddress(ca, 8)}
                <button onClick={copyAddress} className="hover:text-text-secondary transition-colors ml-1">
                  {copied ? <CheckIcon size={11} className="text-positive" /> : <CopyIcon size={11} />}
                </button>
              </span>
              <a
                href={explorerUrl("token", ca)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-tertiary hover:text-text-secondary transition-colors"
              >
                <ExternalLinkIcon size={12} />
              </a>
            </div>
          </div>

          {/* Price */}
          <div className="text-right shrink-0">
            <p className="text-xl font-bold font-mono text-text-primary">
              {formatPrice(token.price_usd)}
            </p>
            <p className={cn("text-sm font-medium font-mono mt-0.5", priceChangeColor(token.change_24h))}>
              {formatChange(token.change_24h)} 24h
            </p>
          </div>
        </div>

        {/* ── Main content grid ──────────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Chart + stats — 2 cols */}
          <div className="xl:col-span-2 flex flex-col gap-4">
            {/* Price chart */}
            <div className="panel rounded-lg overflow-hidden" style={{ height: 380 }}>
              <TradingChart poolAddress={ca} height={380} />
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: "Market Cap", value: formatUSD(token.market_cap_usd) },
                { label: "Volume 24h",  value: formatUSD(token.volume_24h_usd) },
                { label: "Holders",     value: formatCount(token.holder_count) },
                { label: "Buys / Sells", value: `${formatCount(token.buy_count)} / ${formatCount(token.sell_count)}` },
              ].map(({ label, value }) => (
                <div key={label} className="card text-center">
                  <p className="label-xs mb-1">{label}</p>
                  <p className="text-base font-semibold font-mono text-text-primary">{value}</p>
                </div>
              ))}
            </div>

            {/* Graduation progress */}
            {!token.graduated && (
              <div className="card">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <GraduatedIcon size={14} className="text-accent-primary" />
                    <span className="text-sm font-medium text-text-primary">
                      Bonding Curve Progress
                    </span>
                  </div>
                  <span className="text-sm font-bold font-mono text-accent-primary">
                    {progress.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 bg-bg-raised rounded-full overflow-hidden">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-700",
                      progress >= 90 ? "bg-warning" : "bg-accent-primary"
                    )}
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2 text-xs text-text-tertiary font-mono">
                  <span>{(token.real_sol_reserves / 1e9).toFixed(2)} SOL raised</span>
                  <span>{LAUNCHPAD.GRADUATION_SOL_THRESHOLD} SOL target</span>
                </div>
                <p className="text-xs text-text-secondary mt-2">
                  When graduated, a perpetual market + Raydium LP will be automatically created.
                </p>
              </div>
            )}

            {/* Graduated → perp market */}
            {token.graduated && token.perp_market_id && (
              <div className="card border-border-strong bg-bg-positive/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <PerpIcon size={16} className="text-positive" />
                    <div>
                      <p className="text-sm font-semibold text-text-primary">Perpetual Market Open</p>
                      <p className="text-xs text-text-secondary">Trade leveraged futures on {token.symbol}</p>
                    </div>
                  </div>
                  <Link href={`/trade/${token.perp_market_id}`} className="btn-primary text-xs py-1.5 px-4">
                    Trade Perp
                  </Link>
                </div>
              </div>
            )}

            {/* Description */}
            {token.description && (
              <div className="card">
                <p className="label-xs mb-2">About</p>
                <p className="text-sm text-text-secondary leading-relaxed">{token.description}</p>
              </div>
            )}
          </div>

          {/* Right panel: trade + predictions */}
          <div className="flex flex-col gap-4">
            {/* Curve trading panel */}
            {!token.graduated && (
              <div className="card">
                <h3 className="text-sm font-semibold text-text-primary mb-3">
                  Trade on Bonding Curve
                </h3>

                {/* Side toggle */}
                <div className="flex gap-0 rounded-lg overflow-hidden border border-border-default mb-3">
                  <button
                    onClick={() => setTradeSide("buy")}
                    className={cn(
                      "flex-1 py-2 text-sm font-semibold transition-colors",
                      tradeSide === "buy"
                        ? "bg-positive text-white"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    Buy
                  </button>
                  <button
                    onClick={() => setTradeSide("sell")}
                    className={cn(
                      "flex-1 py-2 text-sm font-semibold transition-colors",
                      tradeSide === "sell"
                        ? "bg-negative text-white"
                        : "text-text-secondary hover:text-text-primary"
                    )}
                  >
                    Sell
                  </button>
                </div>

                {/* Amount input */}
                <div className="relative mb-2">
                  <input
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    className="input-field pr-14"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary font-mono">
                    {tradeSide === "buy" ? "SOL" : token.symbol}
                  </span>
                </div>

                {/* Quick amounts */}
                <div className="flex gap-1 mb-3">
                  {["0.1", "0.5", "1", "5"].map((v) => (
                    <button
                      key={v}
                      onClick={() => setAmount(v)}
                      className="flex-1 py-1 text-xs bg-bg-raised hover:bg-bg-hover rounded-sm text-text-tertiary transition-colors"
                    >
                      {v}
                    </button>
                  ))}
                </div>

                {/* Preview */}
                {numAmount > 0 && (
                  <div className="text-xs text-text-secondary mb-3 p-2 bg-bg-raised rounded-md font-mono">
                    You receive: ~
                    {tradeSide === "buy"
                      ? `${(previewOut / 1e6).toFixed(2)} ${token.symbol}`
                      : `${previewOut.toFixed(4)} SOL`}
                  </div>
                )}

                {/* Submit */}
                <button
                  disabled={!connected || !numAmount}
                  className={cn(
                    "w-full py-2.5 rounded-lg text-sm font-bold transition-all",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    tradeSide === "buy"
                      ? "bg-positive/90 hover:bg-positive text-white"
                      : "bg-negative/90 hover:bg-negative text-white"
                  )}
                >
                  {connected ? (tradeSide === "buy" ? `Buy ${token.symbol}` : `Sell ${token.symbol}`) : "Connect Wallet"}
                </button>
              </div>
            )}

            {/* Prediction markets */}
            {predictions && predictions.length > 0 && (
              <div className="card">
                <div className="flex items-center gap-2 mb-3">
                  <PredictIcon size={14} className="text-info" />
                  <h3 className="text-sm font-semibold text-text-primary">Prediction Markets</h3>
                </div>
                <div className="flex flex-col gap-2">
                  {predictions.slice(0, 3).map((p) => (
                    <div key={p.id} className="p-2.5 bg-bg-raised rounded-md">
                      <p className="text-xs text-text-primary mb-1.5 leading-snug">{p.title}</p>
                      <div className="h-1.5 bg-bg-hover rounded-full overflow-hidden flex">
                        <div className="bg-positive" style={{ width: `${p.yes_probability}%` }} />
                        <div className="bg-negative flex-1" />
                      </div>
                      <div className="flex justify-between mt-1 text-2xs text-text-tertiary">
                        <span>{p.yes_probability}% Yes</span>
                        <span>{formatUSD(p.total_volume_usd)} vol</span>
                      </div>
                    </div>
                  ))}
                  {predictions.length > 3 && (
                    <Link href="/predict" className="text-xs text-accent-primary hover:underline text-center">
                      View all {predictions.length} markets →
                    </Link>
                  )}
                </div>
              </div>
            )}

            {/* Social links */}
            {(token.website || token.twitter || token.telegram) && (
              <div className="card">
                <p className="label-xs mb-2">Links</p>
                <div className="flex flex-col gap-2">
                  {token.website && (
                    <a href={token.website} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                      <ExternalLinkIcon size={12} />
                      Website
                    </a>
                  )}
                  {token.twitter && (
                    <a href={`https://x.com/${token.twitter}`} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                      <ExternalLinkIcon size={12} />
                      @{token.twitter}
                    </a>
                  )}
                  {token.telegram && (
                    <a href={`https://t.me/${token.telegram}`} target="_blank" rel="noopener noreferrer"
                       className="flex items-center gap-2 text-sm text-text-secondary hover:text-text-primary transition-colors">
                      <ExternalLinkIcon size={12} />
                      t.me/{token.telegram}
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
