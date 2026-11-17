// lib/platform/admin-logs.ts
// Platform-wide activity log for /admin/logs: one stream merged from
//   admin audit · board/task activity · CRM activity · things created across modules
// Cursor-paginated by time (`before`), filterable by source and text.
import { prisma } from '@/lib/prisma';

export const LOG_SOURCES = ['audit', 'task', 'crm', 'doc', 'note', 'file', 'meeting', 'clip', 'whiteboard', 'team', 'user'] as const;
export type LogSource = (typeof LOG_SOURCES)[number];

export interface LogEntry {
  id: string;
  source: LogSource;
  action: string;
  text: string;
  at: string;
  actor: { id: string; name: string | null; email?: string | null } | null;
  team?: string | null;
  href?: string | null;
  meta?: any;
}

type U = { id: string; name: string | null; email: string | null } | null;
const actor = (u: U) => (u ? { id: u.id, name: u.name, email: u.email } : null);
const USER = { select: { id: true, name: true, email: true } } as const;

export async function getAdminLogs(opts: { before?: Date; limit?: number; sources?: LogSource[]; q?: string }) {
  const limit = Math.min(200, Math.max(10, opts.limit ?? 50));
  const before = opts.before ?? new Date(Date.now() + 1000);
  const want = new Set(opts.sources?.length ? opts.sources : LOG_SOURCES);
  const q = opts.q?.trim();
  const ci = (field: string) => (q ? { [field]: { contains: q, mode: 'insensitive' as const } } : {});
  const t = { lt: before };

  const tasks: Promise<LogEntry[]>[] = [];
  const add = (src: LogSource, p: () => Promise<LogEntry[]>) => {
    if (want.has(src)) tasks.push(p().catch((e) => { console.warn(`[admin-logs] ${src}:`, e?.message); return []; }));
  };

  add('audit', async () =>
    (await prisma.platformAuditLog.findMany({
      where: { createdAt: t, ...(q ? { action: { contains: q, mode: 'insensitive' } } : {}) },
      orderBy: { createdAt: 'desc' }, take: limit, include: { actor: USER },
    })).map((a) => ({
      id: `audit:${a.id}`, source: 'audit' as const, action: a.action,
      text: `${a.action}${a.targetType ? ` → ${a.targetType}` : ''}`,
      at: a.createdAt.toISOString(), actor: actor(a.actor), meta: a.meta,
      href: a.targetType === 'workspace' && a.targetId ? `/admin/workspaces/${a.targetId}` : a.targetType === 'user' && a.targetId ? `/admin/users/${a.targetId}` : null,
    }))
  );

  add('task', async () =>
    (await prisma.activityLog.findMany({
      where: { createdAt: t, ...ci('description') },
      orderBy: { createdAt: 'desc' }, take: limit,
      include: { user: USER, board: { select: { id: true, title: true } } },
    })).map((a) => ({
      id: `task:${a.id}`, source: 'task' as const, action: a.action.toLowerCase(),
      text: a.description, at: a.createdAt.toISOString(), actor: actor(a.user),
      team: a.board?.title ? `Board: ${a.board.title}` : null,
    }))
  );

  add('crm', async () =>
    (await prisma.crmActivity.findMany({
      where: { createdAt: t, ...ci('subject') },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, type: true, subject: true, createdAt: true, createdBy: USER, team: { select: { name: true } } },
    })).map((a) => ({
      id: `crm:${a.id}`, source: 'crm' as const, action: a.type.toLowerCase(),
      text: `CRM ${a.type.toLowerCase().replace('_', ' ')}${a.subject ? `: ${a.subject}` : ''}`,
      at: a.createdAt.toISOString(), actor: actor(a.createdBy), team: a.team?.name,
    }))
  );

  add('doc', async () =>
    (await prisma.page.findMany({
      where: { createdAt: t, isTemplate: false, ...ci('title') },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, title: true, createdAt: true, author: USER, team: { select: { name: true } } },
    })).map((p) => ({
      id: `doc:${p.id}`, source: 'doc' as const, action: 'created',
      text: `Created doc “${p.title || 'Untitled'}”`, at: p.createdAt.toISOString(), actor: actor(p.author), team: p.team?.name,
    }))
  );

  add('note', async () =>
    (await prisma.note.findMany({
      where: { createdAt: t, ...ci('title') },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, title: true, createdAt: true, author: USER },
    })).map((n) => ({
      id: `note:${n.id}`, source: 'note' as const, action: 'created',
      text: `Created note “${n.title || 'Untitled'}”`, at: n.createdAt.toISOString(), actor: actor(n.author),
    }))
  );

  add('file', async () =>
    (await prisma.file.findMany({
      where: { createdAt: t, ...ci('originalName') },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, originalName: true, size: true, mimeType: true, isDeleted: true, createdAt: true, user: USER, team: { select: { name: true } } },
    })).map((f) => ({
      id: `file:${f.id}`, source: 'file' as const, action: f.isDeleted ? 'deleted' : 'uploaded',
      text: `Uploaded ${f.originalName}`, at: f.createdAt.toISOString(), actor: actor(f.user), team: f.team?.name,
      meta: { size: f.size, mimeType: f.mimeType },
    }))
  );

  add('meeting', async () => {
    const [scheduled, video, ai] = await Promise.all([
      prisma.meeting.findMany({
        where: { createdAt: t, ...(q ? { OR: [{ guestName: { contains: q, mode: 'insensitive' } }, { event: { title: { contains: q, mode: 'insensitive' } } }] } : {}) },
        orderBy: { createdAt: 'desc' }, take: limit,
        select: { id: true, createdAt: true, startTime: true, status: true, guestName: true, user: USER, event: { select: { title: true } } },
      }),
      prisma.videoMeeting.findMany({
        where: { createdAt: t, ...ci('title') }, orderBy: { createdAt: 'desc' }, take: limit,
        select: { id: true, title: true, createdAt: true, createdBy: USER },
      }),
      prisma.aiMeeting.findMany({
        where: { createdAt: t, ...ci('meetingName') }, orderBy: { createdAt: 'desc' }, take: limit,
        select: { id: true, meetingName: true, platform: true, status: true, createdAt: true, user: USER },
      }),
    ]);
    return [
      ...scheduled.map((m) => ({
        id: `meeting:${m.id}`, source: 'meeting' as const, action: m.status === 'CANCELLED' ? 'cancelled' : 'scheduled',
        text: `${m.event?.title ?? 'Meeting'} with ${m.guestName} on ${m.startTime.toISOString().slice(0, 16).replace('T', ' ')}`,
        at: m.createdAt.toISOString(), actor: actor(m.user),
      })),
      ...video.map((v) => ({
        id: `video:${v.id}`, source: 'meeting' as const, action: 'started',
        text: `Video meeting “${v.title}”`, at: v.createdAt.toISOString(), actor: actor(v.createdBy),
      })),
      ...ai.map((a) => ({
        id: `ai:${a.id}`, source: 'meeting' as const, action: `notetaker ${a.status}`,
        text: `AI notetaker: ${a.meetingName || a.platform || 'meeting'}`, at: a.createdAt.toISOString(), actor: actor(a.user),
      })),
    ];
  });

  add('clip', async () =>
    (await prisma.clip.findMany({
      where: { createdAt: t, ...ci('title') }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, title: true, type: true, createdAt: true, user: USER },
    })).map((c) => ({
      id: `clip:${c.id}`, source: 'clip' as const, action: 'recorded',
      text: `Recorded ${c.type} clip “${c.title}”`, at: c.createdAt.toISOString(), actor: actor(c.user),
    }))
  );

  add('whiteboard', async () =>
    (await prisma.room.findMany({
      where: { createdAt: t, ...ci('name') }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, name: true, createdAt: true, createdBy: USER, team: { select: { name: true } } },
    })).map((r) => ({
      id: `wb:${r.id}`, source: 'whiteboard' as const, action: 'created',
      text: `Created whiteboard “${r.name}”`, at: r.createdAt.toISOString(), actor: actor(r.createdBy), team: r.team?.name,
    }))
  );

  add('team', async () =>
    (await prisma.team.findMany({
      where: { createdAt: t, ...ci('name') }, orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, name: true, createdAt: true, workspace: { select: { id: true, name: true } } },
    })).map((tm) => ({
      id: `team:${tm.id}`, source: 'team' as const, action: 'created',
      text: `Team “${tm.name}” created${tm.workspace ? ` in ${tm.workspace.name}` : ''}`,
      at: tm.createdAt.toISOString(), actor: null, href: tm.workspace ? `/admin/workspaces/${tm.workspace.id}` : null,
    }))
  );

  add('user', async () =>
    (await prisma.user.findMany({
      where: { createdAt: t, ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {}) },
      orderBy: { createdAt: 'desc' }, take: limit,
      select: { id: true, name: true, email: true, createdAt: true },
    })).map((u) => ({
      id: `user:${u.id}`, source: 'user' as const, action: 'signed up',
      text: `${u.name || u.email} signed up`, at: u.createdAt.toISOString(), actor: actor(u), href: `/admin/users/${u.id}`,
    }))
  );

  const all = (await Promise.all(tasks)).flat().sort((a, b) => b.at.localeCompare(a.at));
  const page = all.slice(0, limit);
  return { entries: page, nextBefore: page.length === limit ? page[page.length - 1].at : null };
}
