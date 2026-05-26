"use client";

import React from "react";

interface FluerLogoProps {
  size?: number;
  showWordmark?: boolean;
  className?: string;
}

/**
 * FLUER Protocol Logo
 * Geometric abstraction: six-pointed crystal form suggesting a flower (fleur)
 * and financial precision. Pure SVG, no raster assets required.
 */
export function FluerLogo({
  size = 32,
  showWordmark = true,
  className = "",
}: FluerLogoProps) {
  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`}>
      {/* Mark */}
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Outer glow */}
        <defs>
          <radialGradient id="fluer-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#7C5CFC" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#7C5CFC" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="fluer-grad-1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#A78BFA" />
            <stop offset="100%" stopColor="#7C5CFC" />
          </linearGradient>
          <linearGradient id="fluer-grad-2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#7C5CFC" />
            <stop offset="100%" stopColor="#5B3FD4" />
          </linearGradient>
        </defs>

        {/* Background glow */}
        <circle cx="16" cy="16" r="14" fill="url(#fluer-glow)" />

        {/* Six-petal crystal form — six rhombus petals around center */}
        {/* Top petal */}
        <path
          d="M16 2 L19.5 10 L16 13 L12.5 10 Z"
          fill="url(#fluer-grad-1)"
          opacity="0.95"
        />
        {/* Top-right petal */}
        <path
          d="M24 5.5 L24.5 14 L19.5 14 L18 9.5 Z"
          fill="url(#fluer-grad-1)"
          opacity="0.85"
        />
        {/* Bottom-right petal */}
        <path
          d="M30 16 L24.5 20.5 L19.5 18 L22 13.5 Z"
          fill="url(#fluer-grad-2)"
          opacity="0.9"
        />
        {/* Bottom petal */}
        <path
          d="M16 30 L12.5 22 L16 19 L19.5 22 Z"
          fill="url(#fluer-grad-2)"
          opacity="0.95"
        />
        {/* Bottom-left petal */}
        <path
          d="M8 26.5 L7.5 18 L12.5 18 L14 22.5 Z"
          fill="url(#fluer-grad-1)"
          opacity="0.85"
        />
        {/* Top-left petal */}
        <path
          d="M2 16 L7.5 11.5 L12.5 14 L10 18.5 Z"
          fill="url(#fluer-grad-1)"
          opacity="0.9"
        />

        {/* Inner hexagon core */}
        <polygon
          points="16,11 20,13.5 20,18.5 16,21 12,18.5 12,13.5"
          fill="#7C5CFC"
          opacity="1"
        />

        {/* Center dot */}
        <circle cx="16" cy="16" r="2.5" fill="#C4B5FD" />

        {/* Subtle ring */}
        <circle
          cx="16"
          cy="16"
          r="13.5"
          stroke="#7C5CFC"
          strokeWidth="0.5"
          strokeOpacity="0.3"
          fill="none"
        />
      </svg>

      {/* Wordmark */}
      {showWordmark && (
        <span
          className="font-display font-bold tracking-tight select-none"
          style={{
            fontSize: size * 0.56,
            color: "#F4F4F6",
            letterSpacing: "-0.02em",
          }}
        >
          FLUER
        </span>
      )}
    </div>
  );
}

/** Compact mark-only version for tight spaces */
export function FluerMark({ size = 20, className = "" }: { size?: number; className?: string }) {
  return <FluerLogo size={size} showWordmark={false} className={className} />;
}
