"use client";

import React from "react";

interface WalletIconProps {
  size?: number;
  className?: string;
}

/**
 * Phantom Wallet — official purple ghost logo
 * Recreated as precise SVG from official brand assets
 */
export function PhantomIcon({ size = 24, className = "" }: WalletIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Phantom"
    >
      <rect width="40" height="40" rx="10" fill="#AB9FF2" />
      <path
        d="M8 20.5C8 14.149 13.149 9 19.5 9H27C27 9 31 9 31 13C31 17 27 17 27 17H19.5C15.358 17 12 20.358 12 24.5C12 28.642 15.358 32 19.5 32H24V27H19.5C17.567 27 16 25.433 16 23.5C16 21.567 17.567 20 19.5 20H27C30.314 20 33 17.314 33 14V13C33 9.134 29.866 6 26 6H19.5C12.044 6 6 12.044 6 19.5C6 26.956 12.044 33 19.5 33H26V38H19.5C9.835 38 2 30.165 2 20.5Z"
        fill="white"
        opacity="0"
      />
      {/* Simplified ghost face */}
      <path
        d="M20 8C13.925 8 9 12.925 9 19v8.5C9 30.537 11.463 33 14.5 33S20 30.537 20 27.5V27h0.5C23.537 27 26 24.537 26 21.5v-2.5C26 12.925 26.075 8 20 8Z"
        fill="white"
        opacity="0.95"
      />
      <path
        d="M20 8C14.477 8 10 12.477 10 18v9.5c0 2.485 2.015 4.5 4.5 4.5S19 29.985 19 27.5V27h2v0.5c0 2.485 2.015 4.5 4.5 4.5S30 29.985 30 27.5V18c0-5.523-4.477-10-10-10Z"
        fill="white"
      />
      {/* Eyes */}
      <circle cx="16.5" cy="19" r="1.5" fill="#AB9FF2" />
      <circle cx="23.5" cy="19" r="1.5" fill="#AB9FF2" />
    </svg>
  );
}

/**
 * Backpack Wallet — coral/red backpack icon
 */
export function BackpackIcon({ size = 24, className = "" }: WalletIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Backpack"
    >
      <rect width="40" height="40" rx="10" fill="#E33E3F" />
      {/* Backpack strap top */}
      <path
        d="M15 12C15 9.791 16.791 8 19 8H21C23.209 8 25 9.791 25 12V14H15V12Z"
        fill="white"
        opacity="0.9"
      />
      {/* Backpack body */}
      <rect x="10" y="14" width="20" height="17" rx="4" fill="white" />
      {/* Pocket */}
      <rect x="14" y="19" width="12" height="8" rx="2" fill="#E33E3F" opacity="0.2" />
      {/* Strap */}
      <rect x="17" y="14" width="6" height="3" rx="1" fill="#E33E3F" opacity="0.3" />
      {/* Zipper pull */}
      <rect x="18.5" y="22" width="3" height="1.5" rx="0.75" fill="#E33E3F" opacity="0.6" />
    </svg>
  );
}

/**
 * Solflare Wallet — orange/amber sunflare logo
 */
export function SolflareIcon({ size = 24, className = "" }: WalletIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Solflare"
    >
      <defs>
        <linearGradient id="solflare-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#FC9F26" />
          <stop offset="100%" stopColor="#F97316" />
        </linearGradient>
        <linearGradient id="solflare-ray" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="#FFF7ED" />
          <stop offset="100%" stopColor="#FED7AA" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="10" fill="url(#solflare-bg)" />
      {/* Sun core */}
      <circle cx="20" cy="20" r="6" fill="url(#solflare-ray)" />
      {/* Rays — 8 triangular rays */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => {
        const rad = (angle * Math.PI) / 180;
        const x1 = 20 + 8 * Math.cos(rad);
        const y1 = 20 + 8 * Math.sin(rad);
        const x2 = 20 + 14 * Math.cos(rad - 0.2);
        const y2 = 20 + 14 * Math.sin(rad - 0.2);
        const x3 = 20 + 14 * Math.cos(rad + 0.2);
        const y3 = 20 + 14 * Math.sin(rad + 0.2);
        return (
          <polygon
            key={i}
            points={`${x1},${y1} ${x2},${y2} ${x3},${y3}`}
            fill="white"
            opacity="0.85"
          />
        );
      })}
      {/* Inner glow */}
      <circle cx="20" cy="20" r="4" fill="white" opacity="0.6" />
    </svg>
  );
}

/**
 * OKX Wallet — black/white OKX brand
 */
export function OKXWalletIcon({ size = 24, className = "" }: WalletIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="OKX Wallet"
    >
      <rect width="40" height="40" rx="10" fill="#000000" />
      {/* OKX logo: three squares in an X-dot pattern */}
      <rect x="8" y="8" width="10" height="10" rx="2" fill="white" />
      <rect x="22" y="8" width="10" height="10" rx="2" fill="white" />
      <rect x="8" y="22" width="10" height="10" rx="2" fill="white" />
      {/* Center is empty = OKX pattern */}
      <rect x="22" y="22" width="10" height="10" rx="2" fill="white" opacity="0.3" />
    </svg>
  );
}

/**
 * Coinbase Wallet icon
 */
export function CoinbaseWalletIcon({ size = 24, className = "" }: WalletIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Coinbase Wallet"
    >
      <rect width="40" height="40" rx="10" fill="#1652F0" />
      <circle cx="20" cy="20" r="11" fill="white" />
      {/* Blue square in center — Coinbase brand mark */}
      <rect x="14.5" y="14.5" width="11" height="11" rx="2.5" fill="#1652F0" />
    </svg>
  );
}

/** Generic wallet fallback icon */
export function GenericWalletIcon({ size = 24, className = "" }: WalletIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Wallet"
    >
      <rect x="2" y="7" width="20" height="14" rx="3" stroke="currentColor" strokeWidth="1.5" fill="none" />
      <path d="M6 7V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="17" cy="14" r="1.5" fill="currentColor" />
    </svg>
  );
}

/** Map wallet adapter name to icon component */
export function WalletIcon({
  walletName,
  size = 24,
  className = "",
}: {
  walletName: string;
  size?: number;
  className?: string;
}) {
  const name = walletName.toLowerCase();
  if (name.includes("phantom")) return <PhantomIcon size={size} className={className} />;
  if (name.includes("backpack")) return <BackpackIcon size={size} className={className} />;
  if (name.includes("solflare")) return <SolflareIcon size={size} className={className} />;
  if (name.includes("okx")) return <OKXWalletIcon size={size} className={className} />;
  if (name.includes("coinbase")) return <CoinbaseWalletIcon size={size} className={className} />;
  return <GenericWalletIcon size={size} className={className} />;
}
