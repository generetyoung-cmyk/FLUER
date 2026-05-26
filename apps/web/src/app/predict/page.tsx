import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { PredictionFeed } from "@/components/predict/PredictionFeed";

export const metadata: Metadata = {
  title: "Predict · FLUER",
  description: "Bet on token price targets, holder growth, and exchange listings with on-chain prediction markets on FLUER Protocol.",
};

export default function PredictPage() {
  return (
    <div className="fluer-layout">
      <Header />
      <main className="flex-1 flex overflow-hidden min-h-0">
        {/* Main content */}
        <div className="flex-1 overflow-y-auto px-6 py-6">
          <div className="max-w-5xl mx-auto">
            <div className="mb-6">
              <h1 className="text-2xl font-bold text-text-primary mb-1">
                Prediction Markets
              </h1>
              <p className="text-text-secondary text-sm">
                Bet on token outcomes — price targets, holder milestones, exchange listings.
                Resolved on-chain by protocol oracles.
              </p>
            </div>
            <PredictionFeed />
          </div>
        </div>
      </main>
    </div>
  );
}
