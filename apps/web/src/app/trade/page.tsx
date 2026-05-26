import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { MarketsOverview } from "@/components/trade/MarketsOverview";

export const metadata: Metadata = {
  title: "Perpetuals · FLUER",
  description: "Trade perpetual futures on graduated Solana tokens with up to 5× leverage on FLUER Protocol.",
};

export default function TradePage() {
  return (
    <div className="fluer-layout">
      <Header />
      <main className="flex-1 overflow-hidden flex flex-col">
        {/* Page header */}
        <div className="px-6 py-4 border-b border-border-subtle bg-bg-elevated shrink-0">
          <h1 className="text-lg font-semibold text-text-primary">Perpetual Markets</h1>
          <p className="text-sm text-text-secondary mt-0.5">
            Trade leveraged perpetuals on graduated FLUER tokens · Up to 5× · 0.1% taker fee
          </p>
        </div>

        <div className="flex-1 overflow-auto">
          <MarketsOverview />
        </div>
      </main>
    </div>
  );
}
