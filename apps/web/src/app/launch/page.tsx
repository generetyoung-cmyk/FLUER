import { Metadata } from "next";
import { Header } from "@/components/layout/Header";
import { LaunchWizard } from "@/components/launch/LaunchWizard";
import { LaunchFeed } from "@/components/launch/LaunchFeed";

export const metadata: Metadata = {
  title: "Launch · FLUER",
  description: "Create and launch a new token on the FLUER bonding curve. All tokens carry the · FLUER suffix.",
};

export default function LaunchPage() {
  return (
    <div className="fluer-layout">
      <Header />
      <main className="flex flex-1 overflow-hidden min-h-0">
        {/* Left: recent launches feed */}
        <aside className="hidden lg:flex flex-col w-[280px] border-r border-border-subtle bg-bg-elevated overflow-y-auto">
          <div className="px-4 py-3 border-b border-border-subtle">
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span className="live-dot" />
              Recent Launches
            </h2>
          </div>
          <LaunchFeed />
        </aside>

        {/* Center: wizard */}
        <div className="flex-1 overflow-y-auto px-4 py-8 md:px-8">
          {/* Page header */}
          <div className="max-w-lg mx-auto mb-8">
            <h1 className="text-2xl font-bold text-text-primary mb-2">
              Launch a Token <span className="text-accent-primary">· FLUER</span>
            </h1>
            <p className="text-text-secondary text-sm leading-relaxed">
              Every token launched here carries the{" "}
              <span className="text-accent-primary font-medium">· FLUER</span> suffix —
              your permanent mark of origin. Graduation from the bonding curve unlocks a
              perpetual market, prediction markets, and full protocol integration.
            </p>

            {/* Quick stats */}
            <div className="flex items-center gap-4 mt-4 pt-4 border-t border-border-subtle text-xs text-text-tertiary">
              <span>Creation fee: <span className="text-text-secondary">50 FLUER</span></span>
              <span>·</span>
              <span>Graduation: <span className="text-text-secondary">~85 SOL</span></span>
              <span>·</span>
              <span>Supply: <span className="text-text-secondary">1B tokens</span></span>
            </div>
          </div>

          <LaunchWizard />
        </div>
      </main>
    </div>
  );
}
