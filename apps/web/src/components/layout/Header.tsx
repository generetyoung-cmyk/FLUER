"use client";

import React, { useState, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { FluerLogo } from "@/components/ui/icons/FluerLogo";
import {
  LaunchIcon,
  PerpIcon,
  PredictIcon,
  DiscoverIcon,
  SearchIcon,
  SettingsIcon,
} from "@/components/ui/icons/NavIcons";
import { WalletButton } from "@/components/wallet/WalletButton";
import { clsx } from "clsx";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badge?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: "Discover", href: "/", icon: DiscoverIcon },
  { label: "Launch", href: "/launch", icon: LaunchIcon },
  { label: "Trade", href: "/trade", icon: PerpIcon },
  { label: "Predict", href: "/predict", icon: PredictIcon },
];

export function Header() {
  const pathname = usePathname();
  const [searchOpen, setSearchOpen] = useState(false);

  const isActive = useCallback(
    (href: string) => {
      if (href === "/") return pathname === "/";
      return pathname.startsWith(href);
    },
    [pathname]
  );

  return (
    <header
      className="h-[48px] flex items-center border-b border-border-default bg-bg-base
                 px-4 gap-4 sticky top-0 z-50 shrink-0"
      style={{ borderBottom: "1px solid #1F1F28" }}
    >
      {/* ── Logo ──────────────────────────────────── */}
      <Link href="/" className="shrink-0 mr-2">
        <FluerLogo size={24} showWordmark />
      </Link>

      {/* ── Nav ───────────────────────────────────── */}
      <nav className="flex items-center gap-1 flex-1">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={clsx(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium",
                "transition-colors duration-150 select-none relative",
                active
                  ? "text-text-primary bg-bg-hover"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover"
              )}
            >
              <Icon size={14} />
              <span>{item.label}</span>
              {item.badge && (
                <span className="badge-accent text-2xs py-px px-1 ml-0.5">
                  {item.badge}
                </span>
              )}
              {/* Active indicator */}
              {active && (
                <span
                  className="absolute bottom-0 left-1/2 -translate-x-1/2 w-4 h-0.5
                             bg-accent-primary rounded-full"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Right controls ────────────────────────── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Protocol stats — live */}
        <div
          className="hidden md:flex items-center gap-3 px-3 border-r border-border-subtle
                     text-xs text-text-tertiary mr-1 h-full"
        >
          <span className="flex items-center gap-1.5">
            <span className="live-dot" />
            <span className="font-mono">Live</span>
          </span>
        </div>

        {/* Search */}
        <button
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-bg-input
                     border border-border-default hover:border-border-strong
                     text-text-tertiary text-sm transition-colors group"
          aria-label="Search (⌘K)"
        >
          <SearchIcon size={13} />
          <span className="hidden md:inline group-hover:text-text-secondary transition-colors">
            Search...
          </span>
          <kbd
            className="hidden md:inline text-2xs border border-border-default rounded px-1
                       text-text-tertiary font-mono bg-bg-raised"
          >
            ⌘K
          </kbd>
        </button>

        {/* Settings */}
        <button
          className="p-1.5 rounded-md text-text-tertiary hover:text-text-secondary
                     hover:bg-bg-hover transition-colors"
          aria-label="Settings"
        >
          <SettingsIcon size={16} />
        </button>

        {/* Wallet */}
        <WalletButton />
      </div>
    </header>
  );
}
