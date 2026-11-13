// Dashboard activity feed: one read-only stream of what happened across the workspace.
// Each collector reads a feature's own tables and never writes to them. A collector that
// fails is skipped so the rest of the feed still renders.
import { prisma } from '@/lib/prisma';
import { getValidGoogleToken } from '@/lib/integrations/token-manager';
import { listGmailMessages } from '@/lib/integrations/google/gmail';
import { recordHref } from '@/lib/crm/notify';
import type { Role } from '@prisma/client';

export type FeedKind =
  | 'mail'
  | 'crm'
  | 'file'
  | 'notetaker'
  | 'doc'
  | 'task'
  | 'member'
  | 'workload'
  | 'clip'
  | 'whiteboard';

export interface FeedActor {
  name: string;
  image?: string | null;
}

export interface FeedItem {
  id: string;
  kind: FeedKind;
  actor?: FeedActor | null;
  // Sentence parts: "{actor} {action} {target}{suffix}"
  action: string;
  target?: string | null;
  suffix?: string | null;
  team?: string | null;
  at: string; // ISO; for upcoming items this is the future start time
  href: string;
  forYou: boolean;
  pinned?: boolean; // upcoming notetaker joins and workload alerts stay on top
}

export interface ActivityFeed {
  items: FeedItem[];
  isAdmin: boolean;
  mail: 'connected' | 'not_connected' | 'restricted';
}

const WINDOW_DAYS = 7;
const PER_SOURCE = 8;
const NOTETAKER_LOOKAHEAD_HOURS = 48;

type Membership = { teamId: string; role: Role; team: { id: string; name: string; slug: string } };

const userSelect = { id: true, name: true, image: true, imageUrl: true } as const;
type UserLite = { id: string; name: string; image: string | null; imageUrl: string | null };

function actorOf(u: UserLite | null | undefined): FeedActor | null {
  if (!u) return null;
  return { name: u.name, image: u.imageUrl || u.image };
}

function isAdminRole(role: Role) {
  return role === 'OWNER' || role === 'ADMIN';
}

interface Ctx {
  userId: string;
  email: string | null | undefined;
  since: Date;
  now: Date;
  memberships: Membership[];
  // Teams where the viewer sees team-wide activity (clients only see what involves them).
  teamIds: string[];
  teamById: Map<string, Membership['team']>;
}

// ── Mail (Gmail inbox, admins only — mirrors the /mail page gate) ─────────────
async function collectMail(ctx: Ctx, isAdmin: boolean): Promise<{ items: FeedItem[]; status: ActivityFeed['mail'] }> {
  if (!isAdmin) return { items: [], status: 'restricted' };
  const token = await getValidGoogleToken(ctx.userId);
  if (!token) return { items: [], status: 'not_connected' };

  const { messages } = await listGmailMessages(token, {
    labelIds: ['INBOX'],
    q: `newer_than:${WINDOW_DAYS}d`,
    maxResults: 6,
  });

  const items = messages.map<FeedItem>((m) => ({
    id: `mail:${m.id}`,
    kind: 'mail',
    actor: { name: m.from.name || m.from.email },
    action: m.isRead ? 'emailed you' : 'sent you a new email',
    target: m.subject || '(no subject)',
    at: new Date(m.date).toISOString(),
    href: `/mail?id=${encodeURIComponent(m.id)}`,
    forYou: true,
  }));
  return { items, status: 'connected' };
}

// ── CRM ───────────────────────────────────────────────────────────────────────
const CRM_ACTIVITY_VERB: Record<string, string> = {
  NOTE: 'added a note on',
  CALL: 'logged a call with',
  EMAIL: 'logged an email with',
  MEETING: 'logged a meeting with',
  TASK: 'added a CRM task on',
  STAGE_CHANGE: 'moved deal',
};

async function collectCrm(ctx: Ctx): Promise<FeedItem[]> {
  if (ctx.teamIds.length === 0) return [];
  const [activities, deals, companies] = await Promise.all([
    prisma.crmActivity.findMany({
      where: {
        teamId: { in: ctx.teamIds },
        createdAt: { gte: ctx.since },
        type: { not: 'ENRICHMENT' },
        OR: [{ createdById: { not: ctx.userId } }, { assigneeId: ctx.userId }],
      },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
      select: {
        id: true,
        type: true,
        subject: true,
        createdAt: true,
        teamId: true,
        assigneeId: true,
        createdById: true,
        createdBy: { select: userSelect },
        deal: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.crmDeal.findMany({
      where: { teamId: { in: ctx.teamIds }, createdAt: { gte: ctx.since } },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
      select: { id: true, name: true, createdAt: true, teamId: true, ownerId: true, owner: { select: userSelect } },
    }),
    prisma.crmCompany.findMany({
      where: { teamId: { in: ctx.teamIds }, createdAt: { gte: ctx.since }, createdById: { not: ctx.userId } },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
      select: { id: true, name: true, createdAt: true, teamId: true, ownerId: true, createdBy: { select: userSelect } },
    }),
  ]);

  const out: FeedItem[] = [];
  for (const a of activities) {
    const team = ctx.teamById.get(a.teamId);
    if (!team) continue;
    const record = a.deal
      ? { kind: 'deal' as const, id: a.deal.id, name: a.deal.name }
      : a.company
        ? { kind: 'company' as const, id: a.company.id, name: a.company.name }
        : a.contact
          ? { kind: 'contact' as const, id: a.contact.id, name: [a.contact.firstName, a.contact.lastName].filter(Boolean).join(' ') }
          : null;
    if (!record) continue;
    const assignedToMe = a.type === 'TASK' && a.assigneeId === ctx.userId && a.createdById !== ctx.userId;
    out.push({
      id: `crm-act:${a.id}`,
      kind: 'crm',
      actor: actorOf(a.createdBy),
      action: assignedToMe ? 'assigned you a CRM task on' : CRM_ACTIVITY_VERB[a.type] ?? 'updated',
      target: record.name,
      suffix: a.subject ? ` — ${a.subject}` : null,
      team: team.name,
      at: a.createdAt.toISOString(),
      href: recordHref(record.kind, record.id, team.slug),
      forYou: a.assigneeId === ctx.userId,
    });
  }
  for (const d of deals) {
    const team = ctx.teamById.get(d.teamId);
    if (!team) continue;
    const mine = d.ownerId === ctx.userId;
    out.push({
      id: `crm-deal:${d.id}`,
      kind: 'crm',
      actor: mine ? null : actorOf(d.owner),
      action: mine ? 'You own a new deal' : 'opened a new deal',
      target: d.name,
      team: team.name,
      at: d.createdAt.toISOString(),
      href: recordHref('deal', d.id, team.slug),
      forYou: mine,
    });
  }
  for (const c of companies) {
    const team = ctx.teamById.get(c.teamId);
    if (!team) continue;
    out.push({
      id: `crm-co:${c.id}`,
      kind: 'crm',
      actor: actorOf(c.createdBy),
      action: c.ownerId === ctx.userId ? 'added a client you own:' : 'added a new client',
      target: c.name,
      team: team.name,
      at: c.createdAt.toISOString(),
      href: recordHref('company', c.id, team.slug),
      forYou: c.ownerId === ctx.userId,
    });
  }
  return out;
}

// ── Drive ─────────────────────────────────────────────────────────────────────
async function collectFiles(ctx: Ctx): Promise<FeedItem[]> {
  const [teamFiles, assigned] = await Promise.all([
    ctx.teamIds.length
      ? prisma.file.findMany({
          where: {
            teamId: { in: ctx.teamIds },
            visibility: { in: ['TEAM', 'PASSWORD_PROTECTED'] },
            isDeleted: false,
            userId: { not: ctx.userId },
            createdAt: { gte: ctx.since },
          },
          orderBy: { createdAt: 'desc' },
          take: PER_SOURCE,
          select: { id: true, originalName: true, createdAt: true, teamId: true, user: { select: userSelect } },
        })
      : Promise.resolve([]),
    prisma.fileAssignment.findMany({
      where: { userId: ctx.userId, createdAt: { gte: ctx.since }, file: { isDeleted: false } },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
      select: {
        id: true,
        createdAt: true,
        assignedBy: true,
        file: { select: { id: true, originalName: true, teamId: true, userId: true } },
      },
    }),
  ]);

  const assignerIds = Array.from(new Set(assigned.map((a) => a.assignedBy)));
  const assigners = assignerIds.length
    ? await prisma.user.findMany({ where: { id: { in: assignerIds } }, select: userSelect })
    : [];
  const assignerById = new Map(assigners.map((u) => [u.id, u]));

  const out: FeedItem[] = [];
  const assignedFileIds = new Set(assigned.map((a) => a.file.id));
  for (const a of assigned) {
    const team = a.file.teamId ? ctx.teamById.get(a.file.teamId) : undefined;
    out.push({
      id: `file-asg:${a.id}`,
      kind: 'file',
      actor: actorOf(assignerById.get(a.assignedBy)),
      action: 'shared a file with you',
      target: a.file.originalName,
      team: team?.name ?? null,
      at: a.createdAt.toISOString(),
      href: '/drive/all?source=drive&assigned=me',
      forYou: true,
    });
  }
  for (const f of teamFiles) {
    if (assignedFileIds.has(f.id)) continue; // already shown as "shared with you"
    const team = f.teamId ? ctx.teamById.get(f.teamId) : undefined;
    out.push({
      id: `file:${f.id}`,
      kind: 'file',
      actor: actorOf(f.user),
      action: `shared a file with ${team?.name ?? 'the team'}`,
      target: f.originalName,
      team: team?.name ?? null,
      at: f.createdAt.toISOString(),
      href: '/drive/all?source=drive',
      forYou: false,
    });
  }
  return out;
}

// ── AI notetaker (upcoming joins + finished summaries) ───────────────────────
async function collectNotetaker(ctx: Ctx): Promise<FeedItem[]> {
  const horizon = new Date(ctx.now.getTime() + NOTETAKER_LOOKAHEAD_HOURS * 3600_000);

  // Meetings the viewer attends but does not host also get a heads-up.
  const attending = await prisma.meeting.findMany({
    where: {
      startTime: { gte: ctx.now, lte: horizon },
      meetingAttendees: {
        some: { OR: [{ userId: ctx.userId }, ...(ctx.email ? [{ email: ctx.email }] : [])] },
      },
    },
    select: { id: true },
  });

  const [upcoming, finished] = await Promise.all([
    prisma.aiMeeting.findMany({
      where: {
        status: 'scheduled',
        scheduledFor: { gte: new Date(ctx.now.getTime() - 10 * 60_000), lte: horizon },
        OR: [{ userId: ctx.userId }, { sourceMeetingId: { in: attending.map((m) => m.id) } }],
      },
      orderBy: { scheduledFor: 'asc' },
      take: 5,
      select: { id: true, meetingName: true, scheduledFor: true, userId: true },
    }),
    prisma.aiMeeting.findMany({
      where: { userId: ctx.userId, status: 'completed', updatedAt: { gte: ctx.since } },
      orderBy: { updatedAt: 'desc' },
      take: 4,
      select: { id: true, meetingName: true, updatedAt: true },
    }),
  ]);

  return [
    ...upcoming.map<FeedItem>((m) => ({
      id: `ai-up:${m.id}`,
      kind: 'notetaker',
      actor: { name: 'AI Notetaker' },
      action: 'will join',
      target: m.meetingName || 'your meeting',
      at: (m.scheduledFor ?? ctx.now).toISOString(),
      // Only the host can open the AI meeting record; attendees go to their meetings list.
      href: m.userId === ctx.userId ? `/meetings/${m.id}` : '/meetings/page',
      forYou: true,
      pinned: true,
    })),
    ...finished.map<FeedItem>((m) => ({
      id: `ai-done:${m.id}`,
      kind: 'notetaker',
      actor: { name: 'AI Notetaker' },
      action: 'finished notes for',
      target: m.meetingName || 'your meeting',
      at: m.updatedAt.toISOString(),
      href: `/meetings/${m.id}`,
      forYou: true,
    })),
  ];
}

// ── Docs (created + assignments) ─────────────────────────────────────────────
async function collectDocs(ctx: Ctx): Promise<FeedItem[]> {
  const [created, assignedNotes] = await Promise.all([
    ctx.teamIds.length
      ? prisma.page.findMany({
          where: {
            teamId: { in: ctx.teamIds },
            isTemplate: false,
            visibility: { not: 'PRIVATE' },
            createdAt: { gte: ctx.since },
            OR: [{ authorId: { not: ctx.userId } }, { assignedTo: { userId: ctx.userId } }],
          },
          orderBy: { createdAt: 'desc' },
          take: PER_SOURCE,
          select: {
            id: true,
            title: true,
            emoji: true,
            createdAt: true,
            teamId: true,
            authorId: true,
            author: { select: userSelect },
            assignedBy: { select: userSelect },
            assignedTo: { select: { userId: true, user: { select: userSelect } } },
          },
        })
      : Promise.resolve([]),
    // Assignment has no timestamp on the page, so the notification is the source of truth for "when".
    prisma.notification.findMany({
      where: { userId: ctx.userId, type: 'PAGE_ASSIGNED', createdAt: { gte: ctx.since }, pageId: { not: null } },
      orderBy: { createdAt: 'desc' },
      take: PER_SOURCE,
      select: {
        id: true,
        createdAt: true,
        page: {
          select: { id: true, title: true, emoji: true, teamId: true, assignedBy: { select: userSelect } },
        },
      },
    }),
  ]);

  const out: FeedItem[] = [];
  const seen = new Set<string>();
  for (const n of assignedNotes) {
    const p = n.page;
    if (!p || seen.has(p.id)) continue;
    const team = ctx.teamById.get(p.teamId);
    if (!team) continue;
    seen.add(p.id);
    out.push({
      id: `doc-asg:${n.id}`,
      kind: 'doc',
      actor: actorOf(p.assignedBy),
      action: 'assigned you the doc',
      target: `${p.emoji ? `${p.emoji} ` : ''}${p.title}`,
      team: team.name,
      at: n.createdAt.toISOString(),
      href: `/team/${team.slug}/docs/${p.id}`,
      forYou: true,
    });
  }
  for (const p of created) {
    if (seen.has(p.id)) continue;
    const team = ctx.teamById.get(p.teamId);
    if (!team) continue;
    const assigneeId = p.assignedTo?.userId;
    let suffix: string | null = null;
    if (assigneeId === ctx.userId) suffix = ' · assigned to you';
    else if (p.assignedTo?.user) {
      const by = p.assignedBy && p.assignedBy.id !== p.authorId ? ` by ${p.assignedBy.name}` : '';
      suffix = ` · assigned to ${p.assignedTo.user.name}${by}`;
    }
    out.push({
      id: `doc:${p.id}`,
      kind: 'doc',
      actor: p.authorId === ctx.userId ? null : actorOf(p.author),
      action: p.authorId === ctx.userId ? 'Your doc was assigned:' : `created a doc in ${team.name}`,
      target: `${p.emoji ? `${p.emoji} ` : ''}${p.title}`,
      suffix,
      team: team.name,
      at: p.createdAt.toISOString(),
      href: `/team/${team.slug}/docs/${p.id}`,
      forYou: assigneeId === ctx.userId,
    });
  }
  return out;
}

// ── Tasks (assigned to me, and who-assigned-whom on my boards) ───────────────
async function collectTasks(ctx: Ctx): Promise<FeedItem[]> {
  const boards = await prisma.board.findMany({
    where: { isArchived: false, OR: [{ ownerId: ctx.userId }, { members: { some: { userId: ctx.userId } } }] },
    select: { id: true, title: true },
  });
  const boardTitle = new Map(boards.map((b) => [b.id, b.title]));

  const rows = await prisma.taskAssignee.findMany({
    where: {
      assignedAt: { gte: ctx.since },
      task: { isArchived: false },
      OR: [{ userId: ctx.userId }, { task: { boardId: { in: boards.map((b) => b.id) } } }],
      NOT: { AND: [{ assignedBy: ctx.userId }, { userId: ctx.userId }] }, // self-assignments are noise
    },
    orderBy: { assignedAt: 'desc' },
    take: PER_SOURCE * 2,
    select: {
      id: true,
      userId: true,
      assignedAt: true,
      assignedBy: true,
      user: { select: userSelect },
      task: { select: { id: true, title: true, boardId: true } },
    },
  });

  const assignerIds = Array.from(new Set(rows.map((r) => r.assignedBy).filter((x): x is string => !!x)));
  const assigners = assignerIds.length
    ? await prisma.user.findMany({ where: { id: { in: assignerIds } }, select: userSelect })
    : [];
  const byId = new Map(assigners.map((u) => [u.id, u]));

  return rows.slice(0, PER_SOURCE).map<FeedItem>((r) => {
    const toMe = r.userId === ctx.userId;
    const assigner = r.assignedBy ? byId.get(r.assignedBy) : undefined;
    const byMe = r.assignedBy === ctx.userId;
    return {
      id: `task:${r.id}`,
      kind: 'task',
      actor: byMe ? { name: 'You' } : actorOf(assigner) ?? { name: 'Someone' },
      action: toMe ? 'assigned you' : `assigned ${r.user.name}`,
      target: r.task.title,
      suffix: boardTitle.get(r.task.boardId) ? ` · ${boardTitle.get(r.task.boardId)}` : null,
      at: r.assignedAt.toISOString(),
      href: `/board/${r.task.boardId}`,
      forYou: toMe,
    };
  });
}

// ── Team members ─────────────────────────────────────────────────────────────
async function collectMembers(ctx: Ctx): Promise<FeedItem[]> {
  if (ctx.teamIds.length === 0) return [];
  const rows = await prisma.teamMember.findMany({
    where: { teamId: { in: ctx.teamIds }, createdAt: { gte: ctx.since }, userId: { not: ctx.userId } },
    orderBy: { createdAt: 'desc' },
    take: PER_SOURCE,
    select: { id: true, role: true, createdAt: true, teamId: true, user: { select: userSelect } },
  });
  return rows.map<FeedItem>((m) => {
    const team = ctx.teamById.get(m.teamId)!;
    return {
      id: `member:${m.id}`,
      kind: 'member',
      actor: actorOf(m.user),
      action: `joined ${team.name}`,
      target: null,
      suffix: m.role !== 'MEMBER' ? ` as ${m.role.toLowerCase()}` : null,
      team: team.name,
      at: m.createdAt.toISOString(),
      href: `/members/${team.slug}`,
      forYou: false,
    };
  });
}

// ── Workload (owners/admins only) ────────────────────────────────────────────
// Same score and threshold as /api/teams/[slug]/workload: score > 1.4 × team average.
const PRIORITY_WEIGHT: Record<string, number> = { URGENT: 10, HIGH: 7, MEDIUM: 5, LOW: 3 };

async function collectWorkload(ctx: Ctx): Promise<FeedItem[]> {
  const adminTeams = ctx.memberships.filter((m) => isAdminRole(m.role));
  const out: FeedItem[] = [];

  for (const { team } of adminTeams) {
    const members = await prisma.teamMember.findMany({
      where: { teamId: team.id },
      select: { id: true, userId: true, user: { select: userSelect } },
    });
    if (members.length < 2) continue;
    const ids = members.map((m) => m.userId);

    const [tasks, pages, files, reminders] = await Promise.all([
      prisma.taskAssignee.findMany({
        where: { userId: { in: ids }, task: { status: { not: 'DONE' } } },
        select: { userId: true, task: { select: { priority: true, dueDate: true } } },
      }),
      prisma.page.groupBy({
        by: ['assignedToId'],
        where: { teamId: team.id, isTemplate: false, assignedToId: { not: null } },
        _count: { _all: true },
      }),
      prisma.fileAssignment.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, file: { teamId: team.id } },
        _count: { _all: true },
      }),
      prisma.reminder.groupBy({
        by: ['userId'],
        where: { userId: { in: ids }, status: 'PENDING' },
        _count: { _all: true },
      }),
    ]);

    const pageCount = new Map(pages.map((p) => [p.assignedToId, p._count._all]));
    const fileCount = new Map(files.map((f) => [f.userId, f._count._all]));
    const reminderCount = new Map(reminders.map((r) => [r.userId, r._count._all]));

    const scored = members.map((m) => {
      let score = 0;
      for (const t of tasks) {
        if (t.userId !== m.userId) continue;
        score += PRIORITY_WEIGHT[t.task.priority] ?? 0;
        if (t.task.dueDate && t.task.dueDate < ctx.now) score += 8;
      }
      score += (pageCount.get(m.id) ?? 0) * 4 + (fileCount.get(m.userId) ?? 0) * 2 + (reminderCount.get(m.userId) ?? 0) * 3;
      return { m, score };
    });

    const avg = scored.reduce((s, x) => s + x.score, 0) / scored.length;
    if (avg <= 0) continue;
    for (const { m, score } of scored) {
      if (score <= avg * 1.4) continue;
      out.push({
        id: `workload:${team.id}:${m.userId}`,
        kind: 'workload',
        actor: actorOf(m.user),
        action: 'is overloaded',
        target: null,
        suffix: ` — score ${score} vs team avg ${Math.round(avg)}`,
        team: team.name,
        at: ctx.now.toISOString(),
        href: `/teams/${team.slug}/workload`,
        forYou: false,
        pinned: true,
      });
    }
  }
  return out;
}

// ── Clips (made public by a teammate) ────────────────────────────────────────
// Clips have no per-person sharing; a public share link is the only "shared" signal.
async function collectClips(ctx: Ctx): Promise<FeedItem[]> {
  if (ctx.teamIds.length === 0) return [];
  const clips = await prisma.clip.findMany({
    where: {
      isPublic: true,
      shareToken: { not: null },
      userId: { not: ctx.userId },
      updatedAt: { gte: ctx.since },
      user: { teamMembers: { some: { teamId: { in: ctx.teamIds } } } },
    },
    orderBy: { updatedAt: 'desc' },
    take: PER_SOURCE,
    select: { id: true, title: true, shareToken: true, updatedAt: true, user: { select: userSelect } },
  });
  return clips.map<FeedItem>((c) => ({
    id: `clip:${c.id}`,
    kind: 'clip',
    actor: actorOf(c.user),
    action: 'shared a clip',
    target: c.title,
    at: c.updatedAt.toISOString(),
    href: `/clipShare/${c.shareToken}`,
    forYou: false,
  }));
}

// ── Whiteboards ──────────────────────────────────────────────────────────────
async function collectWhiteboards(ctx: Ctx): Promise<FeedItem[]> {
  if (ctx.teamIds.length === 0) return [];
  const rooms = await prisma.room.findMany({
    where: { teamId: { in: ctx.teamIds }, isArchived: false, createdAt: { gte: ctx.since }, createdById: { not: ctx.userId } },
    orderBy: { createdAt: 'desc' },
    take: PER_SOURCE,
    select: { id: true, name: true, slug: true, teamId: true, createdAt: true, createdBy: { select: userSelect } },
  });
  return rooms.map<FeedItem>((r) => {
    const team = ctx.teamById.get(r.teamId)!;
    return {
      id: `wb:${r.id}`,
      kind: 'whiteboard',
      actor: actorOf(r.createdBy),
      action: `created a whiteboard for ${team.name}`,
      target: r.name,
      team: team.name,
      at: r.createdAt.toISOString(),
      href: `/team/${team.slug}/whiteboard/${r.slug}`,
      forYou: false,
    };
  });
}

export async function getActivityFeed(user: { id: string; email?: string | null }): Promise<ActivityFeed> {
  const now = new Date();
  const since = new Date(now.getTime() - WINDOW_DAYS * 86400_000);

  const memberships = await prisma.teamMember.findMany({
    where: { userId: user.id },
    select: { teamId: true, role: true, team: { select: { id: true, name: true, slug: true } } },
  });
  const isAdmin = memberships.some((m) => isAdminRole(m.role));

  const ctx: Ctx = {
    userId: user.id,
    email: user.email,
    since,
    now,
    memberships,
    teamIds: memberships.filter((m) => m.role !== 'CLIENT').map((m) => m.teamId),
    teamById: new Map(memberships.map((m) => [m.teamId, m.team])),
  };

  const label = ['mail', 'crm', 'files', 'notetaker', 'docs', 'tasks', 'members', 'workload', 'clips', 'whiteboards'];
  const results = await Promise.allSettled([
    collectMail(ctx, isAdmin),
    collectCrm(ctx),
    collectFiles(ctx),
    collectNotetaker(ctx),
    collectDocs(ctx),
    collectTasks(ctx),
    collectMembers(ctx),
    collectWorkload(ctx),
    collectClips(ctx),
    collectWhiteboards(ctx),
  ]);

  let mail: ActivityFeed['mail'] = isAdmin ? 'not_connected' : 'restricted';
  const items: FeedItem[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      console.error(`[activity-feed] ${label[i]} failed`, r.reason);
      return;
    }
    if (i === 0) {
      const v = r.value as Awaited<ReturnType<typeof collectMail>>;
      mail = v.status;
      items.push(...v.items);
    } else {
      items.push(...(r.value as FeedItem[]));
    }
  });

  // Upcoming notetaker joins (soonest first), then workload alerts, then everything else newest first.
  const rank = (i: FeedItem) => (!i.pinned ? 2 : i.kind === 'notetaker' ? 0 : 1);
  items.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    return rank(a) === 0 ? a.at.localeCompare(b.at) : b.at.localeCompare(a.at);
  });

  return { items: items.slice(0, 60), isAdmin, mail };
}
