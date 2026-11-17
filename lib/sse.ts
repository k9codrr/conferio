// lib/sse.ts
//
// Process-wide realtime event bus used by the SSE endpoints (/api/sse and
// /api/notifications/stream).
//
// Why globalThis: in Next.js every API route is bundled separately (always in
// dev, often in prod), so a module-level EventEmitter in one route is a
// different object from the one in /api/sse. Keeping the bus on globalThis
// makes publish() in any route reach every SSE connection in this process.
// Redis pub/sub (UPSTASH_REDIS_URL) fans events out to other instances; each
// instance ignores its own echo so listeners fire exactly once.
//
// Audience scoping — put one of these on the payload so /api/sse only sends
// the event to people allowed to see it:
//   userIds: string[]   → only those users
//   boardId: string     → board owner + board members
//   teamId:  string     → members of that team
// Events with none of these go to every signed-in user (keep payloads minimal).
import { EventEmitter } from "events";
import IORedis from "ioredis";
import { randomUUID } from "crypto";

export const SSE_EVENTS = {
  NEW_CLIP: "new-clip",
  CLIP_DELETED: "clip-deleted",
  TASK_CREATED: "task:created",
  TASK_UPDATED: "task:updated",
  TASK_MOVED: "task:moved",
  TASK_DELETED: "task:deleted",
  BOARD_UPDATED: "board:updated",
  // Calendar / scheduling
  EVENT_CREATED: "event:created",
  EVENT_UPDATED: "event:updated",
  EVENT_DELETED: "event:deleted",
  MEETING_CHANGED: "meeting:changed",
  REMINDER_CHANGED: "reminder:changed",
  REMINDER_DUE: "reminder:due",
  CALENDAR_CHANGED: "calendar:changed",
  // Whiteboard collaboration
  WHITEBOARD: "whiteboard",
  // Platform admin live activity
  ADMIN_ACTIVITY: "admin:activity",
  // In-app notifications (consumed by /api/notifications/stream)
  NOTIFICATION: "notification",
} as const;

export type BusMessage = { event: string; data: any };
type Listener = (msg: BusMessage) => void;

interface Bus {
  emitter: EventEmitter;
  instanceId: string;
  pub: IORedis | null;
  sub: IORedis | null;
  redisReady: boolean;
}

const CHANNEL = "conferio:sse";
const g = globalThis as unknown as { __conferioBus?: Bus };

function bus(): Bus {
  if (!g.__conferioBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(0);
    g.__conferioBus = { emitter, instanceId: randomUUID(), pub: null, sub: null, redisReady: false };
    initRedis(g.__conferioBus);
  }
  return g.__conferioBus;
}

function initRedis(b: Bus) {
  const url = process.env.UPSTASH_REDIS_URL;
  if (!url) return; // single-instance mode: local emitter only
  const opts = {
    maxRetriesPerRequest: 3,
    lazyConnect: false,
    ...(url.startsWith("rediss://") ? { tls: {} } : {}),
  };
  try {
    b.pub = new IORedis(url, opts);
    b.sub = new IORedis(url, opts);
    b.pub.on("error", (e) => console.warn("[bus:pub]", e.message));
    b.sub.on("error", (e) => console.warn("[bus:sub]", e.message));
    b.sub.subscribe(CHANNEL).then(() => { b.redisReady = true; }).catch((e) => console.warn("[bus] subscribe failed:", e.message));
    b.sub.on("message", (_ch: string, raw: string) => {
      try {
        const { origin, event, data } = JSON.parse(raw);
        if (origin === b.instanceId) return; // already delivered locally
        b.emitter.emit("*", { event, data });
        b.emitter.emit(event, data);
      } catch {
        /* malformed */
      }
    });
  } catch (e: any) {
    console.warn("[bus] Redis unavailable, local-only:", e?.message);
    b.pub = b.sub = null;
  }
}

/** Publish an event to every SSE listener on every instance. Never throws. */
export async function publish(event: string, data: any): Promise<void> {
  const b = bus();
  const payload = { ...data, type: data?.type ?? event };
  b.emitter.emit("*", { event, data: payload });
  b.emitter.emit(event, payload);
  if (b.pub) {
    try {
      await b.pub.publish(CHANNEL, JSON.stringify({ origin: b.instanceId, event, data: payload }));
    } catch (e: any) {
      console.warn("[bus] publish failed:", e?.message);
    }
  }
}

/** Listen to every event. Returns an unsubscribe function. */
export function subscribeAll(cb: Listener): () => void {
  const b = bus();
  b.emitter.on("*", cb);
  return () => b.emitter.off("*", cb);
}

// ─── Backwards-compatible API (used across existing routes) ─────────────────

export async function broadcastClipEvent(event: string, data: any) {
  return publish(event, data);
}

export function subscribeToClipEvent(event: string, callback: (data: any) => void): () => void {
  const b = bus();
  b.emitter.on(event, callback);
  return () => b.emitter.off(event, callback);
}

/** Convenience: realtime event scoped to a team's members. */
export function publishToTeam(teamId: string, event: string, data: Record<string, any> = {}) {
  return publish(event, { ...data, teamId });
}

/** Convenience: realtime event scoped to specific users. */
export function publishToUsers(userIds: string[], event: string, data: Record<string, any> = {}) {
  return publish(event, { ...data, userIds: Array.from(new Set(userIds.filter(Boolean))) });
}
