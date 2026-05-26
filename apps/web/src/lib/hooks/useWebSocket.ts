"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { WS_URL } from "@/lib/constants";
import type { WsEvent } from "@/lib/types";

type WsStatus = "connecting" | "connected" | "disconnected" | "error";

interface UseWebSocketOptions {
  onEvent?: (event: WsEvent) => void;
  subscriptions?: string[]; // market IDs or token mints to subscribe to
  enabled?: boolean;
}

const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 1_000;

export function useWebSocket({
  onEvent,
  subscriptions = [],
  enabled = true,
}: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const isMounted = useRef(true);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const [status, setStatus] = useState<WsStatus>("disconnected");
  const [lastEvent, setLastEvent] = useState<WsEvent | null>(null);

  const sendSubscription = useCallback(
    (ws: WebSocket, subs: string[]) => {
      if (ws.readyState === WebSocket.OPEN && subs.length > 0) {
        ws.send(
          JSON.stringify({ action: "subscribe", channels: subs })
        );
      }
    },
    []
  );

  const connect = useCallback(() => {
    if (!isMounted.current || !enabled) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;
    setStatus("connecting");

    ws.onopen = () => {
      if (!isMounted.current) return;
      reconnectAttempts.current = 0;
      setStatus("connected");

      // Send subscriptions immediately on connect
      sendSubscription(ws, subscriptions);
    };

    ws.onmessage = (event) => {
      if (!isMounted.current) return;
      try {
        const parsed = JSON.parse(event.data) as WsEvent;
        setLastEvent(parsed);
        onEventRef.current?.(parsed);
      } catch {
        // Ignore malformed messages
      }
    };

    ws.onerror = () => {
      if (!isMounted.current) return;
      setStatus("error");
    };

    ws.onclose = () => {
      if (!isMounted.current) return;
      setStatus("disconnected");
      wsRef.current = null;

      if (!enabled) return;

      // Exponential backoff reconnect
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts.current),
        MAX_RECONNECT_DELAY_MS
      );
      reconnectAttempts.current++;

      reconnectTimerRef.current = setTimeout(() => {
        if (isMounted.current && enabled) connect();
      }, delay);
    };
  }, [enabled, subscriptions, sendSubscription]);

  useEffect(() => {
    isMounted.current = true;
    if (enabled) connect();

    return () => {
      isMounted.current = false;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (wsRef.current) {
        wsRef.current.onclose = null; // prevent reconnect on intentional close
        wsRef.current.close(1000, "Component unmounted");
        wsRef.current = null;
      }
    };
  }, [connect, enabled]);

  // Update subscriptions when they change
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendSubscription(wsRef.current, subscriptions);
    }
  }, [subscriptions, sendSubscription]);

  const send = useCallback((message: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  return { status, lastEvent, send, isConnected: status === "connected" };
}
