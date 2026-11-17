// lib/realtime/prisma-hooks.ts
// One Prisma middleware that turns writes on "dated" models into realtime
// `calendar:changed` events, so the calendar (and anything else listening)
// updates live no matter which route, tool, webhook or workflow did the write.
// Throttled per audience so bursts (e.g. notetaker webhooks) don't flood clients.
import type { Prisma } from "@prisma/client";

type Audience = { userIds?: string[]; teamId?: string };

// model → how to find who should hear about a change, from the written record
const WATCHED: Record<string, (r: any) => Audience | null> = {
  Meeting: (r) => (r.userId ? { userIds: [r.userId] } : null),
  MeetingAttendee: (r) => (r.userId ? { userIds: [r.userId] } : null),
  Event: (r) => (r.userId ? { userIds: [r.userId] } : null),
  VideoMeeting: (r) => (r.createdById ? { userIds: [r.createdById] } : null),
  AiMeeting: (r) => (r.userId ? { userIds: [r.userId] } : null),
  Reminder: (r) => (r.userId ? { userIds: [r.userId] } : null),
  MyTask: (r) => (r.userId ? { userIds: [r.userId] } : null),
  TimeEntry: (r) => (r.userId ? { userIds: [r.userId] } : null),
  Note: (r) => (r.authorId ? { userIds: [r.authorId] } : null),
  Clip: (r) => (r.userId ? { userIds: [r.userId] } : null),
  Page: (r) => (r.teamId ? { teamId: r.teamId } : null),
  Room: (r) => (r.teamId ? { teamId: r.teamId } : null),
  File: (r) => (r.teamId ? { teamId: r.teamId } : r.userId ? { userIds: [r.userId] } : null),
  CrmDeal: (r) => (r.teamId ? { teamId: r.teamId } : null),
  CrmActivity: (r) => (r.teamId ? { teamId: r.teamId } : null),
};
const WRITE_ACTIONS = new Set(["create", "update", "upsert", "delete"]);

// Platform-admin live stream: creations/deletions across modules (titles only).
const ADMIN_MODELS: Record<string, string> = {
  Task: "task", Board: "board", Page: "doc", Note: "note", File: "file", Clip: "clip", Room: "whiteboard",
  Meeting: "meeting", VideoMeeting: "video meeting", AiMeeting: "notetaker", Event: "event type",
  CrmDeal: "CRM deal", CrmCompany: "CRM company", CrmContact: "CRM contact", Team: "team", User: "user",
  Workspace: "workspace", TeamMember: "team member", Channel: "channel", Reminder: "reminder", TimeEntry: "time entry",
};
const titleOf = (r: any): string | null =>
  r?.title ?? r?.name ?? r?.meetingName ?? r?.originalName ?? r?.email ?? null;
const actorOf = (r: any): string | null =>
  r?.createdById ?? r?.authorId ?? r?.ownerId ?? r?.userId ?? null;

function emitAdmin(model: string, action: string, r: any) {
  import("@/lib/sse")
    .then(({ publish, SSE_EVENTS }) =>
      publish(SSE_EVENTS.ADMIN_ACTIVITY, {
        platformAdmin: true,
        kind: "write",
        model,
        label: ADMIN_MODELS[model],
        action,
        id: r?.id ?? null,
        title: typeof titleOf(r) === "string" ? String(titleOf(r)).slice(0, 120) : null,
        actorId: actorOf(r),
        teamId: undefined, // keep audience = platform admins only
        at: new Date().toISOString(),
      })
    )
    .catch(() => {});
}
const THROTTLE_MS = 1000;
const lastSent = new Map<string, number>();

function emit(model: string, action: string, aud: Audience, id?: string) {
  const key = `${model}|${aud.teamId ?? ""}|${(aud.userIds ?? []).join(",")}`;
  const now = Date.now();
  if ((lastSent.get(key) ?? 0) > now - THROTTLE_MS) return;
  lastSent.set(key, now);
  if (lastSent.size > 5000) lastSent.clear();

  // Lazy import keeps lib/prisma free of a hard dependency cycle.
  import("@/lib/sse")
    .then(({ publish, SSE_EVENTS }) =>
      publish(SSE_EVENTS.CALENDAR_CHANGED, { source: model, action, id, ...aud })
    )
    .catch(() => {});
}

export const realtimeMiddleware: Prisma.Middleware = async (params, next) => {
  const result = await next(params);
  try {
    const model = params.model;
    if (model && WRITE_ACTIONS.has(params.action) && WATCHED[model] && result && typeof result === "object") {
      const aud = WATCHED[model](result);
      if (aud) emit(model, params.action, aud, (result as any).id);
    }
    if (model && ADMIN_MODELS[model] && (params.action === "create" || params.action === "delete") && result && typeof result === "object") {
      emitAdmin(model, params.action === "create" ? "created" : "deleted", result);
    }
  } catch {
    /* never break a write because of a realtime hint */
  }
  return result;
};

/** Attach once per client instance. */
export function attachRealtimeHooks(client: { $use: (m: Prisma.Middleware) => void }) {
  const c = client as any;
  if (c.__realtimeHooks) return;
  c.__realtimeHooks = true;
  client.$use(realtimeMiddleware);
}
