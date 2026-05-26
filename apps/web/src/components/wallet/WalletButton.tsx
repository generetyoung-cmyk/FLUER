"use client";

import React, { useState, useCallback } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { WalletIcon } from "@/components/ui/icons/WalletIcons";
import { ChevronDownIcon, CopyIcon, CheckIcon } from "@/components/ui/icons/NavIcons";
import { clsx } from "clsx";

function truncatePubkey(pubkey: string): string {
  return `${pubkey.slice(0, 4)}...${pubkey.slice(-4)}`;
}

export function WalletButton() {
  const { wallet, publicKey, disconnect, connecting, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnect = useCallback(() => {
    setVisible(true);
  }, [setVisible]);

  const handleCopyAddress = useCallback(async () => {
    if (!publicKey) return;
    await navigator.clipboard.writeText(publicKey.toBase58());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [publicKey]);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setMenuOpen(false);
  }, [disconnect]);

  // Not connected
  if (!connected || !publicKey) {
    return (
      <button
        onClick={handleConnect}
        disabled={connecting}
        className={clsx(
          "flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-semibold",
          "bg-accent-primary text-white hover:bg-accent-hover",
          "transition-all duration-150 active:scale-[0.98]",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          "shadow-accent"
        )}
      >
        {connecting ? (
          <>
            <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            Connecting...
          </>
        ) : (
          "Connect Wallet"
        )}
      </button>
    );
  }

  // Connected
  const walletName = wallet?.adapter.name ?? "Wallet";
  const pubkeyStr = publicKey.toBase58();

  return (
    <div className="relative">
      <button
        onClick={() => setMenuOpen((v) => !v)}
        className={clsx(
          "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium",
          "bg-bg-elevated border border-border-default hover:border-border-strong",
          "transition-all duration-150 text-text-primary",
          menuOpen && "border-accent-border"
        )}
      >
        <WalletIcon walletName={walletName} size={18} />
        <span className="font-mono text-xs">{truncatePubkey(pubkeyStr)}</span>
        <ChevronDownIcon
          size={12}
          className={clsx(
            "text-text-tertiary transition-transform duration-150",
            menuOpen && "rotate-180"
          )}
        />
      </button>

      {/* Dropdown menu */}
      {menuOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setMenuOpen(false)}
          />

          <div
            className={clsx(
              "absolute right-0 top-full mt-1.5 z-50 w-56",
              "bg-bg-raised border border-border-default rounded-xl",
              "shadow-elevated overflow-hidden animate-slide-down"
            )}
          >
            {/* Wallet info */}
            <div className="px-3 py-3 border-b border-border-subtle">
              <div className="flex items-center gap-2.5 mb-1">
                <WalletIcon walletName={walletName} size={22} />
                <div>
                  <p className="text-sm font-medium text-text-primary">{walletName}</p>
                  <p className="text-xs text-text-tertiary font-mono">
                    {truncatePubkey(pubkeyStr)}
                  </p>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                onClick={handleCopyAddress}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-text-secondary
                           hover:text-text-primary hover:bg-bg-hover transition-colors"
              >
                {copied ? (
                  <CheckIcon size={14} className="text-positive" />
                ) : (
                  <CopyIcon size={14} />
                )}
                {copied ? "Copied!" : "Copy address"}
              </button>

              <button
                onClick={handleDisconnect}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-negative
                           hover:bg-bg-negative hover:text-negative transition-colors"
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                >
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
                Disconnect
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
