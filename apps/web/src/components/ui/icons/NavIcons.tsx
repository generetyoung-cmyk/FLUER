"use client";

import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

const icon = (
  viewBox: string,
  path: React.ReactNode,
  displayName: string
) => {
  const Component = ({ size = 16, className = "", strokeWidth = 1.5 }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox={viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={displayName}
      strokeWidth={strokeWidth}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {path}
    </svg>
  );
  Component.displayName = displayName;
  return Component;
};

/** Rocket — Launch */
export const LaunchIcon = icon(
  "0 0 24 24",
  <>
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2a2.58 2.58 0 0 0-3-3Z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11A22.35 22.35 0 0 1 13 15Z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </>,
  "Launch"
);

/** Chart with lightning — Perpetuals */
export const PerpIcon = icon(
  "0 0 24 24",
  <>
    <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
    <polyline points="16 7 22 7 22 13" />
    <path d="M12 22v-3l-2-2h-3" strokeDasharray="2 2" strokeOpacity="0.5" />
    <circle cx="5" cy="19" r="2" fill="currentColor" stroke="none" />
  </>,
  "Perpetuals"
);

/** Target crosshair — Predictions */
export const PredictIcon = icon(
  "0 0 24 24",
  <>
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="6" />
    <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
    <line x1="22" y1="12" x2="18" y2="12" />
    <line x1="6" y1="12" x2="2" y2="12" />
    <line x1="12" y1="6" x2="12" y2="2" />
    <line x1="12" y1="22" x2="12" y2="18" />
  </>,
  "Predictions"
);

/** Compass — Discover */
export const DiscoverIcon = icon(
  "0 0 24 24",
  <>
    <circle cx="12" cy="12" r="10" />
    <polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" fill="currentColor" stroke="none" />
  </>,
  "Discover"
);

/** Trending up arrow */
export const TrendingIcon = icon(
  "0 0 24 24",
  <>
    <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
    <polyline points="17 6 23 6 23 12" />
  </>,
  "Trending"
);

/** Lightning bolt — New / Fast */
export const NewIcon = icon(
  "0 0 24 24",
  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" fill="currentColor" stroke="none" />,
  "New"
);

/** Graduation cap */
export const GraduatedIcon = icon(
  "0 0 24 24",
  <>
    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
    <path d="M6 12v5c3 3 9 3 12 0v-5" />
  </>,
  "Graduated"
);

/** Dollar sign in circle — Volume / High Volume */
export const VolumeIcon = icon(
  "0 0 24 24",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v2M12 16v2M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M15 17H9" />
  </>,
  "Volume"
);

/** Flame — Hot */
export const FlameIcon = icon(
  "0 0 24 24",
  <path
    d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
    fill="currentColor"
    stroke="none"
  />,
  "Hot"
);

/** Settings gear */
export const SettingsIcon = icon(
  "0 0 24 24",
  <>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </>,
  "Settings"
);

/** Search */
export const SearchIcon = icon(
  "0 0 24 24",
  <>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </>,
  "Search"
);

/** Close X */
export const CloseIcon = icon(
  "0 0 24 24",
  <>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </>,
  "Close"
);

/** Chevron down */
export const ChevronDownIcon = icon(
  "0 0 24 24",
  <polyline points="6 9 12 15 18 9" />,
  "ChevronDown"
);

/** Arrow up-right (external link) */
export const ExternalLinkIcon = icon(
  "0 0 24 24",
  <>
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    <polyline points="15 3 21 3 21 9" />
    <line x1="10" y1="14" x2="21" y2="3" />
  </>,
  "ExternalLink"
);

/** Copy */
export const CopyIcon = icon(
  "0 0 24 24",
  <>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </>,
  "Copy"
);

/** Portfolio / briefcase */
export const PortfolioIcon = icon(
  "0 0 24 24",
  <>
    <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
    <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
  </>,
  "Portfolio"
);

/** Info circle */
export const InfoIcon = icon(
  "0 0 24 24",
  <>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="8" x2="12" y2="12" />
    <line x1="12" y1="16" x2="12.01" y2="16" strokeWidth={2.5} />
  </>,
  "Info"
);

/** Check mark */
export const CheckIcon = icon(
  "0 0 24 24",
  <polyline points="20 6 9 17 4 12" />,
  "Check"
);

/** Plus */
export const PlusIcon = icon(
  "0 0 24 24",
  <>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </>,
  "Plus"
);

/** Upload */
export const UploadIcon = icon(
  "0 0 24 24",
  <>
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </>,
  "Upload"
);

/** Solana network logo (stylized S) */
export function SolanaIcon({ size = 16, className = "" }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Solana"
    >
      <defs>
        <linearGradient id="sol-grad" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#9945FF" />
          <stop offset="50%" stopColor="#14F195" />
          <stop offset="100%" stopColor="#00C2FF" />
        </linearGradient>
      </defs>
      {/* Three Solana bars */}
      <rect x="4" y="6" width="24" height="4" rx="1" fill="url(#sol-grad)" />
      <rect x="4" y="14" width="24" height="4" rx="1" fill="url(#sol-grad)" transform="translate(2 0)" style={{ transform: 'translateX(0)' }} />
      <rect x="4" y="22" width="24" height="4" rx="1" fill="url(#sol-grad)" />
      {/* Diagonal cut effect */}
      <path d="M4 6 L28 6 L24 10 L4 10 Z" fill="url(#sol-grad)" opacity="0.9" />
      <path d="M6 14 L28 14 L26 18 L4 18 Z" fill="url(#sol-grad)" opacity="0.9" />
      <path d="M4 22 L28 22 L24 26 L4 26 Z" fill="url(#sol-grad)" opacity="0.9" />
    </svg>
  );
}

/** Long arrow indicator */
export function LongArrowIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className}>
      <path d="M6 10V2M2 6l4-4 4 4" stroke="#22C55E" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Short arrow indicator */
export function ShortArrowIcon({ size = 12, className = "" }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 12 12" fill="none" className={className}>
      <path d="M6 2v8M2 6l4 4 4-4" stroke="#EF4444" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
