import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { TokenPageClient } from "@/components/discovery/TokenPageClient";

interface PageProps {
  params: Promise<{ ca: string }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { ca } = await params;
  return {
    title: `Token · FLUER`,
    description: `View bonding curve, trades, and prediction markets for this FLUER token.`,
  };
}

export default async function TokenPage({ params }: PageProps) {
  const { ca } = await params;
  return (
    <div className="fluer-layout">
      <Header />
      <TokenPageClient ca={ca} />
    </div>
  );
}
