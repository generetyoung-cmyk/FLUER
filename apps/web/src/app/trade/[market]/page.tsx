import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { TradeTerminal } from "@/components/trade/TradeTerminal";
import { notFound } from "next/navigation";

interface PageProps {
  params: Promise<{ market: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { market } = await params;
  const symbol = market.toUpperCase().replace("-perp", "").replace("-PERP", "");
  return {
    title: `${symbol}-PERP · FLUER`,
    description: `Trade ${symbol} perpetual futures on FLUER Protocol with up to 5× leverage.`,
  };
}

export default async function TradeMarketPage({ params }: PageProps) {
  const { market } = await params;

  if (!market) notFound();

  return (
    <div className="fluer-layout">
      <Header />
      <TradeTerminal marketId={market} />
    </div>
  );
}
