// lib/calendar/feed.ts
// Unified calendar feed: everything with a date that a user can see, across
// meetings, notetaker, tasks, reminders, notes, docs, drive, CRM, timesheet,
// clips, whiteboards and event types. Read-only; one collector per source,
// run with Promise.allSettled so one failing source never blanks the calendar.
import { prisma } from "@/lib/prisma";

import { CALENDAR_SOURCES, SOURCE_META, type CalendarSource } from "./sources";
export { CALENDAR_SOURCES, SOURCE_META, type CalendarSource };

export interface FeedItem {
  id: string;            // unique across sources: `${source}:${rowId}`
  source: CalendarSource;
  title: string;
  description?: string;
  start: string;
  end: string;
  allDay: boolean;
  color: string;
  href?: string;
  meta?: Record<string, any>;
}

interface Ctx {
  userId: string;
  from: Date;
  to: Date;
  teamIds: string[];
  teamSlugs: Map<string, string>;
}

const iso = (d: Date) => d.toISOString();
const plus = (d: Date, mins: number) => new Date(d.getTime() + mins * 60_000);
const item = (source: CalendarSource, rowId: string, x: Omit<FeedItem, "id" | "source" | "color">): FeedItem => ({
  id: `${source}:${rowId}`,
  source,
  color: SOURCE_META[source].color,
  ...x,
});
const range = (c: Ctx) => ({ gte: c.from, lte: c.to });

// ─── Collectors ───────────────────────────────────────────────────────────────

const collectors: Record<CalendarSource, (c: Ctx) => Promise<FeedItem[]>> = {
  async meeting(c) {
    const rows = await prisma.meeting.findMany({
      where: {
        startTime: range(c),
        status: "SCHEDULED",
        OR: [
          { userId: c.userId },
          { meetingAttendees: { some: { userId: c.userId } } },
          ...(c.teamIds.length ? [{ teamMeetingLink: { teamId: { in: c.teamIds } } }] : []),
        ],
      },
      select: { id: true, startTime: true, endTime: true, additionalInfo: true, meetLink: true, guestName: true, status: true, event: { select: { title: true } } },
      take: 500,
    });
    return rows.map((m) =>
      item("meeting", m.id, {
        title: m.event?.title || `Meeting with ${m.guestName}`,
        description: m.additionalInfo || undefined,
        start: iso(m.startTime), end: iso(m.endTime), allDay: false,
        href: `/meetings/${m.id}`,
        meta: { meetLink: m.meetLink, status: m.status, guest: m.guestName },
      })
    );
  },

  async video(c) {
    const rows = await prisma.videoMeeting.findMany({
      where: {
        OR: [{ scheduledAt: range(c) }, { startedAt: range(c) }],
        AND: [{ OR: [{ createdById: c.userId }, { participants: { some: { userId: c.userId } } }] }],
      },
      select: { id: true, title: true, roomName: true, scheduledAt: true, startedAt: true, endedAt: true },
      take: 300,
    });
    return rows.map((v) => {
      const start = v.scheduledAt ?? v.startedAt!;
      return item("video", v.id, {
        title: v.title, start: iso(start), end: iso(v.endedAt ?? plus(start, 60)), allDay: false,
        href: `/meeting/${v.roomName}`,
      });
    });
  },

  async notetaker(c) {
    const rows = await prisma.aiMeeting.findMany({
      where: { userId: c.userId, OR: [{ scheduledFor: range(c) }, { startedAt: range(c) }, { AND: [{ scheduledFor: null }, { startedAt: null }, { createdAt: range(c) }] }] },
      select: { id: true, meetingName: true, platform: true, status: true, scheduledFor: true, startedAt: true, endedAt: true, createdAt: true, summary: true },
      take: 300,
    });
    return rows.map((a) => {
      const start = a.scheduledFor ?? a.startedAt ?? a.createdAt;
      return item("notetaker", a.id, {
        title: `🎙 ${a.meetingName || a.platform || "AI notetaker"}`,
        description: a.summary?.slice(0, 200) || undefined,
        start: iso(start), end: iso(a.endedAt ?? plus(start, 45)), allDay: false,
        href: `/clips?tab=notetaker&meeting=${a.id}`,
        meta: { status: a.status },
      });
    });
  },

  async event(c) {
    const rows = await prisma.event.findMany({
      where: { userId: c.userId, OR: [{ createdAt: range(c) }, { updatedAt: range(c) }] },
      select: { id: true, title: true, duration: true, createdAt: true, updatedAt: true, slug: true },
      take: 200,
    });
    return rows.map((e) =>
      item("event", e.id, {
        title: `Event type: ${e.title}`, description: `${e.duration} min booking page`,
        start: iso(e.updatedAt), end: iso(e.updatedAt), allDay: true, href: `/events/page`,
      })
    );
  },

  async task(c) {
    const rows = await prisma.task.findMany({
      where: {
        dueDate: range(c),
        isArchived: false,
        OR: [
          { assignees: { some: { userId: c.userId } } },
          { column: { board: { OR: [{ ownerId: c.userId }, { members: { some: { userId: c.userId } } }] } } },
        ],
      },
      select: {
        id: true, title: true, dueDate: true, priority: true, status: true, boardId: true,
        column: { select: { title: true, board: { select: { title: true } } } },
        assignees: { select: { userId: true } },
      },
      take: 800,
    });
    return rows.map((t) =>
      item("task", t.id, {
        title: t.title,
        description: `${t.column.board.title} › ${t.column.title} · ${t.priority}`,
        start: iso(t.dueDate!), end: iso(t.dueDate!), allDay: true,
        href: `/board/${t.boardId}?task=${t.id}`,
        meta: { priority: t.priority, status: t.status, mine: t.assignees.some((a) => a.userId === c.userId) },
      })
    );
  },

  async mytask(c) {
    const rows = await prisma.myTask.findMany({
      where: { userId: c.userId, dueTime: range(c) },
      select: { id: true, title: true, description: true, dueTime: true, itsDone: true, priority: true },
      take: 500,
    });
    return rows.map((t) =>
      item("mytask", t.id, {
        title: `${t.itsDone ? "✓ " : ""}${t.title}`, description: t.description || undefined,
        start: iso(t.dueTime), end: iso(plus(t.dueTime, 30)), allDay: false, href: `/dashboard`,
        meta: { done: t.itsDone, priority: t.priority },
      })
    );
  },

  async reminder(c) {
    const rows = await prisma.reminder.findMany({
      where: { userId: c.userId, dueDate: range(c), status: { not: "CANCELLED" } },
      select: { id: true, title: true, description: true, dueDate: true, status: true, taskId: true },
      take: 500,
    });
    return rows.map((r) =>
      item("reminder", r.id, {
        title: `⏰ ${r.title}`, description: r.description || undefined,
        start: iso(r.dueDate), end: iso(plus(r.dueDate, 15)), allDay: false,
        meta: { status: r.status },
      })
    );
  },

  async time(c) {
    const rows = await prisma.timeEntry.findMany({
      where: { userId: c.userId, startTime: range(c) },
      select: { id: true, startTime: true, endTime: true, duration: true, description: true, isRunning: true, task: { select: { title: true } } },
      take: 500,
    });
    return rows.map((t) =>
      item("time", t.id, {
        title: `⏱ ${t.task?.title || t.description || "Time entry"}`,
        start: iso(t.startTime),
        end: iso(t.endTime ?? (t.isRunning ? new Date() : plus(t.startTime, Math.max(15, Math.round((t.duration || 0) / 60))))),
        allDay: false, href: `/time-tracking`,
        meta: { minutes: Math.round((t.duration || 0) / 60), running: t.isRunning },
      })
    );
  },

  async crm_deal(c) {
    if (!c.teamIds.length) return [];
    const rows = await prisma.crmDeal.findMany({
      where: { teamId: { in: c.teamIds }, OR: [{ expectedCloseDate: range(c) }, { closedAt: range(c) }] },
      select: { id: true, name: true, stage: true, amount: true, currency: true, expectedCloseDate: true, closedAt: true, company: { select: { name: true } } },
      take: 300,
    });
    return rows.map((d) => {
      const when = d.closedAt ?? d.expectedCloseDate!;
      return item("crm_deal", d.id, {
        title: `${d.closedAt ? "Closed" : "Close"}: ${d.name}`,
        description: `${d.company?.name ?? ""} · ${d.stage.replace(/_/g, " ").toLowerCase()}${d.amount ? ` · ${d.currency} ${d.amount}` : ""}`,
        start: iso(when), end: iso(when), allDay: true, href: `/crm/deals`,
        meta: { stage: d.stage },
      });
    });
  },

  async crm_activity(c) {
    if (!c.teamIds.length) return [];
    const rows = await prisma.crmActivity.findMany({
      where: {
        teamId: { in: c.teamIds },
        type: { in: ["CALL", "MEETING", "TASK", "EMAIL"] as any },
        OR: [{ dueAt: range(c) }, { occurredAt: range(c) }],
        AND: [{ OR: [{ assigneeId: c.userId }, { createdById: c.userId }] }],
      },
      select: { id: true, type: true, subject: true, body: true, dueAt: true, occurredAt: true, completedAt: true },
      take: 300,
    });
    return rows.map((a) => {
      const when = a.dueAt ?? a.occurredAt!;
      return item("crm_activity", a.id, {
        title: `${a.type.charAt(0) + a.type.slice(1).toLowerCase()}: ${a.subject || "CRM activity"}`,
        description: a.body?.slice(0, 200) || undefined,
        start: iso(when), end: iso(plus(when, 30)), allDay: false, href: `/crm`,
        meta: { done: !!a.completedAt },
      });
    });
  },

  async note(c) {
    const rows = await prisma.note.findMany({
      where: { authorId: c.userId, isArchived: false, OR: [{ createdAt: range(c) }, { updatedAt: range(c) }] },
      select: { id: true, title: true, emoji: true, createdAt: true, updatedAt: true },
      take: 300,
    });
    return rows.map((n) =>
      item("note", n.id, {
        title: `${n.emoji ?? "📝"} ${n.title || "Untitled note"}`,
        description: n.createdAt >= c.from ? "Note created" : "Note updated",
        start: iso(n.updatedAt), end: iso(plus(n.updatedAt, 15)), allDay: false, href: `/notes?id=${n.id}`,
      })
    );
  },

  async doc(c) {
    if (!c.teamIds.length) return [];
    const rows = await prisma.page.findMany({
      where: {
        teamId: { in: c.teamIds }, isTemplate: false,
        OR: [{ createdAt: range(c) }, { updatedAt: range(c) }],
        AND: [{ OR: [{ authorId: c.userId }, { visibility: { not: "PRIVATE" } }] }],
      },
      select: { id: true, title: true, emoji: true, teamId: true, createdAt: true, updatedAt: true, author: { select: { name: true } } },
      orderBy: { updatedAt: "desc" },
      take: 300,
    });
    return rows.map((p) =>
      item("doc", p.id, {
        title: `${p.emoji ?? "📄"} ${p.title || "Untitled doc"}`,
        description: `${p.createdAt >= c.from ? "Created" : "Updated"} by ${p.author?.name ?? "someone"}`,
        start: iso(p.updatedAt), end: iso(plus(p.updatedAt, 15)), allDay: false,
        href: c.teamSlugs.get(p.teamId) ? `/team/${c.teamSlugs.get(p.teamId)}/docs/${p.id}` : undefined,
      })
    );
  },

  async drive(c) {
    const rows = await prisma.file.findMany({
      where: {
        isDeleted: false, createdAt: range(c),
        OR: [
          { userId: c.userId },
          ...(c.teamIds.length ? [{ teamId: { in: c.teamIds }, visibility: { not: "PERSONAL" as any } }] : []),
          { assignedTo: { some: { userId: c.userId } } },
        ],
      },
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true, user: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 300,
    });
    return rows.map((f) =>
      item("drive", f.id, {
        title: `${f.mimeType.startsWith("image/") ? "🖼" : f.mimeType.startsWith("video/") ? "🎬" : "📎"} ${f.originalName}`,
        description: `Uploaded by ${f.user?.name ?? "someone"}`,
        start: iso(f.createdAt), end: iso(plus(f.createdAt, 15)), allDay: false, href: `/drive/all`,
        meta: { mimeType: f.mimeType, size: f.size },
      })
    );
  },

  async clip(c) {
    const rows = await prisma.clip.findMany({
      where: { userId: c.userId, createdAt: range(c) },
      select: { id: true, title: true, createdAt: true, duration: true, type: true },
      take: 200,
    });
    return rows.map((k) =>
      item("clip", k.id, {
        title: `🎞 ${k.title}`,
        start: iso(k.createdAt), end: iso(plus(k.createdAt, Math.max(15, Math.round((k.duration ?? 0) / 60)))), allDay: false,
        href: `/clips`,
      })
    );
  },

  async whiteboard(c) {
    if (!c.teamIds.length) return [];
    const rows = await prisma.room.findMany({
      where: { teamId: { in: c.teamIds }, isArchived: false, OR: [{ createdAt: range(c) }, { updatedAt: range(c) }] },
      select: { id: true, name: true, slug: true, teamId: true, createdAt: true, updatedAt: true, createdBy: { select: { name: true } } },
      take: 200,
    });
    return rows.map((r) =>
      item("whiteboard", r.id, {
        title: `🧩 ${r.name}`,
        description: `${r.createdAt >= c.from ? "Created" : "Updated"} · by ${r.createdBy?.name ?? "someone"}`,
        start: iso(r.updatedAt), end: iso(plus(r.updatedAt, 15)), allDay: false,
        href: c.teamSlugs.get(r.teamId) ? `/team/${c.teamSlugs.get(r.teamId)}/whiteboard/${r.slug}` : undefined,
      })
    );
  },
};

export async function getCalendarFeed(opts: {
  userId: string;
  from: Date;
  to: Date;
  sources?: CalendarSource[];
  teamId?: string;
}) {
  const memberships = await prisma.teamMember.findMany({
    where: { userId: opts.userId, ...(opts.teamId ? { teamId: opts.teamId } : {}) },
    select: { teamId: true, role: true, team: { select: { slug: true } } },
  });
  // CRM is hidden from CLIENT-role members (mirrors the CRM module itself)
  const ctx: Ctx = {
    userId: opts.userId,
    from: opts.from,
    to: opts.to,
    teamIds: memberships.map((m) => m.teamId),
    teamSlugs: new Map(memberships.map((m) => [m.teamId, m.team.slug])),
  };
  const crmTeamIds = memberships.filter((m) => (m.role as string) !== "CLIENT").map((m) => m.teamId);

  const wanted = (opts.sources?.length ? opts.sources : CALENDAR_SOURCES).filter((s) => s in collectors);
  const settled = await Promise.allSettled(
    wanted.map((s) =>
      collectors[s](s.startsWith("crm_") ? { ...ctx, teamIds: crmTeamIds } : ctx)
    )
  );

  const items: FeedItem[] = [];
  const errors: Record<string, string> = {};
  settled.forEach((r, i) => {
    if (r.status === "fulfilled") items.push(...r.value);
    else {
      errors[wanted[i]] = String(r.reason?.message || r.reason).slice(0, 200);
      console.warn(`[calendar-feed] ${wanted[i]} failed:`, r.reason?.message);
    }
  });
  items.sort((a, b) => a.start.localeCompare(b.start));
  return { items, errors };
}
