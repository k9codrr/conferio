"use client";

// One shared EventSource('/api/sse') per browser tab, fanned out to every
// useSSE() subscriber. Reconnects with backoff and tells subscribers when the
// stream (re)connects so they can refetch anything missed while offline.
import { useEffect, useRef } from "react";

type Handler = (data: any) => void;

const handlers = new Set<Handler>();
let es: EventSource | null = null;
let retry = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let hasConnectedBefore = false;

function dispatch(data: any) {
  handlers.forEach((h) => {
    try {
      h(data);
    } catch (e) {
      console.error("[SSE] handler error", e);
    }
  });
}

function open() {
  if (typeof window === "undefined" || es || !handlers.size) return;
  es = new EventSource("/api/sse");

  es.onmessage = (e) => {
    if (!e.data || e.data.startsWith(":")) return;
    let data: any;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.type === "connected") {
      retry = 0;
      // After a drop, let pages resync state they may have missed.
      if (hasConnectedBefore) dispatch({ type: "sse:reconnected" });
      hasConnectedBefore = true;
      return;
    }
    dispatch(data);
  };

  es.onerror = () => {
    es?.close();
    es = null;
    if (!handlers.size) return;
    const delay = Math.min(30_000, 1000 * 2 ** retry++);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(open, delay);
  };
}

function close() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
  es?.close();
  es = null;
}

/** Subscribe to realtime events. The handler may change between renders. */
export function useSSE(onMessage: Handler) {
  const ref = useRef(onMessage);
  ref.current = onMessage;

  useEffect(() => {
    const h: Handler = (d) => ref.current(d);
    handlers.add(h);
    open();
    return () => {
      handlers.delete(h);
      if (!handlers.size) close();
    };
  }, []);
}
