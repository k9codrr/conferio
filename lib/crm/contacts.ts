import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FACET_ALL, FACET_UNASSIGNED, NO_COMPANY } from './constants';
import { USER_SELECT } from './companies';
import { applyValues, tableColumnsFor, tableValuesFor, valuesFor } from './fields';
import { conflict, notFound, requireTeamUser, type CrmContext } from './http';
import { notifyOwnerAssigned } from './notify';
import type { ContactCreateInput, ContactListInput, ContactUpdateInput } from './schemas';
import { recomputeAfterDelete, targetsOf } from './stamp';
import {
  blankToNull,
  countsByKey,
  domainFromEmail,
  iso,
  normalizeEmail,
  paginate,
  runBulk,
  toCents,
  unique,
  type BulkResult,
} from './values';

const COMPANY_SELECT = { id: true, name: true, domain: true } as const;

const SORTABLE: Record<string, (dir: Prisma.SortOrder) => Prisma.CrmContactOrderByWithRelationInput[]> = {
  name: (dir) => [{ lastName: dir }, { firstName: dir }],
  email: (dir) => [{ email: dir }],
  title: (dir) => [{ title: dir }, { lastName: 'asc' }],
  company: (dir) => [{ company: { name: dir } }, { lastName: 'asc' }],
  createdAt: (dir) => [{ createdAt: dir }],
  owner: (dir) => [{ owner: { name: dir } }, { lastName: 'asc' }],
  lastActivity: (dir) => [{ lastActivityAt: { sort: dir, nulls: 'last' } }],
};

function fullName(contact: { firstName: string; lastName: string | null }) {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}

function searchFilter(q: string): Prisma.CrmContactWhereInput {
  const term = q.trim();
  if (!term) return {};
  return {
    OR: [
      { firstName: { contains: term, mode: 'insensitive' } },
      { lastName: { contains: term, mode: 'insensitive' } },
      { email: { contains: term, mode: 'insensitive' } },
      { company: { name: { contains: term, mode: 'insensitive' } } },
    ],
  };
}

export async function listContacts(ctx: CrmContext, input: ContactListInput) {
  const where: Prisma.CrmContactWhereInput = { teamId: ctx.teamId, ...searchFilter(input.q) };
  if (input.owner !== FACET_ALL) {
    where.ownerId = input.owner === FACET_UNASSIGNED ? null : input.owner === 'me' ? ctx.userId : input.owner;
  }
  if (input.company !== FACET_ALL) where.companyId = input.company === NO_COMPANY ? null : input.company;
  if (input.source !== FACET_ALL) where.source = input.source as Prisma.CrmContactWhereInput['source'];

  const facetWhere = { teamId: ctx.teamId, ...searchFilter(input.q) };
  const { skip, take } = paginate(input.page, input.pageSize);
  const sort = SORTABLE[input.sort];

  const [rows, total, owners, companies, sources, columns] = await Promise.all([
    prisma.crmContact.findMany({
      where,
      skip,
      take,
      orderBy: sort ? sort(input.dir) : [{ createdAt: 'desc' }],
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        title: true,
        imageUrl: true,
        source: true,
        company: { select: COMPANY_SELECT },
        owner: { select: USER_SELECT },
        lastActivityAt: true,
        createdAt: true,
      },
    }),
    prisma.crmContact.count({ where }),
    prisma.crmContact.groupBy({ by: ['ownerId'], where: facetWhere, _count: { _all: true } }),
    prisma.crmContact.groupBy({ by: ['companyId'], where: facetWhere, _count: { _all: true } }),
    prisma.crmContact.groupBy({ by: ['source'], where: facetWhere, _count: { _all: true } }),
    tableColumnsFor(ctx.teamId, 'CONTACT'),
  ]);

  const fields = await tableValuesFor(ctx.teamId, 'CONTACT', rows.map((row) => row.id));

  return {
    rows: rows.map((row) => ({
      ...row,
      lastActivityAt: iso(row.lastActivityAt),
      createdAt: row.createdAt.toISOString(),
      fields: fields.get(row.id) ?? {},
    })),
    total,
    columns,
    facetCounts: {
      owner: countsByKey(owners, 'ownerId', FACET_UNASSIGNED),
      company: countsByKey(companies, 'companyId', NO_COMPANY),
      source: countsByKey(sources, 'source'),
    },
  };
}

export async function getContact(ctx: CrmContext, id: string) {
  const contact = await prisma.crmContact.findFirst({
    where: { id, teamId: ctx.teamId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      title: true,
      linkedinUrl: true,
      twitterUrl: true,
      githubUrl: true,
      imageUrl: true,
      source: true,
      createdAt: true,
      lastActivityAt: true,
      company: { select: { ...COMPANY_SELECT, industry: true, primaryContactId: true } },
      enrichmentStatus: true,
      enrichedAt: true,
      enrichmentError: true,
      _count: { select: { suggestions: { where: { status: 'PROPOSED' } } } },
      owner: { select: USER_SELECT },
      deals: {
        select: {
          role: true,
          deal: {
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
      },
    },
  });

  if (!contact) throw notFound('That contact does not exist in this team.');

  const now = new Date();
  const [byType, nextTask, colleagues] = await Promise.all([
    prisma.crmActivity.groupBy({ by: ['type'], where: { contactId: id }, _count: { _all: true } }),
    prisma.crmActivity.findFirst({
      where: { contactId: id, type: 'TASK', completedAt: null, dueAt: { gte: now } },
      orderBy: { dueAt: 'asc' },
      select: { subject: true, dueAt: true },
    }),
    contact.company
      ? prisma.crmContact.findMany({
          where: { companyId: contact.company.id, id: { not: id } },
          orderBy: { lastActivityAt: { sort: 'desc', nulls: 'last' } },
          take: 4,
          select: { id: true, firstName: true, lastName: true, title: true },
        })
      : Promise.resolve([]),
  ]);

  const counts = countsByKey(byType, 'type');
  const { deals, createdAt, lastActivityAt, company, enrichedAt, _count, ...rest } = contact;

  return {
    ...rest,
    enrichedAt: iso(enrichedAt),
    pendingSuggestions: _count.suggestions,
    company,
    createdAt: createdAt.toISOString(),
    lastActivityAt: iso(lastActivityAt),
    isPrimaryContact: company?.primaryContactId === contact.id,
    fields: await valuesFor(ctx.teamId, 'CONTACT', id),
    relationship: {
      calls: counts.CALL ?? 0,
      emails: counts.EMAIL ?? 0,
      meetings: counts.MEETING ?? 0,
      notes: counts.NOTE ?? 0,
      nextTask: nextTask ? { subject: nextTask.subject, dueAt: iso(nextTask.dueAt) } : null,
      colleagues: colleagues.map((colleague) => ({
        id: colleague.id,
        name: fullName(colleague),
        title: colleague.title,
      })),
    },
    deals: deals.map(({ role, deal }) => ({
      id: deal.id,
      name: deal.name,
      stage: deal.stage,
      currency: deal.currency,
      owner: deal.owner,
      role,
      amountCents: toCents(deal.amount),
      expectedCloseDate: iso(deal.expectedCloseDate),
    })),
  };
}

// A work address names the employer: file the contact under that company, creating it if nobody has yet.
async function companyForEmail(ctx: CrmContext, email: string, ownerId: string | null): Promise<string | null> {
  const domain = domainFromEmail(email);
  if (!domain) return null;

  const existing = await prisma.crmCompany.findFirst({
    where: { teamId: ctx.teamId, domain },
    select: { id: true },
  });
  if (existing) return existing.id;

  const company = await prisma.crmCompany.create({
    data: {
      teamId: ctx.teamId,
      name: domain,
      domain,
      website: `https://${domain}`,
      ownerId,
      createdById: ctx.userId,
      source: 'EMAIL',
    },
    select: { id: true },
  });
  return company.id;
}

async function assertEmailFree(ctx: CrmContext, email: string | null, exceptId?: string) {
  if (!email) return;
  const existing = await prisma.crmContact.findFirst({
    where: {
      teamId: ctx.teamId,
      email: { equals: email, mode: 'insensitive' },
      ...(exceptId ? { id: { not: exceptId } } : {}),
    },
    select: { firstName: true, lastName: true },
  });
  if (existing) throw conflict(`${fullName(existing)} already uses ${email}.`);
}

async function assertCompanyInTeam(ctx: CrmContext, companyId: string | null | undefined) {
  if (!companyId) return;
  const company = await prisma.crmCompany.findFirst({
    where: { id: companyId, teamId: ctx.teamId },
    select: { id: true },
  });
  if (!company) throw notFound('That company does not exist in this team.');
}

export async function createContact(ctx: CrmContext, input: ContactCreateInput) {
  const email = normalizeEmail(input.email ?? '');
  await assertEmailFree(ctx, email);

  const ownerId = input.ownerId ?? null;
  await requireTeamUser(ctx.teamId, ownerId);
  await assertCompanyInTeam(ctx, input.companyId);

  const companyId =
    input.companyId !== undefined ? input.companyId : email ? await companyForEmail(ctx, email, ownerId) : null;

  const contact = await prisma.crmContact.create({
    data: {
      teamId: ctx.teamId,
      firstName: input.firstName.trim(),
      lastName: blankToNull(input.lastName),
      email,
      phone: blankToNull(input.phone),
      title: blankToNull(input.title),
      companyId: companyId ?? null,
      ownerId,
    },
    select: { id: true, firstName: true, lastName: true, companyId: true },
  });

  await notifyOwnerAssigned(ctx, { ownerId, kind: 'contact', id: contact.id, name: fullName(contact) });
  return contact;
}

async function ownedContact(ctx: CrmContext, id: string) {
  const contact = await prisma.crmContact.findFirst({
    where: { id, teamId: ctx.teamId },
    select: { id: true, ownerId: true, firstName: true, lastName: true },
  });
  if (!contact) throw notFound('That contact does not exist in this team.');
  return contact;
}

export async function updateContact(ctx: CrmContext, id: string, input: ContactUpdateInput) {
  const current = await ownedContact(ctx, id);
  const data: Prisma.CrmContactUncheckedUpdateInput = {};

  if (input.firstName !== undefined) data.firstName = input.firstName.trim();
  if (input.lastName !== undefined) data.lastName = blankToNull(input.lastName);
  if (input.email !== undefined) {
    const email = normalizeEmail(input.email);
    await assertEmailFree(ctx, email, id);
    data.email = email;
  }
  if (input.phone !== undefined) data.phone = blankToNull(input.phone);
  if (input.title !== undefined) data.title = blankToNull(input.title);
  if (input.linkedinUrl !== undefined) data.linkedinUrl = blankToNull(input.linkedinUrl);
  if (input.twitterUrl !== undefined) data.twitterUrl = blankToNull(input.twitterUrl);
  if (input.githubUrl !== undefined) data.githubUrl = blankToNull(input.githubUrl);
  if (input.companyId !== undefined) {
    await assertCompanyInTeam(ctx, input.companyId);
    data.companyId = input.companyId || null;
  }
  if (input.ownerId !== undefined) {
    await requireTeamUser(ctx.teamId, input.ownerId);
    data.ownerId = input.ownerId || null;
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (input.fields) await applyValues(tx, ctx.teamId, 'CONTACT', id, input.fields);
    return tx.crmContact.update({ where: { id }, data, select: { id: true, firstName: true, lastName: true } });
  });

  if (input.ownerId !== undefined && input.ownerId !== current.ownerId) {
    await notifyOwnerAssigned(ctx, { ownerId: input.ownerId, kind: 'contact', id, name: fullName(updated) });
  }

  return updated;
}

export async function deleteContact(ctx: CrmContext, id: string) {
  const contact = await ownedContact(ctx, id);

  const targets = await prisma.$transaction(async (tx) => {
    const found = await targetsOf({ contactId: id }, tx);
    await tx.crmContact.delete({ where: { id } });
    return found;
  });

  await recomputeAfterDelete(targets);
  return { id, name: fullName(contact) };
}

export async function bulkContacts(
  ctx: CrmContext,
  input:
    | { action: 'owner'; ids: string[]; ownerId: string | null }
    | { action: 'company'; ids: string[]; companyId: string | null }
    | { action: 'delete'; ids: string[] }
): Promise<BulkResult> {
  const ids = unique(input.ids);

  if (input.action === 'delete') return runBulk(ids, (id) => deleteContact(ctx, id));

  if (input.action === 'company') {
    const companyId = input.companyId || null;
    await assertCompanyInTeam(ctx, companyId);
    const { count } = await prisma.crmContact.updateMany({
      where: { id: { in: ids }, teamId: ctx.teamId },
      data: { companyId },
    });
    return { requested: ids.length, succeeded: count, failed: ids.length - count, message: null };
  }

  const ownerId = input.ownerId || null;
  await requireTeamUser(ctx.teamId, ownerId);
  const { count } = await prisma.crmContact.updateMany({
    where: { id: { in: ids }, teamId: ctx.teamId },
    data: { ownerId },
  });
  if (ownerId && count > 0) {
    await notifyOwnerAssigned(ctx, {
      ownerId,
      kind: 'contact',
      id: ids[0],
      name: count === 1 ? 'a contact' : `${count} contacts`,
    });
  }
  return { requested: ids.length, succeeded: count, failed: ids.length - count, message: null };
}
