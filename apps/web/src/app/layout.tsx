import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { WalletContextProvider } from "@/components/wallet/WalletContextProvider";
import { QueryProvider } from "@/lib/store/QueryProvider";
import { Toaster } from "react-hot-toast";

// ── Fonts ─────────────────────────────────────────────────────
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// ── Metadata ──────────────────────────────────────────────────
export const metadata: Metadata = {
  title: {
    default: "FLUER — Integrated Speculative Market Infrastructure",
    template: "%s · FLUER",
  },
  description:
    "The first unified speculative protocol on Solana. Launch tokens, trade perpetuals, and bet on prediction markets — all in one place.",
  keywords: [
    "FLUER", "Solana", "DeFi", "perpetuals", "prediction markets",
    "token launchpad", "vAMM", "Solana trading", "pump.fun", "bonding curve",
  ],
  authors: [{ name: "FLUER Protocol" }],
  creator: "FLUER Protocol",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://fluer.io",
    title: "FLUER — Integrated Speculative Market Infrastructure",
    description:
      "Launch · Trade Perps · Predict. The complete speculative lifecycle for every Solana token.",
    siteName: "FLUER Protocol",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    title: "FLUER Protocol",
    description: "Launch · Trade Perps · Predict — One Protocol. Every Solana Token.",
    creator: "@FLUERprotocol",
    images: ["/og-image.png"],
  },
  robots: { index: true, follow: true },
  metadataBase: new URL("https://fluer.io"),
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0A0A0B",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
      </head>
      <body className="bg-bg-base text-text-primary font-body antialiased">
        <QueryProvider>
          <WalletContextProvider>
            {children}
            <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "#18181D",
                  color: "#F4F4F6",
                  border: "1px solid #2A2A38",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontFamily: "var(--font-geist-sans)",
                },
                success: { iconTheme: { primary: "#22C55E", secondary: "#18181D" } },
                error: { iconTheme: { primary: "#EF4444", secondary: "#18181D" } },
              }}
            />
          </WalletContextProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
