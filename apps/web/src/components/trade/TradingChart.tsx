"use client";

import React, {
  useEffect,
  useRef,
  useCallback,
  useState,
  useMemo,
} from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CrosshairMode,
  ColorType,
  type CandlestickData,
  type LineData,
  type HistogramData,
  type Time,
} from "lightweight-charts";
import { useQuery } from "@tanstack/react-query";
import {
  getPoolOHLCV,
  geckoCandlesToBars,
  resolutionToGeckoParams,
} from "@/lib/api/gecko";
import { getCandles } from "@/lib/api/fluer";
import {
  formatPrice,
  formatUSD,
  formatChange,
  priceChangeColor,
  cn,
} from "@/lib/utils";
import { CHART } from "@/lib/constants";
import type { CandleBar } from "@/lib/types";
import { useAppStore } from "@/lib/store/useAppStore";

const CHART_COLORS = {
  bg:          "#111114",
  gridLine:    "rgba(42,42,56,0.5)",
  textPrimary: "#F4F4F6",
  textMuted:   "#52525F",
  crosshair:   "rgba(139,107,255,0.4)",
  upCandle:    "#22C55E",
  downCandle:  "#EF4444",
  volumeUp:    "rgba(34,197,94,0.3)",
  volumeDown:  "rgba(239,68,68,0.3)",
};

type ChartMode = "candle" | "line";
type Resolution = (typeof CHART.RESOLUTIONS)[number];

interface TradingChartProps {
  poolAddress?: string;
  marketId?: string;
  realtimePrice?: number;
  height?: number;
  className?: string;
}

export function TradingChart({
  poolAddress,
  marketId,
  realtimePrice,
  height = 420,
  className,
}: TradingChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);

  const [resolution, setResolution] = useState<Resolution>("1h");
  const [mode, setMode] = useState<ChartMode>("candle");
  const [hoveredCandle, setHoveredCandle] = useState<CandleBar | null>(null);
  const [lastPrice, setLastPrice] = useState<number | null>(null);

  const priceFromStore = useAppStore(
    useCallback(
      (s) => (marketId ? s.prices[marketId]?.price ?? null : null),
      [marketId]
    )
  );
  const livePrice = realtimePrice ?? priceFromStore;

  const geckoParams = useMemo(
    () => resolutionToGeckoParams(resolution),
    [resolution]
  );

  const { data: geckoData, isLoading: geckoLoading } = useQuery({
    queryKey: ["gecko-ohlcv", poolAddress, resolution],
    queryFn: () =>
      getPoolOHLCV(poolAddress!, geckoParams.type, geckoParams.aggregate, 500),
    enabled: !!poolAddress,
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  const { data: perpData, isLoading: perpLoading } = useQuery({
    queryKey: ["perp-candles", marketId, resolution],
    queryFn: () => getCandles(marketId!, resolution, undefined, undefined, 500),
    enabled: !!marketId,
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const isLoading = poolAddress ? geckoLoading : perpLoading;

  const bars: CandleBar[] = useMemo(() => {
    if (geckoData) return geckoCandlesToBars(geckoData);
    if (perpData) return perpData;
    return [];
  }, [geckoData, perpData]);

  // ── Init chart (v4 API) ────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: CHART_COLORS.bg },
        textColor: CHART_COLORS.textPrimary,
        fontSize: 11,
        fontFamily: "var(--font-geist-mono, JetBrains Mono, monospace)",
      },
      grid: {
        vertLines: { color: CHART_COLORS.gridLine, style: 1 },
        horzLines: { color: CHART_COLORS.gridLine, style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: "#18181D" },
        horzLine: { color: CHART_COLORS.crosshair, labelBackgroundColor: "#18181D" },
      },
      rightPriceScale: {
        borderColor: "transparent",
        scaleMargins: { top: 0.1, bottom: 0.25 },
      },
      timeScale: {
        borderColor: "transparent",
        timeVisible: true,
        secondsVisible: resolution === "1m",
        rightOffset: 8,
        barSpacing: 6,
        minBarSpacing: 2,
      },
    });

    chartRef.current = chart;

    // v4: addCandlestickSeries / addLineSeries / addHistogramSeries
    const candleSeries = chart.addCandlestickSeries({
      upColor:        CHART_COLORS.upCandle,
      downColor:      CHART_COLORS.downCandle,
      wickUpColor:    CHART_COLORS.upCandle,
      wickDownColor:  CHART_COLORS.downCandle,
      borderVisible:  false,
      priceFormat:    { type: "price", precision: 8, minMove: 0.00000001 },
    });
    candleSeriesRef.current = candleSeries;

    const lineSeries = chart.addLineSeries({
      color:                    "#7C5CFC",
      lineWidth:                2,
      crosshairMarkerVisible:   true,
      crosshairMarkerRadius:    4,
      priceFormat:              { type: "price", precision: 8, minMove: 0.00000001 },
      visible:                  false,
    });
    lineSeriesRef.current = lineSeries;

    const volumeSeries = chart.addHistogramSeries({
      color:        CHART_COLORS.volumeUp,
      priceFormat:  { type: "volume" },
      priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });
    volumeSeriesRef.current = volumeSeries;

    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData) {
        setHoveredCandle(null);
        return;
      }
      const candle = param.seriesData.get(candleSeries) as CandlestickData | undefined;
      if (candle) {
        setHoveredCandle({
          time:   param.time as number,
          open:   candle.open,
          high:   candle.high,
          low:    candle.low,
          close:  candle.close,
          volume: 0,
        });
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({
          width:  entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current       = null;
      candleSeriesRef.current = null;
      lineSeriesRef.current   = null;
      volumeSeriesRef.current = null;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle candle / line mode ──────────────────────────────
  useEffect(() => {
    candleSeriesRef.current?.applyOptions({ visible: mode === "candle" });
    lineSeriesRef.current?.applyOptions({ visible: mode === "line" });
  }, [mode]);

  // ── Load bar data ──────────────────────────────────────────
  useEffect(() => {
    if (!bars.length) return;

    const candleData: CandlestickData<Time>[] = bars.map((b) => ({
      time: b.time as Time, open: b.open, high: b.high, low: b.low, close: b.close,
    }));
    const lineData: LineData<Time>[] = bars.map((b) => ({
      time: b.time as Time, value: b.close,
    }));
    const volumeData: HistogramData<Time>[] = bars.map((b) => ({
      time:  b.time as Time,
      value: b.volume,
      color: b.close >= b.open ? CHART_COLORS.volumeUp : CHART_COLORS.volumeDown,
    }));

    candleSeriesRef.current?.setData(candleData);
    lineSeriesRef.current?.setData(lineData);
    volumeSeriesRef.current?.setData(volumeData);

    setLastPrice(bars[bars.length - 1]?.close ?? null);
    chartRef.current?.timeScale().fitContent();
  }, [bars]);

  // ── Real-time last-bar update ──────────────────────────────
  useEffect(() => {
    if (!livePrice || !bars.length) return;
    const last = bars[bars.length - 1];
    if (!last) return;

    candleSeriesRef.current?.update({
      time:  last.time as Time,
      open:  last.open,
      high:  Math.max(last.high, livePrice),
      low:   Math.min(last.low, livePrice),
      close: livePrice,
    });
    lineSeriesRef.current?.update({ time: last.time as Time, value: livePrice });
    setLastPrice(livePrice);
  }, [livePrice, bars]);

  // ── Derived display values ─────────────────────────────────
  const currentPrice = livePrice ?? lastPrice;
  const displayBar   = hoveredCandle ?? (bars.length > 0 ? bars[bars.length - 1] : null);
  const priceChange  = displayBar
    ? ((displayBar.close - displayBar.open) / displayBar.open) * 100
    : 0;

  return (
    <div className={cn("flex flex-col bg-bg-elevated", className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-subtle shrink-0">
        <div className="flex items-center gap-4 font-mono text-xs">
          {displayBar ? (
            <>
              <span className="text-text-tertiary">O</span>
              <span className="text-text-primary">{formatPrice(displayBar.open)}</span>
              <span className="text-text-tertiary">H</span>
              <span className="text-positive">{formatPrice(displayBar.high)}</span>
              <span className="text-text-tertiary">L</span>
              <span className="text-negative">{formatPrice(displayBar.low)}</span>
              <span className="text-text-tertiary">C</span>
              <span className={cn("font-semibold", priceChange >= 0 ? "text-positive" : "text-negative")}>
                {formatPrice(displayBar.close)}
              </span>
              <span className={cn("text-xs", priceChangeColor(priceChange))}>
                {formatChange(priceChange)}
              </span>
            </>
          ) : (
            currentPrice && (
              <span className="text-text-primary font-semibold">{formatPrice(currentPrice)}</span>
            )
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Resolution tabs */}
          <div className="flex items-center rounded-md bg-bg-raised border border-border-subtle overflow-hidden">
            {(["5m", "15m", "1h", "4h", "1d"] as Resolution[]).map((r) => (
              <button
                key={r}
                onClick={() => setResolution(r)}
                className={cn(
                  "px-2 py-1 text-xs font-medium transition-colors",
                  resolution === r ? "bg-bg-hover text-text-primary" : "text-text-tertiary hover:text-text-secondary"
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div className="flex items-center rounded-md bg-bg-raised border border-border-subtle overflow-hidden">
            {(["candle", "line"] as ChartMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "px-2.5 py-1 text-xs font-medium transition-colors",
                  mode === m ? "bg-bg-hover text-text-primary" : "text-text-tertiary hover:text-text-secondary"
                )}
              >
                {m === "candle" ? (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor">
                    <rect x="1" y="3" width="3" height="6" />
                    <rect x="2.5" y="1" width="0.5" height="2" />
                    <rect x="2.5" y="9" width="0.5" height="2" />
                    <rect x="8" y="2" width="3" height="6" />
                    <rect x="9.5" y="0" width="0.5" height="2" />
                    <rect x="9.5" y="8" width="0.5" height="3" />
                  </svg>
                ) : (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <polyline points="1,10 4,6 7,8 11,2" />
                  </svg>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="relative flex-1 min-h-0" style={{ height }}>
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-bg-elevated/80">
            <div className="flex items-center gap-2 text-text-tertiary text-xs">
              <span className="w-4 h-4 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
              Loading chart...
            </div>
          </div>
        )}
        <div ref={containerRef} className="w-full h-full" />
      </div>
    </div>
  );
}
