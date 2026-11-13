import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { OPEN_DEAL_STAGES, contactName, type DealStage } from './constants';
import { mineWhere } from './activities';
import { USER_SELECT } from './companies';
import { converter, currencySettings } from './currency';
import type { CrmContext } from './http';
import { iso, toCents } from './values';

const TREND_MONTHS = 6;
const RATE_WINDOW_DAYS = 90;
const AGENDA_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

function monthStart(from: Date, offset: number): Date {
  return new Date(from.getFullYear(), from.getMonth() + offset, 1);
}

function monthKey(date: Date): number {
  return date.getFullYear() * 12 + date.getMonth();
}

const TASK_SELECT = {
  id: true,
  subject: true,
  dueAt: true,
  assignee: { select: USER_SELECT },
  company: { select: { id: true, name: true } },
  deal: { select: { id: true, name: true } },
  contact: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.CrmActivitySelect;

export type AgendaItem = {
  id: string;
  kind: 'task' | 'meeting' | 'call' | 'close';
  title: string;
  at: string;
  person: { id: string; name: string; image: string | null } | null;
  about: { kind: 'company' | 'contact' | 'deal'; id: string; name: string } | null;
  amountCents?: number | null;
  currency?: string;
  stage?: DealStage;
};

export async function dashboardSummary(ctx: CrmContext, scope: 'me' | 'everyone') {
  const mine = scope === 'me';
  const owned = mine ? { ownerId: ctx.userId } : {};
  const team = { teamId: ctx.teamId };
  const taskScope: Prisma.CrmActivityWhereInput = mine ? mineWhere(ctx) : {};

  const now = new Date();
  const startOfMonth = monthStart(now, 0);
  const startOfNextMonth = monthStart(now, 1);
  const startOfPrevMonth = monthStart(now, -1);
  const trendStart = monthStart(now, -(TREND_MONTHS - 1));
  const rateStart = new Date(now.getTime() - RATE_WINDOW_DAYS * DAY_MS);
  const agendaEnd = new Date(now.getTime() + AGENDA_DAYS * DAY_MS);

  const settings = await currencySettings(ctx.teamId);
  const base = settings.reportingCurrency;
  const convert = converter(settings);

  const [openDeals, recentDeals, overdueTasks, agendaTasks, scheduled, recentActivity, myClients, counts] = await Promise.all([
    prisma.crmDeal.findMany({
      where: { ...team, ...owned, stage: { in: OPEN_DEAL_STAGES } },
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        currency: true,
        expectedCloseDate: true,
        stageChangedAt: true,
        company: { select: { id: true, name: true } },
        owner: { select: USER_SELECT },
      },
    }),
    prisma.crmDeal.findMany({
      where: { ...team, ...owned, OR: [{ createdAt: { gte: trendStart } }, { closedAt: { gte: trendStart } }] },
      select: { amount: true, currency: true, stage: true, createdAt: true, closedAt: true },
    }),
    prisma.crmActivity.findMany({
      where: { ...team, type: 'TASK', completedAt: null, dueAt: { lt: now }, AND: [taskScope] },
      orderBy: [{ dueAt: 'asc' }],
      take: 10,
      select: TASK_SELECT,
    }),
    prisma.crmActivity.findMany({
      where: {
        ...team,
        type: 'TASK',
        completedAt: null,
        OR: [{ dueAt: { gte: now, lt: agendaEnd } }, { dueAt: null }],
        AND: [taskScope],
      },
      orderBy: [{ dueAt: { sort: 'asc', nulls: 'last' } }],
      take: 20,
      select: TASK_SELECT,
    }),
    prisma.crmActivity.findMany({
      where: {
        ...team,
        type: { in: ['MEETING', 'CALL'] },
        occurredAt: { gte: now, lt: agendaEnd },
        ...(mine ? { createdById: ctx.userId } : {}),
      },
      orderBy: [{ occurredAt: 'asc' }],
      take: 20,
      select: {
        id: true,
        type: true,
        subject: true,
        occurredAt: true,
        createdBy: { select: USER_SELECT },
        company: { select: { id: true, name: true } },
        deal: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.crmActivity.findMany({
      where: { ...team, ...(mine ? { createdById: ctx.userId } : {}) },
      orderBy: [{ createdAt: 'desc' }],
      take: 12,
      select: {
        id: true,
        type: true,
        subject: true,
        body: true,
        createdAt: true,
        meta: true,
        createdBy: { select: USER_SELECT },
        company: { select: { id: true, name: true } },
        deal: { select: { id: true, name: true } },
      },
    }),
    prisma.crmCompany.findMany({
      where: { ...team, OR: [{ ownerId: ctx.userId }, { members: { some: { userId: ctx.userId } } }] },
      orderBy: { lastActivityAt: { sort: 'desc', nulls: 'last' } },
      take: 8,
      select: {
        id: true,
        name: true,
        domain: true,
        lastActivityAt: true,
        ownerId: true,
        members: { where: { userId: ctx.userId }, select: { role: true } },
        _count: { select: { deals: { where: { stage: { in: OPEN_DEAL_STAGES } } } } },
      },
    }),
    Promise.all([
      prisma.crmCompany.count({ where: team }),
      prisma.crmContact.count({ where: team }),
      prisma.crmDeal.count({ where: team }),
    ]),
  ]);

  const unconverted = new Map<string, number>();
  const markUnconverted = (currency: string) => unconverted.set(currency, (unconverted.get(currency) ?? 0) + 1);

  const stageMap = new Map<DealStage, { count: number; valueCents: number }>();
  for (const stage of OPEN_DEAL_STAGES) stageMap.set(stage, { count: 0, valueCents: 0 });

  const valuedOpen = openDeals.map((deal) => {
    const amountCents = toCents(deal.amount);
    const baseAmountCents = convert(amountCents, deal.currency);
    const bucket = stageMap.get(deal.stage as DealStage);
    if (bucket) {
      bucket.count += 1;
      bucket.valueCents += baseAmountCents ?? 0;
    }
    if (amountCents !== null && baseAmountCents === null) markUnconverted(deal.currency);
    return { ...deal, amountCents, baseAmountCents };
  });

  const stages = OPEN_DEAL_STAGES.map((stage) => ({ stage, ...(stageMap.get(stage) ?? { count: 0, valueCents: 0 }) }));

  const closingThisMonth = valuedOpen.filter(
    (deal) => deal.expectedCloseDate && deal.expectedCloseDate >= startOfMonth && deal.expectedCloseDate < startOfNextMonth
  );

  const firstBucket = monthKey(trendStart);
  const trend = Array.from({ length: TREND_MONTHS }, (_, index) => ({
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(monthStart(trendStart, index)),
    won: 0,
    created: 0,
  }));

  const wonThisMonth = { count: 0, valueCents: 0 };
  const wonPrevMonth = { count: 0, valueCents: 0 };
  let wins = 0;
  let losses = 0;
  let valuedWins = 0;
  let wonCents = 0;
  let cycleDays = 0;

  for (const deal of recentDeals) {
    const amountCents = toCents(deal.amount);
    const valued = convert(amountCents, deal.currency);
    const cents = valued ?? 0;
    if (amountCents !== null && valued === null && deal.stage === 'CLOSED_WON') markUnconverted(deal.currency);

    const created = trend[monthKey(deal.createdAt) - firstBucket];
    if (created) created.created += cents;

    const { closedAt, stage } = deal;
    if (!closedAt) continue;
    const won = stage === 'CLOSED_WON';

    if (won) {
      const closed = trend[monthKey(closedAt) - firstBucket];
      if (closed) closed.won += cents;

      if (closedAt >= startOfMonth && closedAt < startOfNextMonth) {
        wonThisMonth.count += 1;
        wonThisMonth.valueCents += cents;
      } else if (closedAt >= startOfPrevMonth && closedAt < startOfMonth) {
        wonPrevMonth.count += 1;
        wonPrevMonth.valueCents += cents;
      }
    }

    if (closedAt < rateStart) continue;
    if (won) {
      wins += 1;
      if (valued !== null) {
        valuedWins += 1;
        wonCents += cents;
      }
      cycleDays += (closedAt.getTime() - deal.createdAt.getTime()) / DAY_MS;
    } else if (stage === 'CLOSED_LOST') {
      losses += 1;
    }
  }

  const decided = wins + losses;

  const aboutOf = (row: {
    deal: { id: string; name: string } | null;
    contact: { id: string; firstName: string; lastName: string | null } | null;
    company: { id: string; name: string } | null;
  }): AgendaItem['about'] =>
    row.deal
      ? { kind: 'deal', id: row.deal.id, name: row.deal.name }
      : row.contact
        ? { kind: 'contact', id: row.contact.id, name: contactName(row.contact) }
        : row.company
          ? { kind: 'company', id: row.company.id, name: row.company.name }
          : null;

  const undatedTasks = agendaTasks.filter((task) => !task.dueAt);
  const agenda: AgendaItem[] = [
    ...agendaTasks
      .filter((task) => task.dueAt)
      .map((task): AgendaItem => ({
        id: task.id,
        kind: 'task',
        title: task.subject ?? 'Task',
        at: task.dueAt!.toISOString(),
        person: task.assignee,
        about: aboutOf(task),
      })),
    ...scheduled.map((item): AgendaItem => ({
      id: item.id,
      kind: item.type === 'MEETING' ? 'meeting' : 'call',
      title: item.subject ?? (item.type === 'MEETING' ? 'Meeting' : 'Call'),
      at: item.occurredAt!.toISOString(),
      person: item.createdBy,
      about: aboutOf(item),
    })),
    ...valuedOpen
      .filter((deal) => deal.expectedCloseDate && deal.expectedCloseDate >= now && deal.expectedCloseDate < agendaEnd)
      .map((deal): AgendaItem => ({
        id: deal.id,
        kind: 'close',
        title: `${deal.name} expected to close`,
        at: deal.expectedCloseDate!.toISOString(),
        person: deal.owner,
        about: { kind: 'deal', id: deal.id, name: deal.company.name },
        amountCents: deal.amountCents,
        currency: deal.currency,
        stage: deal.stage as DealStage,
      })),
  ].sort((a, b) => a.at.localeCompare(b.at));

  const taskRow = (task: (typeof overdueTasks)[number]) => ({ ...task, dueAt: iso(task.dueAt) });
  const closesSoon = valuedOpen.filter((deal) => deal.expectedCloseDate && deal.expectedCloseDate < now);

  return {
    scope,
    reportingCurrency: base,
    currencyInferred: settings.inferred,
    unconverted: {
      count: Array.from(unconverted.values()).reduce((a, b) => a + b, 0),
      currencies: Array.from(unconverted.keys()),
    },
    totals: { companies: counts[0], contacts: counts[1], deals: counts[2] },
    pipeline: {
      stages,
      totalCents: stages.reduce((total, s) => total + s.valueCents, 0),
      totalDeals: stages.reduce((total, s) => total + s.count, 0),
    },
    wonThisMonth,
    wonPrevMonth,
    performance: {
      windowDays: RATE_WINDOW_DAYS,
      wins,
      losses,
      winRate: decided === 0 ? null : wins / decided,
      avgDealCents: valuedWins === 0 ? null : Math.round(wonCents / valuedWins),
      avgCycleDays: wins === 0 ? null : Math.round(cycleDays / wins),
    },
    trend,
    closingThisMonthTotal: {
      count: closingThisMonth.length,
      valueCents: closingThisMonth.reduce((total, deal) => total + (deal.baseAmountCents ?? 0), 0),
    },
    slippedDeals: closesSoon.length,
    biggestOpen: valuedOpen
      .slice()
      .sort((a, b) => (b.baseAmountCents ?? -1) - (a.baseAmountCents ?? -1))
      .slice(0, 6)
      .map(({ amount, expectedCloseDate, stageChangedAt, ...deal }) => ({
        ...deal,
        expectedCloseDate: iso(expectedCloseDate),
        stageChangedAt: stageChangedAt.toISOString(),
      })),
    overdueTasks: overdueTasks.map(taskRow),
    agenda,
    agendaDays: AGENDA_DAYS,
    undatedTasks: undatedTasks.map(taskRow),
    myClients: myClients.map((client) => ({
      id: client.id,
      name: client.name,
      domain: client.domain,
      lastActivityAt: iso(client.lastActivityAt),
      openDeals: client._count.deals,
      relation: client.ownerId === ctx.userId ? 'Owner' : (client.members[0]?.role ?? 'Assigned'),
    })),
    recentActivity: recentActivity.map(({ createdAt, meta, ...entry }) => ({
      ...entry,
      createdAt: createdAt.toISOString(),
      meta: meta as Record<string, unknown> | null,
    })),
  };
}
