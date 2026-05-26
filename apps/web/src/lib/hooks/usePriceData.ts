import { useEffect, useRef } from "react";
import { useAppStore } from "@/lib/store/useAppStore";

// SOL/USD Pyth price feed ID (mainnet)
const SOL_USD_FEED_ID =
  "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";

const PYTH_HERMES_URL = "https://hermes.pyth.network";

/**
 * Fetches SOL/USD price from Pyth Hermes API every 5 seconds.
 * Stores in Zustand global store for use across components.
 *
 * Uses the streaming SSE endpoint for real-time updates.
 */
export function useSolPrice() {
  const setSolPrice = useAppStore((s) => s.setSolPrice);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;

    async function fetchSolPrice() {
      try {
        const resp = await fetch(
          `${PYTH_HERMES_URL}/v2/updates/price/latest?ids[]=${SOL_USD_FEED_ID}`,
          { signal: AbortSignal.timeout(5_000) }
        );

        if (!resp.ok) return;

        const data = await resp.json();
        const priceData = data?.parsed?.[0]?.price;

        if (priceData?.price && priceData?.expo !== undefined) {
          const price =
            parseInt(priceData.price) * Math.pow(10, priceData.expo);

          if (price > 0 && isMounted.current) {
            setSolPrice(price);
          }
        }
      } catch {
        // Silently ignore — price will remain at last known value
      }
    }

    fetchSolPrice();
    const interval = setInterval(fetchSolPrice, 5_000);

    return () => {
      isMounted.current = false;
      clearInterval(interval);
    };
  }, [setSolPrice]);

  return useAppStore((s) => s.solPriceUsd);
}

/**
 * Calculate token USD price from SOL price
 */
export function useTokenPriceUsd(
  priceSol: number | undefined
): number {
  const solPriceUsd = useAppStore((s) => s.solPriceUsd);
  if (!priceSol || !solPriceUsd) return 0;
  return priceSol * solPriceUsd;
}
