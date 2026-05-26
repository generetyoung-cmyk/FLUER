import { useCallback, useState } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPositions } from "@/lib/api/fluer";
import { useTradeStore } from "@/lib/store/useTradeStore";
import toast from "react-hot-toast";
import type { Position } from "@/lib/types";

interface UsePositionOptions {
  marketId: string;
}

export function usePosition({ marketId }: UsePositionOptions) {
  const { publicKey, signTransaction, connected } = useWallet();
  const { connection } = useConnection();
  const queryClient = useQueryClient();
  const { setPositions } = useTradeStore();

  const [isOpening, setIsOpening] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  // Fetch open positions for this wallet + market
  const { data: positions = [], isLoading } = useQuery({
    queryKey: ["positions", publicKey?.toBase58(), marketId],
    queryFn: () => getPositions(publicKey!.toBase58()),
    enabled: !!publicKey,
    staleTime: 15_000,
    refetchInterval: 30_000,
    select: (data) => data.filter((p) => p.market_id === marketId),
  });

  const openPosition = useCallback(
    async (params: {
      side: "Long" | "Short";
      collateralUsdc: number;
      leverage: number;
      slippageBps: number;
    }) => {
      if (!connected || !publicKey || !signTransaction) {
        toast.error("Connect your wallet first");
        return;
      }

      setIsOpening(true);
      const toastId = toast.loading("Opening position...");

      try {
        // Fetch unsigned transaction from API
        const res = await fetch(`/api/v1/positions/open`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market_id: marketId,
            wallet: publicKey.toBase58(),
            ...params,
          }),
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.message ?? "Failed to build transaction");
        }

        const { transaction_base64 } = await res.json();

        // Deserialize, sign, broadcast
        const txBytes = Uint8Array.from(atob(transaction_base64), (c) =>
          c.charCodeAt(0)
        );
        const tx = VersionedTransaction.deserialize(txBytes);
        const signed = await signTransaction(tx as any);

        toast.loading("Broadcasting...", { id: toastId });

        const sig = await connection.sendRawTransaction(
          (signed as VersionedTransaction).serialize(),
          { skipPreflight: false }
        );

        await connection.confirmTransaction(
          { signature: sig, ...(await connection.getLatestBlockhash()) },
          "confirmed"
        );

        toast.success("Position opened!", { id: toastId });

        // Invalidate positions cache
        queryClient.invalidateQueries({ queryKey: ["positions", publicKey.toBase58()] });
      } catch (err: any) {
        const msg = err?.message ?? "Failed";
        toast.error(
          msg.includes("rejected") ? "Rejected by wallet" : `Error: ${msg}`,
          { id: toastId }
        );
      } finally {
        setIsOpening(false);
      }
    },
    [connected, publicKey, signTransaction, connection, marketId, queryClient]
  );

  const closePosition = useCallback(
    async (positionId: string, minUsdcOut: number) => {
      if (!connected || !publicKey || !signTransaction) {
        toast.error("Connect your wallet first");
        return;
      }

      setIsClosing(true);
      const toastId = toast.loading("Closing position...");

      try {
        const res = await fetch(`/api/v1/positions/close`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            position_id: positionId,
            wallet: publicKey.toBase58(),
            min_usdc_out: Math.floor(minUsdcOut * 1e6),
          }),
        });

        if (!res.ok) throw new Error("Failed to build close transaction");

        const { transaction_base64 } = await res.json();

        const txBytes = Uint8Array.from(atob(transaction_base64), (c) =>
          c.charCodeAt(0)
        );
        const tx = VersionedTransaction.deserialize(txBytes);
        const signed = await signTransaction(tx as any);

        const sig = await connection.sendRawTransaction(
          (signed as VersionedTransaction).serialize()
        );

        await connection.confirmTransaction(
          { signature: sig, ...(await connection.getLatestBlockhash()) },
          "confirmed"
        );

        toast.success("Position closed!", { id: toastId });
        queryClient.invalidateQueries({ queryKey: ["positions", publicKey.toBase58()] });
      } catch (err: any) {
        toast.error(err?.message ?? "Close failed", { id: toastId });
      } finally {
        setIsClosing(false);
      }
    },
    [connected, publicKey, signTransaction, connection, queryClient]
  );

  return {
    positions,
    isLoading,
    openPosition,
    closePosition,
    isOpening,
    isClosing,
  };
}
