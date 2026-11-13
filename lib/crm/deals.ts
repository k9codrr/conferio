import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  CLOSED_DEAL_STAGES,
  CLOSING_WINDOWS,
  FACET_ALL,
  OPEN_DEAL_STAGES,
  isClosedStage,
  isLosingStage,
  type ClosingWindow,
  type DealStage,
} from './constants';
import { USER_SELECT } from './companies';
import { converter, currencySettings } from './currency';
import { applyValues, tableColumnsFor, tableValuesFor, valuesFor } from './fields';
import { badRequest, notFound, requireTeamUser, type CrmContext } from './http';
import { notifyOwnerAssigned } from './notify';
import type { DealCreateInput, DealListInput, DealUpdateInput } from './schemas';
import { recomputeAfterDelete, targetsOf, touch } from './stamp';
import {
  blankToNull,
  countsByKey,
  decimalFromCents,
  iso,
  normalizeCurrency,
  paginate,
  parseDate,
  runBulk,
  toCents,
  unique,
  type BulkResult,
} from './values';

const COMPANY_SELECT = { id: true, name: true, domain: true } as const;
const CONTACT_SELECT = { id: true, firstName: true, lastName: true, email: true, title: true, imageUrl: true } as const;

const SORTABLE: Record<string, (dir: Prisma.SortOrder) => Prisma.CrmDealOrderByWithRelationInput[]> = {
  name: (dir) => [{ name: dir }],
  company: (dir) => [{ company: { name: dir } }, { name: 'asc' }],
  stage: (dir) => [{ stage: dir }, { expectedCloseDate: 'asc' }],
  amount: (dir) => [{ amount: { sort: dir, nulls: 'last' } }],
  expectedCloseDate: (dir) => [{ expectedCloseDate: dir }],
  createdAt: (dir) => [{ createdAt: dir }],
  owner: (dir) => [{ owner: { name: dir } }, { name: 'asc' }],
  lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: 'last' } }],
};

function closingFilter(window: ClosingWindow): Prisma.CrmDealWhereInput {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const startOfMonthAfter = new Date(now.getFullYear(), now.getMonth() + 2, 1);

  switch (window) {
    case 'overdue':
      return { expectedCloseDate: { lt: now }, stage: { in: OPEN_DEAL_STAGES } };
    case 'this-month':
      return { expectedCloseDate: { gte: startOfMonth, lt: startOfNextMonth } };
    case 'next-month':
      return { expectedCloseDate: { gte: startOfNextMonth, lt: startOfMonthAfter } };
    case 'later':
      return { expectedCloseDate: { gte: startOfMonthAfter } };
    case 'none':
      return { expectedCloseDate: null };
  }
}

function searchFilter(q: string): Prisma.CrmDealWhereInput {
  const term = q.trim();
  if (!term) return {};
  return {
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { company: { name: { contains: term, mode: 'insensitive' } } },
    ],
  };
}

function buildWhere(ctx: CrmContext, input: DealListInput): Prisma.CrmDealWhereInput {
  const where: Prisma.CrmDealWhereInput = { teamId: ctx.teamId, ...searchFilter(input.q) };

  if (input.owner !== FACET_ALL) where.ownerId = input.owner === 'me' ? ctx.userId : input.owner;
  if (input.company !== FACET_ALL) where.companyId = input.company;
  if (input.status === 'open') where.stage = { in: OPEN_DEAL_STAGES };
  else if (input.status === 'closed') where.stage = { in: CLOSED_DEAL_STAGES };
  if (input.stage !== FACET_ALL) where.stage = input.stage as DealStage;

  if (input.closing !== FACET_ALL && (CLOSING_WINDOWS as readonly string[]).indexOf(input.closing) !== -1) {
    const closing = closingFilter(input.closing as ClosingWindow);
    return { AND: [where, closing] };
  }

  return where;
}

async function openTotals(teamId: string, where: Prisma.CrmDealWhereInput) {
  const settings = await currencySettings(teamId);
  const convert = converter(settings);
  const groups = await prisma.crmDeal.groupBy({
    by: ['currency'],
    where: { AND: [where, { stage: { in: OPEN_DEAL_STAGES } }] },
    _sum: { amount: true },
    _count: { _all: true },
  });

  let openValueCents = 0;
  let unconvertedCount = 0;
  const unconvertedCurrencies: string[] = [];

  for (const group of groups) {
    const cents = toCents(group._sum.amount);
    if (cents === null) continue;
    const converted = convert(cents, group.currency);
    if (converted === null) {
      unconvertedCount += group._count._all;
      unconvertedCurrencies.push(group.currency);
    } else {
      openValueCents += converted;
    }
  }

  return {
    openValueCents,
    reportingCurrency: settings.reportingCurrency,
    unconverted: { count: unconvertedCount, currencies: unconvertedCurrencies },
  };
}

export async function listDeals(ctx: CrmContext, input: DealListInput) {
  const where = buildWhere(ctx, input);
  const { skip, take } = paginate(input.page, input.pageSize);
  const sort = SORTABLE[input.sort];
  const facetWhere: Prisma.CrmDealWhereInput = { teamId: ctx.teamId, ...searchFilter(input.q) };

  const [rows, total, owners, stages, closingCounts, totals, columns] = await Promise.all([
    prisma.crmDeal.findMany({
      where,
      skip,
      take,
      orderBy: sort ? sort(input.dir) : [{ createdAt: 'desc' }],
      select: {
        id: true,
        name: true,
        stage: true,
        amount: true,
        currency: true,
        expectedCloseDate: true,
        closedAt: true,
        stageChangedAt: true,
        company: { select: COMPANY_SELECT },
        owner: { select: USER_SELECT },
        lastActivityAt: true,
        createdAt: true,
      },
    }),
    prisma.crmDeal.count({ where }),
    prisma.crmDeal.groupBy({ by: ['ownerId'], where: facetWhere, _count: { _all: true } }),
    prisma.crmDeal.groupBy({ by: ['stage'], where: facetWhere, _count: { _all: true } }),
    Promise.all(
      CLOSING_WINDOWS.map((window) => prisma.crmDeal.count({ where: { AND: [facetWhere, closingFilter(window)] } }))
    ),
    openTotals(ctx.teamId, where),
    tableColumnsFor(ctx.teamId, 'DEAL'),
  ]);

  const fields = await tableValuesFor(ctx.teamId, 'DEAL', rows.map((row) => row.id));
  const stageCounts = countsByKey(stages, 'stage');
  const sum = (list: DealStage[]) => list.reduce((acc, stage) => acc + (stageCounts[stage] ?? 0), 0);

  return {
    rows: rows.map(({ amount, expectedCloseDate, closedAt, lastActivityAt, createdAt, stageChangedAt, ...row }) => ({
      ...row,
      amountCents: toCents(amount),
      expectedCloseDate: iso(expectedCloseDate),
      closedAt: iso(closedAt),
      stageChangedAt: stageChangedAt.toISOString(),
      lastActivityAt: iso(lastActivityAt),
      createdAt: createdAt.toISOString(),
      fields: fields.get(row.id) ?? {},
    })),
    total,
    columns,
    ...totals,
    facetCounts: {
      status: { open: sum(OPEN_DEAL_STAGES), closed: sum(CLOSED_DEAL_STAGES) },
      owner: countsByKey(owners, 'ownerId'),
      stage: stageCounts,
      closing: CLOSING_WINDOWS.reduce<Record<string, number>>((acc, window, index) => {
        acc[window] = closingCounts[index] ?? 0;
        return acc;
      }, {}),
    },
  };
}

// The pipeline board: every open deal, plus anything closed in the last 30 days, grouped by stage on the client.
export async function dealBoard(ctx: CrmContext, input: { q: string; owner: string }) {
  const where: Prisma.CrmDealWhereInput = { teamId: ctx.teamId, ...searchFilter(input.q) };
  if (input.owner !== FACET_ALL) where.ownerId = input.owner === 'me' ? ctx.userId : input.owner;

  const recentClose = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const settings = await currencySettings(ctx.teamId);
  const convert = converter(settings);

  const deals = await prisma.crmDeal.findMany({
    where: { AND: [where, { OR: [{ stage: { in: OPEN_DEAL_STAGES } }, { closedAt: { gte: recentClose } }] }] },
    orderBy: [{ stageChangedAt: 'desc' }],
    take: 500,
    select: {
      id: true,
      name: true,
      stage: true,
      amount: true,
      currency: true,
      expectedCloseDate: true,
      stageChangedAt: true,
      company: { select: COMPANY_SELECT },
      owner: { select: USER_SELECT },
      _count: { select: { activities: { where: { type: 'TASK', completedAt: null } } } },
    },
  });

  const now = new Date();
  return {
    reportingCurrency: settings.reportingCurrency,
    deals: deals.map(({ amount, expectedCloseDate, stageChangedAt, _count, ...deal }) => {
      const amountCents = toCents(amount);
      return {
        ...deal,
        amountCents,
        baseAmountCents: convert(amountCents, deal.currency),
        expectedCloseDate: iso(expectedCloseDate),
        overdue: Boolean(expectedCloseDate && expectedCloseDate < now && OPEN_DEAL_STAGES.indexOf(deal.stage as DealStage) !== -1),
        stageChangedAt: stageChangedAt.toISOString(),
        openTasks: _count.activities,
      };
    }),
  };
}

export async function getDeal(ctx: CrmContext, id: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id, teamId: ctx.teamId },
    select: {
      id: true,
      name: true,
      description: true,
      stage: true,
      stageChangedAt: true,
      amount: true,
      currency: true,
      expectedCloseDate: true,
      closedAt: true,
      closedReason: true,
      createdAt: true,
      lastActivityAt: true,
      company: {
        select: {
          ...COMPANY_SELECT,
          industry: true,
          members: { select: { role: true, user: { select: USER_SELECT } }, orderBy: { createdAt: 'asc' } },
        },
      },
      owner: { select: USER_SELECT },
      contacts: {
        select: { role: true, contact: { select: CONTACT_SELECT } },
        orderBy: { contact: { firstName: 'asc' } },
      },
    },
  });

  if (!deal) throw notFound('That deal does not exist in this team.');

  const settings = await currencySettings(ctx.teamId);
  const amountCents = toCents(deal.amount);
  const { contacts, amount, company, ...rest } = deal;

  return {
    ...rest,
    company: {
      id: company.id,
      name: company.name,
      domain: company.domain,
      industry: company.industry,
      members: company.members.map((member) => ({ ...member.user, role: member.role })),
    },
    amountCents,
    baseAmountCents: converter(settings)(amountCents, deal.currency),
    reportingCurrency: settings.reportingCurrency,
    stageChangedAt: deal.stageChangedAt.toISOString(),
    expectedCloseDate: iso(deal.expectedCloseDate),
    closedAt: iso(deal.closedAt),
    createdAt: deal.createdAt.toISOString(),
    lastActivityAt: iso(deal.lastActivityAt),
    fields: await valuesFor(ctx.teamId, 'DEAL', id),
    contacts: contacts.map(({ role, contact }) => ({ ...contact, role })),
  };
}

async function assertCompanyInTeam(ctx: CrmContext, companyId: string) {
  const company = await prisma.crmCompany.findFirst({
    where: { id: companyId, teamId: ctx.teamId },
    select: { id: true, name: true },
  });
  if (!company) throw notFound('That company does not exist in this team.');
  return company;
}

export async function createDeal(ctx: CrmContext, input: DealCreateInput) {
  await assertCompanyInTeam(ctx, input.companyId);
  await requireTeamUser(ctx.teamId, input.ownerId);

  const stage = (input.stage ?? 'DEMO_BOOKED') as DealStage;
  const now = new Date();
  const settings = await currencySettings(ctx.teamId);

  const deal = await prisma.crmDeal.create({
    data: {
      teamId: ctx.teamId,
      name: input.name.trim(),
      companyId: input.companyId,
      ownerId: input.ownerId,
      stage,
      stageChangedAt: now,
      closedAt: isClosedStage(stage) ? now : null,
      amount: decimalFromCents(input.amountCents),
      currency: normalizeCurrency(input.currency, settings.reportingCurrency),
      expectedCloseDate: parseDate(input.expectedCloseDate),
    },
    select: { id: true, name: true, companyId: true },
  });

  await notifyOwnerAssigned(ctx, { ownerId: input.ownerId, kind: 'deal', id: deal.id, name: deal.name });
  return deal;
}

async function ownedDeal(ctx: CrmContext, id: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id, teamId: ctx.teamId },
    select: { id: true, name: true, stage: true, companyId: true, ownerId: true, company: { select: { name: true } } },
  });
  if (!deal) throw notFound('That deal does not exist in this team.');
  return deal;
}

export async function updateDeal(ctx: CrmContext, id: string, input: DealUpdateInput) {
  const current = await ownedDeal(ctx, id);
  const data: Prisma.CrmDealUncheckedUpdateInput = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.description !== undefined) {
    data.description = input.description === null ? null : blankToNull(input.description);
  }
  if (input.companyId !== undefined) {
    await assertCompanyInTeam(ctx, input.companyId);
    data.companyId = input.companyId;
  }
  if (input.ownerId !== undefined) {
    await requireTeamUser(ctx.teamId, input.ownerId);
    data.ownerId = input.ownerId;
  }
  if (input.amountCents !== undefined) data.amount = decimalFromCents(input.amountCents);
  if (input.currency !== undefined) data.currency = normalizeCurrency(input.currency);
  if (input.expectedCloseDate !== undefined) data.expectedCloseDate = parseDate(input.expectedCloseDate);

  const updated = await prisma.$transaction(async (tx) => {
    if (input.fields) await applyValues(tx, ctx.teamId, 'DEAL', id, input.fields);
    return tx.crmDeal.update({ where: { id }, data, select: { id: true, name: true } });
  });

  if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
    await notifyOwnerAssigned(ctx, { ownerId: input.ownerId, kind: 'deal', id, name: updated.name });
  }

  return updated;
}

export async function deleteDeal(ctx: CrmContext, id: string) {
  const deal = await ownedDeal(ctx, id);

  const targets = await prisma.$transaction(async (tx) => {
    const found = await targetsOf({ dealId: id }, tx);
    await tx.crmDeal.delete({ where: { id } });
    return found;
  });

  await recomputeAfterDelete(targets);
  return { id, name: deal.name };
}

export async function setDealStage(ctx: CrmContext, id: string, input: { stage: string; closedReason?: string }) {
  const deal = await ownedDeal(ctx, id);
  const stage = input.stage as DealStage;

  if (deal.stage === stage) return { id: deal.id, stage: deal.stage, changed: false };

  const closedReason = input.closedReason?.trim();
  if (isLosingStage(stage) && !closedReason) {
    throw badRequest('Say why it was lost: a closed-lost deal with no reason teaches nobody anything.');
  }

  const now = new Date();
  const closed = isClosedStage(stage);

  const [updated] = await prisma.$transaction([
    prisma.crmDeal.update({
      where: { id },
      data: {
        stage,
        stageChangedAt: now,
        closedAt: closed ? now : null,
        closedReason: closed ? (closedReason ?? null) : null,
      },
      select: { id: true, stage: true },
    }),
    prisma.crmActivity.create({
      data: {
        teamId: ctx.teamId,
        type: 'STAGE_CHANGE',
        subject: 'Stage changed',
        body: closedReason ?? null,
        occurredAt: now,
        companyId: deal.companyId,
        dealId: deal.id,
        createdById: ctx.userId,
        meta: { from: deal.stage, to: stage },
      },
    }),
  ]);

  await touch({ companyId: deal.companyId, dealId: deal.id }, new Date());

  return { ...updated, changed: true };
}

// Contacts on a deal

export async function dealContactOptions(ctx: CrmContext, dealId: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, teamId: ctx.teamId },
    select: { companyId: true, contacts: { select: { contactId: true } } },
  });
  if (!deal) throw notFound('That deal does not exist in this team.');

  return prisma.crmContact.findMany({
    where: { companyId: deal.companyId, id: { notIn: deal.contacts.map((row) => row.contactId) } },
    select: CONTACT_SELECT,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 100,
  });
}

export async function attachDealContact(
  ctx: CrmContext,
  dealId: string,
  input: { contactId: string; role?: string | null }
) {
  const deal = await ownedDeal(ctx, dealId);
  const contact = await prisma.crmContact.findFirst({
    where: { id: input.contactId, teamId: ctx.teamId },
    select: { companyId: true },
  });
  if (!contact) throw notFound('That contact does not exist in this team.');
  if (contact.companyId !== deal.companyId) throw badRequest(`That contact does not work at ${deal.company.name}.`);

  const role = blankToNull(input.role ?? null);
  await prisma.crmDealContact.upsert({
    where: { dealId_contactId: { dealId, contactId: input.contactId } },
    create: { dealId, contactId: input.contactId, role },
    update: role === null ? {} : { role },
  });

  return { dealId, contactId: input.contactId };
}

export async function detachDealContact(ctx: CrmContext, dealId: string, contactId: string) {
  await ownedDeal(ctx, dealId);
  const { count } = await prisma.crmDealContact.deleteMany({ where: { dealId, contactId } });
  if (count === 0) throw notFound('That contact is not on this deal.');
  return { dealId, contactId };
}

export async function setDealContactRole(ctx: CrmContext, dealId: string, input: { contactId: string; role: string | null }) {
  await ownedDeal(ctx, dealId);
  const role = blankToNull(input.role);
  const { count } = await prisma.crmDealContact.updateMany({
    where: { dealId, contactId: input.contactId },
    data: { role },
  });
  if (count === 0) throw notFound('That contact is not on this deal.');
  return { dealId, contactId: input.contactId, role };
}

export async function bulkDeals(
  ctx: CrmContext,
  input:
    | { action: 'owner'; ids: string[]; ownerId: string }
    | { action: 'stage'; ids: string[]; stage: string; closedReason?: string }
    | { action: 'delete'; ids: string[] }
): Promise<BulkResult> {
  const ids = unique(input.ids);

  if (input.action === 'delete') return runBulk(ids, (id) => deleteDeal(ctx, id));

  if (input.action === 'stage') {
    if (isLosingStage(input.stage as DealStage) && !input.closedReason?.trim()) {
      throw badRequest('Say why they were lost: a closed-lost deal with no reason teaches nobody anything.');
    }
    return runBulk(ids, (id) => setDealStage(ctx, id, { stage: input.stage, closedReason: input.closedReason }));
  }

  await requireTeamUser(ctx.teamId, input.ownerId);
  const { count } = await prisma.crmDeal.updateMany({
    where: { id: { in: ids }, teamId: ctx.teamId },
    data: { ownerId: input.ownerId },
  });
  if (count > 0) {
    await notifyOwnerAssigned(ctx, {
      ownerId: input.ownerId,
      kind: 'deal',
      id: ids[0],
      name: count === 1 ? 'a deal' : `${count} deals`,
    });
  }
  return { requested: ids.length, succeeded: count, failed: ids.length - count, message: null };
}
