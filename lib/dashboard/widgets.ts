// lib/dashboard/widgets.ts
// Data loaders for the customizable dashboard layouts (Grid / Focus).
// Each loader is scoped to the signed-in user (and their current team where
// relevant) and returns small, render-ready payloads.
import { prisma } from '@/lib/prisma';
import { getCalendarFeed } from '@/lib/calendar/feed';

export const SERVER_WIDGETS = [
  'stats', 'agenda', 'tasks', 'reminders', 'docs', 'notes', 'files', 'crm', 'workload', 'time', 'clips', 'notetaker',
] as const;
export type ServerWidget = (typeof SERVER_WIDGETS)[number];

interface Ctx {
  userId: string;
  teamId: string | null;
  teamSlug: string | null;
  teamIds: string[];
  role: string | null;
}

const startOfDay = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

async function context(userId: string, teamSlug?: string | null): Promise<Ctx> {
  const memberships = await prisma.teamMember.findMany({
    where: { userId },
    select: { teamId: true, role: true, team: { select: { slug: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const current = memberships.find((m) => m.team.slug === teamSlug) ?? memberships[0];
  return {
    userId,
    teamId: current?.teamId ?? null,
    teamSlug: current?.team.slug ?? null,
    teamIds: memberships.map((m) => m.teamId),
    role: (current?.role as string) ?? null,
  };
}

const myBoards = (userId: string) => ({ OR: [{ ownerId: userId }, { members: { some: { userId } } }] });

const loaders: Record<ServerWidget, (c: Ctx) => Promise<unknown>> = {
  async stats(c) {
    const today = startOfDay();
    const [openTasks, overdue, meetingsToday, reminders, unread, docsWeek] = await Promise.all([
      prisma.taskAssignee.count({ where: { userId: c.userId, task: { status: { not: 'DONE' }, isArchived: false } } }),
      prisma.taskAssignee.count({ where: { userId: c.userId, task: { status: { not: 'DONE' }, isArchived: false, dueDate: { lt: today } } } }),
      prisma.meeting.count({ where: { status: 'SCHEDULED', startTime: { gte: today, lt: addDays(today, 1) }, OR: [{ userId: c.userId }, { meetingAttendees: { some: { userId: c.userId } } }] } }),
      Promise.all([
        prisma.reminder.count({ where: { userId: c.userId, status: 'PENDING' } }),
        prisma.myTask.count({ where: { userId: c.userId, itsDone: false } }),
      ]).then(([a, b]) => a + b),
      prisma.notification.count({ where: { userId: c.userId, read: false } }),
      c.teamIds.length ? prisma.page.count({ where: { teamId: { in: c.teamIds }, updatedAt: { gte: addDays(today, -7) } } }) : 0,
    ]);
    return { openTasks, overdue, meetingsToday, reminders, unread, docsWeek };
  },

  async agenda(c) {
    const from = startOfDay();
    const { items } = await getCalendarFeed({
      userId: c.userId, from, to: addDays(from, 7),
      sources: ['meeting', 'video', 'notetaker', 'task', 'mytask', 'reminder', 'crm_activity', 'crm_deal'],
    });
    return items.slice(0, 60);
  },

  async tasks(c) {
    const rows = await prisma.task.findMany({
      where: { isArchived: false, status: { not: 'DONE' }, assignees: { some: { userId: c.userId } } },
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { updatedAt: 'desc' }],
      take: 25,
      select: { id: true, title: true, priority: true, status: true, dueDate: true, boardId: true, column: { select: { title: true, board: { select: { title: true } } } } },
    });
    return rows.map((t) => ({
      id: t.id, title: t.title, priority: t.priority, status: t.status, dueDate: t.dueDate,
      board: t.column.board.title, column: t.column.title, href: `/board/${t.boardId}?task=${t.id}`,
    }));
  },

  async reminders(c) {
    const [rem, todos] = await Promise.all([
      prisma.reminder.findMany({ where: { userId: c.userId, status: 'PENDING' }, orderBy: { dueDate: 'asc' }, take: 20, select: { id: true, title: true, dueDate: true, recurrence: true } }),
      prisma.myTask.findMany({ where: { userId: c.userId, itsDone: false }, orderBy: { dueTime: 'asc' }, take: 20, select: { id: true, title: true, dueTime: true, priority: true } }),
    ]);
    return [
      ...rem.map((r) => ({ id: `reminder:${r.id}`, kind: 'reminder', title: r.title, due: r.dueDate, recurrence: r.recurrence })),
      ...todos.map((t) => ({ id: `mytask:${t.id}`, kind: 'todo', title: t.title, due: t.dueTime, priority: t.priority })),
    ].sort((a, b) => +new Date(a.due) - +new Date(b.due)).slice(0, 25);
  },

  async docs(c) {
    if (!c.teamIds.length) return [];
    const rows = await prisma.page.findMany({
      where: { teamId: { in: c.teamIds }, isTemplate: false, OR: [{ authorId: c.userId }, { visibility: { not: 'PRIVATE' } }] },
      orderBy: { updatedAt: 'desc' }, take: 12,
      select: { id: true, title: true, emoji: true, updatedAt: true, team: { select: { slug: true } }, author: { select: { name: true } } },
    });
    return rows.map((p) => ({ id: p.id, title: p.title || 'Untitled', emoji: p.emoji, updatedAt: p.updatedAt, author: p.author?.name, href: `/team/${p.team.slug}/docs/${p.id}` }));
  },

  async notes(c) {
    const rows = await prisma.note.findMany({
      where: { authorId: c.userId, isArchived: false },
      orderBy: [{ isPinned: 'desc' }, { updatedAt: 'desc' }], take: 12,
      select: { id: true, title: true, emoji: true, isPinned: true, updatedAt: true },
    });
    return rows.map((n) => ({ ...n, title: n.title || 'Untitled', href: `/notes?id=${n.id}` }));
  },

  async files(c) {
    const rows = await prisma.file.findMany({
      where: { isDeleted: false, OR: [{ userId: c.userId }, ...(c.teamIds.length ? [{ teamId: { in: c.teamIds }, visibility: 'TEAM' as const }] : [])] },
      orderBy: { createdAt: 'desc' }, take: 12,
      select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true, url: true, visibility: true },
    });
    return rows.map((f) => ({ ...f, url: f.visibility === 'PASSWORD_PROTECTED' ? null : f.url }));
  },

  async crm(c) {
    if (!c.teamId || c.role === 'CLIENT') return { stages: [], total: 0 };
    const rows = await prisma.crmDeal.groupBy({
      by: ['stage'], where: { teamId: c.teamId }, _count: { _all: true }, _sum: { amount: true },
    });
    const stages = rows.map((r) => ({ stage: r.stage, count: r._count._all, amount: Number(r._sum.amount ?? 0) }));
    return { stages, total: stages.reduce((s, x) => s + x.count, 0) };
  },

  async workload(c) {
    if (!c.teamId) return [];
    const members = await prisma.teamMember.findMany({
      where: { teamId: c.teamId },
      select: { userId: true, user: { select: { name: true, image: true } } },
    });
    const counts = await prisma.taskAssignee.groupBy({
      by: ['userId'],
      where: { userId: { in: members.map((m) => m.userId) }, task: { status: { not: 'DONE' }, isArchived: false } },
      _count: { _all: true },
    });
    const byUser = new Map(counts.map((x) => [x.userId, x._count._all]));
    return members
      .map((m) => ({ userId: m.userId, name: m.user.name, image: m.user.image, open: byUser.get(m.userId) ?? 0 }))
      .sort((a, b) => b.open - a.open)
      .slice(0, 12);
  },

  async time(c) {
    const from = addDays(startOfDay(), -6);
    const rows = await prisma.timeEntry.findMany({
      where: { userId: c.userId, startTime: { gte: from } },
      select: { startTime: true, duration: true },
    });
    const days = Array.from({ length: 7 }, (_, i) => ({ day: addDays(from, i).toISOString().slice(0, 10), hours: 0 }));
    rows.forEach((r) => {
      const d = days.find((x) => x.day === r.startTime.toISOString().slice(0, 10));
      if (d) d.hours += (r.duration || 0) / 3600;
    });
    days.forEach((d) => (d.hours = Math.round(d.hours * 10) / 10));
    return { days, total: Math.round(days.reduce((s, d) => s + d.hours, 0) * 10) / 10 };
  },

  async clips(c) {
    return prisma.clip.findMany({
      where: { userId: c.userId }, orderBy: { createdAt: 'desc' }, take: 8,
      select: { id: true, title: true, type: true, duration: true, createdAt: true, thumbnailUrl: true },
    });
  },

  async notetaker(c) {
    return prisma.aiMeeting.findMany({
      where: { userId: c.userId }, orderBy: { createdAt: 'desc' }, take: 8,
      select: { id: true, meetingName: true, platform: true, status: true, createdAt: true, summary: true },
    });
  },
};

export async function loadWidgets(userId: string, types: ServerWidget[], teamSlug?: string | null) {
  const c = await context(userId, teamSlug);
  const settled = await Promise.allSettled(types.map((t) => loaders[t](c)));
  const out: Record<string, unknown> = {};
  settled.forEach((r, i) => {
    out[types[i]] = r.status === 'fulfilled' ? r.value : { error: true };
    if (r.status === 'rejected') console.warn(`[dashboard-widget] ${types[i]}:`, (r.reason as Error)?.message);
  });
  return { data: out, team: { id: c.teamId, slug: c.teamSlug, role: c.role } };
}
