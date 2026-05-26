export default function Loading() {
  return (
    <div className="flex items-center justify-center h-full min-h-[400px]">
      <div className="flex flex-col items-center gap-4">
        {/* FLUER logo pulse */}
        <div className="relative">
          <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
            <defs>
              <radialGradient id="loading-glow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.4" />
                <stop offset="100%" stopColor="#7C5CFC" stopOpacity="0" />
              </radialGradient>
            </defs>
            <circle cx="16" cy="16" r="14" fill="url(#loading-glow)" className="animate-pulse" />
            <polygon
              points="16,11 20,13.5 20,18.5 16,21 12,18.5 12,13.5"
              fill="#7C5CFC"
              className="animate-pulse"
              style={{ animationDelay: "150ms" }}
            />
            <circle cx="16" cy="16" r="2.5" fill="#C4B5FD"
              className="animate-pulse"
              style={{ animationDelay: "300ms" }}
            />
          </svg>
          <div className="absolute -inset-2 rounded-full border border-accent-primary/20 animate-ping" />
        </div>
        <p className="text-xs text-text-tertiary font-mono tracking-wider animate-pulse">
          LOADING
        </p>
      </div>
    </div>
  );
}
