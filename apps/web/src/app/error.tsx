"use client";

import { useEffect } from "react";

interface ErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function Error({ error, reset }: ErrorProps) {
  useEffect(() => {
    console.error("FLUER app error:", error);
  }, [error]);

  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="max-w-sm w-full text-center p-6">
        <div className="w-12 h-12 rounded-full bg-bg-negative border border-negative/30
                        flex items-center justify-center mx-auto mb-4">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
               stroke="#EF4444" strokeWidth="2" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth="3" />
          </svg>
        </div>

        <h2 className="text-lg font-semibold text-text-primary mb-2">
          Something went wrong
        </h2>

        <p className="text-sm text-text-secondary mb-4 leading-relaxed">
          {error.message || "An unexpected error occurred"}
        </p>

        {error.digest && (
          <p className="text-xs text-text-tertiary font-mono mb-4">
            Error ID: {error.digest}
          </p>
        )}

        <div className="flex gap-2 justify-center">
          <button
            onClick={reset}
            className="btn-primary text-sm"
          >
            Try again
          </button>
          <a href="/" className="btn-secondary text-sm">
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
