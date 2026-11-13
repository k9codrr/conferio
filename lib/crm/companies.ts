import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FACET_ALL, FACET_UNASSIGNED, OPEN_DEAL_STAGES } from './constants';
import { converter, currencySettings } from './currency';
import { applyValues, tableColumnsFor, tableValuesFor, valuesFor } from './fields';
import { badRequest, conflict, notFound, requireTeamUser, type CrmContext } from './http';
import { notifyClientAssigned, notifyOwnerAssigned } from './notify';
import type { CompanyCreateInput, CompanyListInput, CompanyUpdateInput } from './schemas';
import { recomputeAfterDelete, targetsOf } from './stamp';
import {
  blankToNull,
  countsByKey,
  iso,
  normalizeDomain,
  paginate,
  runBulk,
  toCents,
  unique,
  type BulkResult,
} from './values';

export const USER_SELECT = { id: true, name: true, email: true, image: true } as const;

const SORTABLE: Record<string, (dir: Prisma.SortOrder) => Prisma.CrmCompanyOrderByWithRelationInput> = {
  name: (dir) => ({ name: dir }),
  domain: (dir) => ({ domain: dir }),
  industry: (dir) => ({ industry: dir }),
  createdAt: (dir) => ({ createdAt: dir }),
  contacts: (dir) => ({ contacts: { _count: dir } }),
  deals: (dir) => ({ deals: { _count: dir } }),
  owner: (dir) => ({ owner: { name: dir } }),
  lastActivity: (dir) => ({ lastActivityAt: { sort: dir, nulls: 'last' } }),
};

function searchFilter(q: string): Prisma.CrmCompanyWhereInput {
  const term = q.trim();
  if (!term) return {};
  return {
    OR: [
      { name: { contains: term, mode: 'insensitive' } },
      { domain: { contains: term, mode: 'insensitive' } },
    ],
  };
}

function buildWhere(ctx: CrmContext, input: CompanyListInput): Prisma.CrmCompanyWhereInput {
  const where: Prisma.CrmCompanyWhereInput = { teamId: ctx.teamId, ...searchFilter(input.q) };

  if (input.owner !== FACET_ALL) {
    where.ownerId = input.owner === FACET_UNASSIGNED ? null : input.owner === 'me' ? ctx.userId : input.owner;
  }
  if (input.industry !== FACET_ALL) where.industry = input.industry;
  if (input.source !== FACET_ALL) where.source = input.source as Prisma.CrmCompanyWhereInput['source'];
  if (input.member !== FACET_ALL) {
    where.members = { some: { userId: input.member === 'me' ? ctx.userId : input.member } };
  }

  return where;
}

export async function listCompanies(ctx: CrmContext, input: CompanyListInput) {
  const where = buildWhere(ctx, input);
  const { skip, take } = paginate(input.page, input.pageSize);
  const sort = SORTABLE[input.sort];
  const facetWhere = { teamId: ctx.teamId, ...searchFilter(input.q) };

  const [rows, total, owners, industries, sources, assignedToMe, columns] = await Promise.all([
    prisma.crmCompany.findMany({
      where,
      skip,
      take,
      orderBy: sort ? sort(input.dir) : { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        domain: true,
        industry: true,
        source: true,
        owner: { select: USER_SELECT },
        members: { select: { role: true, user: { select: USER_SELECT } }, orderBy: { createdAt: 'asc' } },
        _count: { select: { contacts: true, deals: { where: { stage: { in: OPEN_DEAL_STAGES } } } } },
        lastActivityAt: true,
        createdAt: true,
      },
    }),
    prisma.crmCompany.count({ where }),
    prisma.crmCompany.groupBy({ by: ['ownerId'], where: facetWhere, _count: { _all: true } }),
    prisma.crmCompany.groupBy({ by: ['industry'], where: facetWhere, _count: { _all: true } }),
    prisma.crmCompany.groupBy({ by: ['source'], where: facetWhere, _count: { _all: true } }),
    prisma.crmCompany.count({ where: { ...facetWhere, members: { some: { userId: ctx.userId } } } }),
    tableColumnsFor(ctx.teamId, 'COMPANY'),
  ]);

  const fields = await tableValuesFor(ctx.teamId, 'COMPANY', rows.map((row) => row.id));

  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      industry: row.industry,
      source: row.source,
      owner: row.owner,
      members: row.members.map((member) => ({ ...member.user, role: member.role })),
      contactCount: row._count.contacts,
      openDealCount: row._count.deals,
      lastActivityAt: iso(row.lastActivityAt),
      createdAt: row.createdAt.toISOString(),
      fields: fields.get(row.id) ?? {},
    })),
    total,
    columns,
    facetCounts: {
      owner: countsByKey(owners, 'ownerId', FACET_UNASSIGNED),
      industry: countsByKey(industries, 'industry'),
      source: countsByKey(sources, 'source'),
      member: { me: assignedToMe },
    },
  };
}

export async function getCompany(ctx: CrmContext, id: string) {
  const company = await prisma.crmCompany.findFirst({
    where: { id, teamId: ctx.teamId },
    select: {
      id: true,
      name: true,
      domain: true,
      website: true,
      description: true,
      industry: true,
      city: true,
      stateCode: true,
      country: true,
      phone: true,
      email: true,
      linkedinUrl: true,
      twitterUrl: true,
      source: true,
      createdAt: true,
      lastActivityAt: true,
      primaryContactId: true,
      enrichmentStatus: true,
      enrichedAt: true,
      enrichmentError: true,
      _count: { select: { suggestions: { where: { status: 'PROPOSED' } } } },
      owner: { select: USER_SELECT },
      createdBy: { select: USER_SELECT },
      members: {
        orderBy: { createdAt: 'asc' },
        select: { id: true, role: true, createdAt: true, user: { select: USER_SELECT } },
      },
      contacts: {
        orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          title: true,
          imageUrl: true,
          owner: { select: USER_SELECT },
        },
      },
      deals: {
        orderBy: [{ stage: 'asc' }, { expectedCloseDate: 'asc' }],
        select: {
          id: true,
          name: true,
          stage: true,
          amount: true,
          currency: true,
          expectedCloseDate: true,
          owner: { select: USER_SELECT },
        },
      },
    },
  });

  if (!company) throw notFound('That company does not exist in this team.');

  const settings = await currencySettings(ctx.teamId);
  const convert = converter(settings);
  const { deals, members, createdAt, lastActivityAt, enrichedAt, _count, ...rest } = company;

  return {
    ...rest,
    enrichedAt: iso(enrichedAt),
    pendingSuggestions: _count.suggestions,
    createdAt: createdAt.toISOString(),
    lastActivityAt: iso(lastActivityAt),
    reportingCurrency: settings.reportingCurrency,
    members: members.map((member) => ({
      assignmentId: member.id,
      role: member.role,
      assignedAt: member.createdAt.toISOString(),
      ...member.user,
    })),
    fields: await valuesFor(ctx.teamId, 'COMPANY', id),
    deals: deals.map(({ amount, expectedCloseDate, ...deal }) => {
      const amountCents = toCents(amount);
      return {
        ...deal,
        amountCents,
        baseAmountCents: convert(amountCents, deal.currency),
        expectedCloseDate: iso(expectedCloseDate),
      };
    }),
  };
}

export async function companyOptions(ctx: CrmContext, q: string) {
  return prisma.crmCompany.findMany({
    where: { teamId: ctx.teamId, ...searchFilter(q) },
    select: { id: true, name: true, domain: true },
    orderBy: { name: 'asc' },
    take: 100,
  });
}

async function assertDomainFree(ctx: CrmContext, domain: string | null, exceptId?: string) {
  if (!domain) return;
  const existing = await prisma.crmCompany.findFirst({
    where: { teamId: ctx.teamId, domain, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { name: true },
  });
  if (existing) throw conflict(`${existing.name} already uses the domain ${domain}.`);
}

export async function createCompany(ctx: CrmContext, input: CompanyCreateInput) {
  if (input.domain && input.domain.trim() && !normalizeDomain(input.domain)) {
    throw badRequest(`"${input.domain}" is not a domain. Try something like "stripe.com".`);
  }
  const domain = normalizeDomain(input.domain);
  await assertDomainFree(ctx, domain);

  const ownerId = input.ownerId ?? null;
  await requireTeamUser(ctx.teamId, ownerId);

  const memberIds = unique(input.memberIds ?? []);
  for (const memberId of memberIds) await requireTeamUser(ctx.teamId, memberId);

  const company = await prisma.crmCompany.create({
    data: {
      teamId: ctx.teamId,
      name: input.name.trim(),
      domain,
      website: domain ? `https://${domain}` : null,
      industry: blankToNull(input.industry),
      ownerId,
      createdById: ctx.userId,
      members: memberIds.length
        ? { create: memberIds.map((userId) => ({ userId, assignedById: ctx.userId })) }
        : undefined,
    },
    select: { id: true, name: true, domain: true },
  });

  await notifyOwnerAssigned(ctx, { ownerId, kind: 'company', id: company.id, name: company.name });
  for (const userId of memberIds) {
    await notifyClientAssigned(ctx, { userId, companyId: company.id, companyName: company.name });
  }

  return company;
}

async function ownedCompany(ctx: CrmContext, id: string) {
  const company = await prisma.crmCompany.findFirst({
    where: { id, teamId: ctx.teamId },
    select: { id: true, name: true, domain: true, ownerId: true },
  });
  if (!company) throw notFound('That company does not exist in this team.');
  return company;
}

export async function updateCompany(ctx: CrmContext, id: string, input: CompanyUpdateInput) {
  const current = await ownedCompany(ctx, id);
  const data: Prisma.CrmCompanyUncheckedUpdateInput = {};

  if (input.name !== undefined) data.name = input.name.trim();
  if (input.website !== undefined) data.website = blankToNull(input.website);
  if (input.description !== undefined) data.description = blankToNull(input.description);
  if (input.industry !== undefined) data.industry = blankToNull(input.industry);
  if (input.city !== undefined) data.city = blankToNull(input.city);
  if (input.stateCode !== undefined) data.stateCode = blankToNull(input.stateCode);
  if (input.country !== undefined) data.country = blankToNull(input.country);
  if (input.phone !== undefined) data.phone = blankToNull(input.phone);
  if (input.email !== undefined) data.email = blankToNull(input.email);
  if (input.linkedinUrl !== undefined) data.linkedinUrl = blankToNull(input.linkedinUrl);
  if (input.twitterUrl !== undefined) data.twitterUrl = blankToNull(input.twitterUrl);
  if (input.ownerId !== undefined) {
    await requireTeamUser(ctx.teamId, input.ownerId);
    data.ownerId = input.ownerId || null;
  }

  if (input.domain !== undefined) {
    const domain = normalizeDomain(input.domain);
    if (input.domain.trim() && !domain) {
      throw badRequest(`"${input.domain}" is not a domain. Try something like "stripe.com".`);
    }
    await assertDomainFree(ctx, domain, id);
    data.domain = domain;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.fields) await applyValues(tx, ctx.teamId, 'COMPANY', id, input.fields);
    return tx.crmCompany.update({ where: { id }, data, select: { id: true, name: true, domain: true } });
  });

  if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
    await notifyOwnerAssigned(ctx, { ownerId: input.ownerId, kind: 'company', id, name: updated.name });
  }

  return updated;
}

export async function deleteCompany(ctx: CrmContext, id: string) {
  await ownedCompany(ctx, id);

  const deleted = await prisma.$transaction(async (tx) => {
    const targets = await targetsOf({ OR: [{ companyId: id }, { deal: { companyId: id } }] }, tx);
    const company = await tx.crmCompany.delete({ where: { id }, select: { name: true } });
    return { targets, name: company.name };
  });

  await recomputeAfterDelete(deleted.targets);
  return { id, name: deleted.name };
}

export async function setPrimaryContact(ctx: CrmContext, companyId: string, contactId: string | null) {
  await ownedCompany(ctx, companyId);

  if (contactId) {
    const contact = await prisma.crmContact.findFirst({
      where: { id: contactId, teamId: ctx.teamId },
      select: { companyId: true },
    });
    if (!contact) throw notFound('That contact does not exist.');
    if (contact.companyId !== companyId) throw badRequest('That contact does not work at this company.');
  }

  return prisma.crmCompany.update({
    where: { id: companyId },
    data: { primaryContactId: contactId },
    select: { id: true, primaryContactId: true },
  });
}

// Team members assigned to a client

export async function listCompanyMembers(ctx: CrmContext, companyId: string) {
  await ownedCompany(ctx, companyId);
  const members = await prisma.crmCompanyMember.findMany({
    where: { companyId },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: { select: USER_SELECT },
      assignedBy: { select: { id: true, name: true } },
    },
  });
  return members.map((member) => ({
    assignmentId: member.id,
    role: member.role,
    assignedAt: member.createdAt.toISOString(),
    assignedBy: member.assignedBy,
    ...member.user,
  }));
}

export async function assignCompanyMember(
  ctx: CrmContext,
  companyId: string,
  input: { userId: string; role?: string | null }
) {
  const company = await ownedCompany(ctx, companyId);
  await requireTeamUser(ctx.teamId, input.userId);

  const role = blankToNull(input.role ?? null);
  const existing = await prisma.crmCompanyMember.findUnique({
    where: { companyId_userId: { companyId, userId: input.userId } },
    select: { id: true },
  });

  await prisma.crmCompanyMember.upsert({
    where: { companyId_userId: { companyId, userId: input.userId } },
    create: { companyId, userId: input.userId, role, assignedById: ctx.userId },
    update: input.role === undefined ? {} : { role },
  });

  if (!existing) {
    await notifyClientAssigned(ctx, { userId: input.userId, companyId, companyName: company.name, role });
  }

  return listCompanyMembers(ctx, companyId);
}

export async function unassignCompanyMember(ctx: CrmContext, companyId: string, userId: string) {
  await ownedCompany(ctx, companyId);
  const { count } = await prisma.crmCompanyMember.deleteMany({ where: { companyId, userId } });
  if (count === 0) throw notFound('That person is not assigned to this client.');
  return listCompanyMembers(ctx, companyId);
}

// Bulk

export async function bulkCompanies(
  ctx: CrmContext,
  input:
    | { action: 'owner'; ids: string[]; ownerId: string | null }
    | { action: 'delete'; ids: string[] }
    | { action: 'assign'; ids: string[]; userId: string }
): Promise<BulkResult> {
  const ids = unique(input.ids);

  if (input.action === 'delete') return runBulk(ids, (id) => deleteCompany(ctx, id));

  if (input.action === 'assign') {
    return runBulk(ids, (id) => assignCompanyMember(ctx, id, { userId: input.userId }));
  }

  const ownerId = input.ownerId || null;
  await requireTeamUser(ctx.teamId, ownerId);
  const { count } = await prisma.crmCompany.updateMany({
    where: { id: { in: ids }, teamId: ctx.teamId },
    data: { ownerId },
  });
  if (ownerId && ownerId !== ctx.userId && count > 0) {
    await notifyOwnerAssigned(ctx, {
      ownerId,
      kind: 'company',
      id: ids[0],
      name: count === 1 ? 'a client' : `${count} clients`,
    });
  }
  return { requested: ids.length, succeeded: count, failed: ids.length - count, message: null };
}
