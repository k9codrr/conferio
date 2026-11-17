"use client";

// Refetch React Query keys when matching realtime events arrive (debounced).
//   useLiveInvalidate([['events']], { sources: ['Event'] })
// `sources` filters `calendar:changed` events by Prisma model name; omit to
// react to every calendar/meeting/reminder change.
import { useEffect, useRef } from "react";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useSSE } from "./useSSE";

const DEFAULT_TYPES = ["calendar:changed", "meeting:changed", "event:created", "event:updated", "event:deleted", "reminder:changed"];

export function useLiveInvalidate(
  keys: QueryKey[],
  opts: { sources?: string[]; types?: string[]; delayMs?: number } = {}
) {
  const queryClient = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keysRef = useRef(keys);
  keysRef.current = keys;

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  useSSE((evt) => {
    const types = opts.types ?? DEFAULT_TYPES;
    const relevant =
      evt.type === "sse:reconnected" ||
      (types.includes(evt.type) &&
        (evt.type !== "calendar:changed" || !opts.sources || opts.sources.includes(evt.source)));
    if (!relevant) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      keysRef.current.forEach((queryKey) => queryClient.invalidateQueries({ queryKey }));
    }, opts.delayMs ?? 300);
  });
}
