import { create } from "zustand";
import type { OrderFormState, TradeSide, OrderType, Position } from "@/lib/types";

interface TradeStore {
  // ── Order form ────────────────────────────────────────────
  form: OrderFormState;
  setSide: (side: TradeSide) => void;
  setCollateral: (amount: string) => void;
  setLeverage: (leverage: number) => void;
  setOrderType: (type: OrderType) => void;
  setLimitPrice: (price: string) => void;
  setSlippage: (bps: number) => void;
  resetForm: () => void;

  // ── Positions ─────────────────────────────────────────────
  positions: Position[];
  setPositions: (positions: Position[]) => void;
  updatePosition: (id: string, update: Partial<Position>) => void;
  removePosition: (id: string) => void;

  // ── UI state ──────────────────────────────────────────────
  activeTab: "positions" | "history" | "funding";
  setActiveTab: (tab: "positions" | "history" | "funding") => void;

  // ── Computed from form ────────────────────────────────────
  getNotional: (markPrice: number) => number;
  getLiquidationPrice: (entryPrice: number, maintMarginBps: number) => number;
}

const DEFAULT_FORM: OrderFormState = {
  side: "Long",
  collateral_usdc: "",
  leverage: 2,
  order_type: "Market",
  limit_price: undefined,
  slippage_bps: 50, // 0.5%
};

export const useTradeStore = create<TradeStore>((set, get) => ({
  form: { ...DEFAULT_FORM },

  setSide: (side) => set((s) => ({ form: { ...s.form, side } })),
  setCollateral: (amount) =>
    set((s) => ({ form: { ...s.form, collateral_usdc: amount } })),
  setLeverage: (leverage) =>
    set((s) => ({ form: { ...s.form, leverage } })),
  setOrderType: (order_type) =>
    set((s) => ({ form: { ...s.form, order_type } })),
  setLimitPrice: (price) =>
    set((s) => ({ form: { ...s.form, limit_price: price } })),
  setSlippage: (bps) =>
    set((s) => ({ form: { ...s.form, slippage_bps: bps } })),
  resetForm: () => set({ form: { ...DEFAULT_FORM } }),

  positions: [],
  setPositions: (positions) => set({ positions }),
  updatePosition: (id, update) =>
    set((s) => ({
      positions: s.positions.map((p) =>
        p.id === id ? { ...p, ...update } : p
      ),
    })),
  removePosition: (id) =>
    set((s) => ({
      positions: s.positions.filter((p) => p.id !== id),
    })),

  activeTab: "positions",
  setActiveTab: (tab) => set({ activeTab: tab }),

  getNotional: (markPrice) => {
    const { form } = get();
    const collateral = parseFloat(form.collateral_usdc) || 0;
    return collateral * form.leverage;
  },

  getLiquidationPrice: (entryPrice, maintMarginBps) => {
    const { form } = get();
    const maintMargin = maintMarginBps / 10_000;
    if (form.side === "Long") {
      // liq = entry * (1 - 1/leverage + maintMargin)
      return entryPrice * (1 - 1 / form.leverage + maintMargin);
    } else {
      // liq = entry * (1 + 1/leverage - maintMargin)
      return entryPrice * (1 + 1 / form.leverage - maintMargin);
    }
  },
}));
