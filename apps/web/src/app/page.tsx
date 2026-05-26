import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { MarketTable } from "@/components/discovery/MarketTable";
import { LiveFeed } from "@/components/discovery/LiveFeed";
import { ProtocolStatsBanner } from "@/components/discovery/ProtocolStatsBanner";

export const metadata: Metadata = {
  title: "Discover · FLUER",
  description: "Explore trending tokens, graduated perp markets, and active prediction markets on FLUER Protocol.",
};

export default function DiscoverPage() {
  return (
    <div className="fluer-layout">
      <Header />
      <main className="flex flex-col overflow-hidden h-full">
        {/* Protocol stats banner */}
        <ProtocolStatsBanner />

        {/* Main content: table + live feed */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Market table — main content */}
          <MarketTable className="flex-1 overflow-hidden" />

          {/* Live events feed — right sidebar */}
          <LiveFeed className="w-[280px] border-l border-border-subtle hidden xl:flex" />
        </div>
      </main>
    </div>
  );
}
