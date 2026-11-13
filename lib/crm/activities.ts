import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { contactName, type ActivityType, type RecordKind, type TimelineFilter } from './constants';
import { USER_SELECT } from './companies';
import { badRequest, notFound, requireTeamUser, type CrmContext } from './http';
import { notifyTaskAssigned } from './notify';
import type { ActivityCreateInput, TimelineInput } from './schemas';
import { recomputeAfterDelete, targetsOf, touch } from './stamp';
import { blankToNull, iso, parseDate } from './values';

const ENTRY_SELECT = {
  id: true,
  type: true,
  subject: true,
  body: true,
  occurredAt: true,
  dueAt: true,
  completedAt: true,
  meta: true,
  createdAt: true,
  createdBy: { select: USER_SELECT },
  assignee: { select: USER_SELECT },
  company: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
  deal: { select: { id: true, name: true } },
} satisfies Prisma.CrmActivitySelect;

type Entry = Prisma.CrmActivityGetPayload<{ select: typeof ENTRY_SELECT }>;

const NOTE_TYPES: ActivityType[] = ['NOTE', 'CALL', 'EMAIL', 'MEETING'];

function serializeEntry(entry: Entry) {
  return {
    ...entry,
    occurredAt: iso(entry.occurredAt),
    dueAt: iso(entry.dueAt),
    completedAt: iso(entry.completedAt),
    createdAt: entry.createdAt.toISOString(),
    meta: entry.meta as Record<string, unknown> | null,
  };
}

// Upcoming means open tasks plus calls and meetings scheduled for later; everything else is history.
function upcomingClause(): Prisma.CrmActivityWhereInput {
  return {
    OR: [
      { type: 'TASK', completedAt: null },
      { type: { in: ['MEETING', 'CALL'] }, occurredAt: { gt: new Date() } },
    ],
  };
}

function filterClause(filter: TimelineFilter): Prisma.CrmActivityWhereInput {
  switch (filter) {
    case 'notes':
      return { type: { in: NOTE_TYPES } };
    case 'upcoming':
      return upcomingClause();
    case 'done':
      return { type: 'TASK', completedAt: { not: null } };
    case 'history':
      return { NOT: upcomingClause() };
    case 'email':
      return { type: 'EMAIL' };
    case 'meetings':
      return { type: 'MEETING' };
    case 'all':
      return {};
  }
}

function anchor(
  ctx: CrmContext,
  input: Pick<TimelineInput, 'companyId' | 'contactId' | 'dealId'>
): Prisma.CrmActivityWhereInput {
  if (input.dealId) return { teamId: ctx.teamId, dealId: input.dealId };
  if (input.contactId) return { teamId: ctx.teamId, contactId: input.contactId };
  if (input.companyId) return { teamId: ctx.teamId, companyId: input.companyId };
  throw badRequest('A timeline needs a company, a contact or a deal.');
}

export async function timeline(ctx: CrmContext, input: TimelineInput) {
  const base = anchor(ctx, input);
  const where = { ...base, ...filterClause(input.filter) };

  const [rows, counts] = await Promise.all([
    prisma.crmActivity.findMany({
      where,
      take: input.limit + 1,
      ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      orderBy: [{ occurredAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
      select: ENTRY_SELECT,
    }),
    timelineCounts(base),
  ]);

  const hasMore = rows.length > input.limit;
  const entries = hasMore ? rows.slice(0, input.limit) : rows;

  return {
    entries: entries.map(serializeEntry),
    nextCursor: hasMore ? (entries[entries.length - 1]?.id ?? null) : null,
    counts,
  };
}

async function timelineCounts(base: Prisma.CrmActivityWhereInput) {
  const [all, notes, upcoming, done, email, meetings] = await Promise.all([
    prisma.crmActivity.count({ where: base }),
    prisma.crmActivity.count({ where: { ...base, ...filterClause('notes') } }),
    prisma.crmActivity.count({ where: { ...base, ...filterClause('upcoming') } }),
    prisma.crmActivity.count({ where: { ...base, ...filterClause('done') } }),
    prisma.crmActivity.count({ where: { ...base, ...filterClause('email') } }),
    prisma.crmActivity.count({ where: { ...base, ...filterClause('meetings') } }),
  ]);
  return { all, notes, upcoming, done, email, meetings };
}

// Activities may name a deal or contact without its company: file them against the company as well.
async function resolveTargets(ctx: CrmContext, input: ActivityCreateInput) {
  let companyId: string | null = null;
  let about: { kind: RecordKind; id: string; name: string } | null = null;

  if (input.dealId) {
    const deal = await prisma.crmDeal.findFirst({
      where: { id: input.dealId, teamId: ctx.teamId },
      select: { id: true, name: true, companyId: true },
    });
    if (!deal) throw notFound('That deal does not exist in this team.');
    companyId = deal.companyId;
    about = { kind: 'deal', id: deal.id, name: deal.name };
  }

  if (input.contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: input.contactId, teamId: ctx.teamId },
      select: { id: true, firstName: true, lastName: true, companyId: true },
    });
    if (!contact) throw notFound('That contact does not exist in this team.');
    companyId = companyId ?? contact.companyId;
    about = about ?? { kind: 'contact', id: contact.id, name: contactName(contact) };
  }

  if (input.companyId) {
    const company = await prisma.crmCompany.findFirst({
      where: { id: input.companyId, teamId: ctx.teamId },
      select: { id: true, name: true },
    });
    if (!company) throw notFound('That company does not exist in this team.');
    companyId = company.id;
    about = about ?? { kind: 'company', id: company.id, name: company.name };
  }

  return { companyId, about };
}

export async function createActivity(ctx: CrmContext, input: ActivityCreateInput) {
  const { companyId, about } = await resolveTargets(ctx, input);
  const isTask = input.type === 'TASK';
  const assigneeId = isTask ? (input.assigneeId ?? ctx.userId) : null;
  await requireTeamUser(ctx.teamId, assigneeId);

  const activity = await prisma.crmActivity.create({
    data: {
      teamId: ctx.teamId,
      type: input.type as ActivityType,
      subject: blankToNull(input.subject),
      body: blankToNull(input.body),
      occurredAt: parseDate(input.occurredAt) ?? new Date(),
      dueAt: isTask ? parseDate(input.dueAt) : null,
      companyId,
      contactId: input.contactId ?? null,
      dealId: input.dealId ?? null,
      createdById: ctx.userId,
      assigneeId,
    },
    select: ENTRY_SELECT,
  });

  await touch({ companyId, contactId: input.contactId, dealId: input.dealId }, activity.createdAt);

  if (isTask) {
    await notifyTaskAssigned(ctx, {
      assigneeId,
      subject: activity.subject ?? 'A task',
      dueAt: activity.dueAt,
      about,
    });
  }

  return serializeEntry(activity);
}

async function ownedActivity(ctx: CrmContext, id: string) {
  const activity = await prisma.crmActivity.findFirst({
    where: { id, teamId: ctx.teamId },
    select: {
      id: true,
      type: true,
      subject: true,
      createdById: true,
      assigneeId: true,
      companyId: true,
      contactId: true,
      dealId: true,
      dueAt: true,
      company: { select: { id: true, name: true } },
      deal: { select: { id: true, name: true } },
    },
  });
  if (!activity) throw notFound('That activity does not exist in this team.');
  return activity;
}

export async function updateActivity(
  ctx: CrmContext,
  id: string,
  input: { completed?: boolean; subject?: string; body?: string; dueAt?: string | null; assigneeId?: string | null }
) {
  const activity = await ownedActivity(ctx, id);

  if (activity.type === 'STAGE_CHANGE' || activity.type === 'ENRICHMENT') {
    throw badRequest('This entry is history and cannot be edited.');
  }

  const data: Prisma.CrmActivityUncheckedUpdateInput = {};
  if (input.completed !== undefined) {
    if (activity.type !== 'TASK') throw badRequest('Only tasks can be completed.');
    data.completedAt = input.completed ? new Date() : null;
  }
  if (input.subject !== undefined) {
    if (activity.type === 'TASK' && !input.subject.trim()) throw badRequest('A task needs a subject.');
    data.subject = blankToNull(input.subject);
  }
  if (input.body !== undefined) data.body = blankToNull(input.body);
  if (input.dueAt !== undefined) {
    if (activity.type !== 'TASK') throw badRequest('Only tasks have a due date.');
    data.dueAt = parseDate(input.dueAt);
  }
  if (input.assigneeId !== undefined) {
    if (activity.type !== 'TASK') throw badRequest('Only tasks can be assigned.');
    await requireTeamUser(ctx.teamId, input.assigneeId);
    data.assigneeId = input.assigneeId;
  }

  const updated = await prisma.crmActivity.update({ where: { id }, data, select: ENTRY_SELECT });

  if (input.assigneeId && input.assigneeId !== activity.assigneeId) {
    const about = activity.deal
      ? { kind: 'deal' as const, id: activity.deal.id, name: activity.deal.name }
      : activity.company
        ? { kind: 'company' as const, id: activity.company.id, name: activity.company.name }
        : null;
    await notifyTaskAssigned(ctx, {
      assigneeId: input.assigneeId,
      subject: updated.subject ?? 'A task',
      dueAt: updated.dueAt,
      about,
    });
  }

  return serializeEntry(updated);
}

export async function deleteActivity(ctx: CrmContext, id: string) {
  const activity = await ownedActivity(ctx, id);
  if (activity.type === 'STAGE_CHANGE') throw badRequest('A stage change is history and cannot be deleted.');
  if (activity.createdById !== ctx.userId && !ctx.canManage) {
    throw badRequest('Only whoever logged it, or a manager, can delete this.');
  }

  const targets = await targetsOf({ id });
  await prisma.crmActivity.delete({ where: { id } });
  await recomputeAfterDelete(targets);
  return { id };
}

// Tasks assigned to me, or left unassigned by me.
function mineWhere(ctx: CrmContext): Prisma.CrmActivityWhereInput {
  return { OR: [{ assigneeId: ctx.userId }, { assigneeId: null, createdById: ctx.userId }] };
}

export async function myTasks(
  ctx: CrmContext,
  input: { window: 'overdue' | 'upcoming' | 'all'; scope: 'me' | 'everyone'; limit: number }
) {
  const now = new Date();
  const where: Prisma.CrmActivityWhereInput = {
    teamId: ctx.teamId,
    type: 'TASK',
    completedAt: null,
    ...(input.scope === 'me' ? mineWhere(ctx) : {}),
  };
  if (input.window === 'overdue') where.dueAt = { lt: now };
  if (input.window === 'upcoming') where.dueAt = { gte: now };

  const tasks = await prisma.crmActivity.findMany({
    where,
    take: input.limit,
    orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
    select: ENTRY_SELECT,
  });

  return tasks.map(serializeEntry);
}

export { mineWhere };
