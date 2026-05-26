import Link from "next/link";
import { FluerLogo } from "@/components/ui/icons/FluerLogo";

export default function NotFound() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-bg-base">
      <div className="max-w-sm w-full text-center px-6">
        <div className="mb-8 flex justify-center opacity-30">
          <FluerLogo size={48} showWordmark={false} />
        </div>

        <h1 className="text-6xl font-bold font-mono text-text-tertiary mb-4">
          404
        </h1>

        <p className="text-lg font-semibold text-text-primary mb-2">
          Page not found
        </p>

        <p className="text-sm text-text-secondary mb-8 leading-relaxed">
          The page you're looking for doesn't exist or has been moved.
        </p>

        <div className="flex gap-3 justify-center">
          <Link href="/" className="btn-primary">
            Back to Discover
          </Link>
          <Link href="/launch" className="btn-secondary">
            Launch a Token
          </Link>
        </div>

        <div className="mt-10 pt-6 border-t border-border-subtle">
          <p className="text-xs text-text-tertiary font-mono">FLUER Protocol · Solana</p>
        </div>
      </div>
    </div>
  );
}
