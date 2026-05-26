"use client";

import React, { useMemo, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { useTradeStore } from "@/lib/store/useTradeStore";
import { useAppStore } from "@/lib/store/useAppStore";
import {
  formatPrice,
  formatUSD,
  formatChange,
  cn,
  sideColor,
} from "@/lib/utils";
import { PERP } from "@/lib/constants";
import type { PerpMarket } from "@/lib/types";
import { InfoIcon, LongArrowIcon, ShortArrowIcon } from "@/components/ui/icons/NavIcons";

interface OrderPanelProps {
  market: PerpMarket;
}

const LEVERAGE_PRESETS = [1, 2, 3, 5];
const SLIPPAGE_PRESETS = [0.1, 0.5, 1.0]; // %

export function OrderPanel({ market }: OrderPanelProps) {
  const { publicKey, connected } = useWallet();
  const { setVisible } = useWalletModal();

  const {
    form,
    setSide,
    setCollateral,
    setLeverage,
    setOrderType,
    setLimitPrice,
    getNotional,
    getLiquidationPrice,
  } = useTradeStore();

  const markPrice = useAppStore(
    useCallback((s) => s.prices[market.id]?.price ?? market.mark_price, [market.id, market.mark_price])
  );

  // Derived values
  const collateral = parseFloat(form.collateral_usdc) || 0;
  const notional = getNotional(markPrice);
  const liquidationPrice = getLiquidationPrice(markPrice, market.maintenance_margin_bps);
  const fee = (notional * market.taker_fee_bps) / 10_000;

  const isLong = form.side === "Long";
  const canSubmit = connected && collateral >= PERP.MIN_COLLATERAL_USD;

  const priceImpactPct = useMemo(() => {
    if (!notional || !market.long_oi || !market.short_oi) return 0;
    // Approximate price impact from vAMM depth
    const totalReserve = (market.long_oi + market.short_oi) * markPrice;
    return Math.min(5, (notional / (totalReserve || 1)) * 100);
  }, [notional, market, markPrice]);

  const CollateralPercent = useCallback(
    (pct: number) => {
      // Helper to set collateral to % of a mock balance
      // In production, pull actual USDC balance from on-chain
      const mockBalance = 100;
      setCollateral(((mockBalance * pct) / 100).toFixed(2));
    },
    [setCollateral]
  );

  return (
    <div className="flex flex-col gap-0 h-full bg-bg-elevated border-l border-border-subtle overflow-y-auto">
      {/* ── Side selector ─────────────────────────────────── */}
      <div className="flex border-b border-border-subtle">
        <button
          onClick={() => setSide("Long")}
          className={cn(
            "flex-1 py-3 text-sm font-semibold transition-colors",
            isLong
              ? "text-positive bg-bg-positive border-b-2 border-positive"
              : "text-text-tertiary hover:text-text-secondary"
          )}
        >
          <div className="flex items-center justify-center gap-1.5">
            <LongArrowIcon />
            Long
          </div>
        </button>
        <button
          onClick={() => setSide("Short")}
          className={cn(
            "flex-1 py-3 text-sm font-semibold transition-colors",
            !isLong
              ? "text-negative bg-bg-negative border-b-2 border-negative"
              : "text-text-tertiary hover:text-text-secondary"
          )}
        >
          <div className="flex items-center justify-center gap-1.5">
            <ShortArrowIcon />
            Short
          </div>
        </button>
      </div>

      <div className="p-3 flex flex-col gap-3">
        {/* ── Order type ──────────────────────────────────── */}
        <div className="flex gap-1 bg-bg-raised rounded-md p-0.5">
          {(["Market", "Limit"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setOrderType(type)}
              className={cn(
                "flex-1 py-1.5 text-xs font-medium rounded-sm transition-colors",
                form.order_type === type
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-tertiary hover:text-text-secondary"
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* ── Limit price (if limit order) ─────────────────── */}
        {form.order_type === "Limit" && (
          <div>
            <label className="label-xs mb-1.5 block">Limit Price</label>
            <div className="relative">
              <input
                type="number"
                value={form.limit_price ?? ""}
                onChange={(e) => setLimitPrice(e.target.value)}
                placeholder={formatPrice(markPrice)}
                className="input-field pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary font-mono">
                USD
              </span>
            </div>
          </div>
        )}

        {/* ── Collateral input ─────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="label-xs">Collateral</label>
            <span className="text-xs text-text-tertiary font-mono">Balance: —</span>
          </div>
          <div className="relative">
            <input
              type="number"
              value={form.collateral_usdc}
              onChange={(e) => setCollateral(e.target.value)}
              placeholder="0.00"
              min="0"
              step="0.01"
              className="input-field pr-16"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-tertiary font-mono">
              USDC
            </span>
          </div>

          {/* Quick fill buttons */}
          <div className="flex gap-1 mt-1.5">
            {[25, 50, 75, 100].map((pct) => (
              <button
                key={pct}
                onClick={() => CollateralPercent(pct)}
                className="flex-1 py-1 text-xs text-text-tertiary hover:text-text-secondary
                           bg-bg-raised hover:bg-bg-hover rounded-sm transition-colors"
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>

        {/* ── Leverage slider ──────────────────────────────── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label-xs">Leverage</label>
            <span
              className={cn(
                "text-sm font-bold font-mono",
                form.leverage >= 4 ? "text-warning" : "text-text-primary"
              )}
            >
              {form.leverage}×
            </span>
          </div>

          {/* Slider */}
          <input
            type="range"
            min="1"
            max={PERP.MAX_LEVERAGE}
            step="1"
            value={form.leverage}
            onChange={(e) => setLeverage(parseInt(e.target.value))}
            className="w-full accent-accent-primary cursor-pointer"
            style={{ accentColor: "#7C5CFC" }}
          />

          {/* Preset buttons */}
          <div className="flex gap-1 mt-1.5">
            {LEVERAGE_PRESETS.map((lev) => (
              <button
                key={lev}
                onClick={() => setLeverage(lev)}
                className={cn(
                  "flex-1 py-1 text-xs font-medium rounded-sm transition-colors",
                  form.leverage === lev
                    ? "bg-accent-muted text-accent-primary border border-accent-border"
                    : "bg-bg-raised text-text-tertiary hover:text-text-secondary hover:bg-bg-hover"
                )}
              >
                {lev}×
              </button>
            ))}
          </div>
        </div>

        {/* ── Order summary ────────────────────────────────── */}
        <div className="bg-bg-raised rounded-md p-3 flex flex-col gap-2 text-xs">
          <div className="flex justify-between">
            <span className="text-text-tertiary">Entry Price</span>
            <span className="font-mono text-text-primary">
              {form.order_type === "Market" ? formatPrice(markPrice) : (form.limit_price || "—")}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Notional</span>
            <span className="font-mono text-text-primary">{formatUSD(notional)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Liq. Price</span>
            <span className={cn("font-mono font-semibold", isLong ? "text-negative" : "text-positive")}>
              {collateral > 0 ? formatPrice(liquidationPrice) : "—"}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-text-tertiary">Fee ({market.taker_fee_bps / 100}%)</span>
            <span className="font-mono text-text-secondary">{fee > 0 ? formatUSD(fee) : "—"}</span>
          </div>
          {priceImpactPct > 0.01 && (
            <div className="flex justify-between">
              <span className="text-text-tertiary">Price Impact</span>
              <span className={cn("font-mono", priceImpactPct > 1 ? "text-warning" : "text-text-secondary")}>
                {priceImpactPct.toFixed(3)}%
              </span>
            </div>
          )}
          <div className="divider" />
          <div className="flex justify-between">
            <span className="text-text-tertiary">Funding Rate</span>
            <span
              className={cn(
                "font-mono",
                market.funding_rate_hourly > 0 ? "text-negative" : "text-positive"
              )}
            >
              {market.funding_rate_hourly > 0 ? "+" : ""}
              {(market.funding_rate_hourly * 100).toFixed(4)}%/h
            </span>
          </div>
        </div>

        {/* ── Submit button ─────────────────────────────────── */}
        {connected ? (
          <button
            disabled={!canSubmit}
            className={cn(
              "w-full py-3 rounded-lg text-sm font-bold transition-all duration-150",
              "active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed",
              isLong
                ? "bg-positive/90 hover:bg-positive text-white shadow-positive"
                : "bg-negative/90 hover:bg-negative text-white shadow-negative"
            )}
          >
            {isLong ? "Open Long" : "Open Short"} {form.leverage}×
          </button>
        ) : (
          <button
            onClick={() => setVisible(true)}
            className="btn-primary w-full"
          >
            Connect Wallet
          </button>
        )}

        {/* ── Risk warning ─────────────────────────────────── */}
        {form.leverage >= 3 && collateral > 0 && (
          <div className="flex items-start gap-1.5 text-xs text-warning bg-bg-warning rounded-md p-2.5">
            <InfoIcon size={12} className="shrink-0 mt-0.5" />
            <span>
              High leverage trading carries significant liquidation risk. Only trade with funds you can afford to lose.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
