import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { contactName, dealStageLabel } from './constants';
import { createCompany } from './companies';
import { createContact } from './contacts';
import { CrmError, type CrmContext } from './http';
import { normalizeDomain, normalizeEmail, toCents } from './values';

export const EXPORT_ENTITIES = ['companies', 'contacts', 'deals'] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

const MAX_EXPORT = 10000;
const MAX_IMPORT = 1000;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  let text = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(header: string[], rows: unknown[][]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
}

function day(date: Date | null): string {
  return date ? date.toISOString().slice(0, 10) : '';
}

export async function exportCsv(ctx: CrmContext, entity: ExportEntity): Promise<string> {
  const team = { teamId: ctx.teamId };

  if (entity === 'companies') {
    const rows = await prisma.crmCompany.findMany({
      where: team,
      orderBy: { name: 'asc' },
      take: MAX_EXPORT,
      select: {
        name: true, domain: true, website: true, industry: true, phone: true, email: true, city: true, stateCode: true, country: true,
        linkedinUrl: true, description: true, createdAt: true, lastActivityAt: true,
        owner: { select: { name: true, email: true } },
        members: { select: { role: true, user: { select: { name: true } } } },
        _count: { select: { contacts: true, deals: true } },
      },
    });
    return toCsv(
      ['Name', 'Domain', 'Website', 'Industry', 'Phone', 'Email', 'City', 'State', 'Country', 'LinkedIn', 'Description', 'Owner', 'Owner email', 'Assigned team', 'Contacts', 'Deals', 'Created', 'Last activity'],
      rows.map((r) => [
        r.name, r.domain, r.website, r.industry, r.phone, r.email, r.city, r.stateCode, r.country, r.linkedinUrl, r.description,
        r.owner?.name, r.owner?.email, r.members.map((m) => (m.role ? `${m.user.name} (${m.role})` : m.user.name)).join('; '),
        r._count.contacts, r._count.deals, day(r.createdAt), day(r.lastActivityAt),
      ])
    );
  }

  if (entity === 'contacts') {
    const rows = await prisma.crmContact.findMany({
      where: team,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      take: MAX_EXPORT,
      select: {
        firstName: true, lastName: true, email: true, phone: true, title: true, linkedinUrl: true, createdAt: true, lastActivityAt: true,
        company: { select: { name: true, domain: true } },
        owner: { select: { name: true, email: true } },
      },
    });
    return toCsv(
      ['First name', 'Last name', 'Email', 'Phone', 'Title', 'Company', 'Company domain', 'LinkedIn', 'Owner', 'Owner email', 'Created', 'Last activity'],
      rows.map((r) => [r.firstName, r.lastName, r.email, r.phone, r.title, r.company?.name, r.company?.domain, r.linkedinUrl, r.owner?.name, r.owner?.email, day(r.createdAt), day(r.lastActivityAt)])
    );
  }

  const rows = await prisma.crmDeal.findMany({
    where: team,
    orderBy: { createdAt: 'desc' },
    take: MAX_EXPORT,
    select: {
      name: true, stage: true, amount: true, currency: true, expectedCloseDate: true, closedAt: true, closedReason: true, createdAt: true,
      company: { select: { name: true } },
      owner: { select: { name: true, email: true } },
      contacts: { select: { role: true, contact: { select: { firstName: true, lastName: true } } } },
    },
  });
  return toCsv(
    ['Deal', 'Company', 'Stage', 'Amount', 'Currency', 'Expected close', 'Closed', 'Closed reason', 'Owner', 'Owner email', 'People', 'Created'],
    rows.map((r) => {
      const cents = toCents(r.amount);
      return [
        r.name, r.company.name, dealStageLabel(r.stage), cents === null ? '' : (cents / 100).toFixed(2), r.currency, day(r.expectedCloseDate), day(r.closedAt), r.closedReason,
        r.owner.name, r.owner.email, r.contacts.map((c) => (c.role ? `${contactName(c.contact)} (${c.role})` : contactName(c.contact))).join('; '), day(r.createdAt),
      ];
    })
  );
}

export const importInput = z.object({
  entity: z.enum(['companies', 'contacts']),
  rows: z.array(z.record(z.string(), z.string())).min(1, 'The file has no rows.').max(MAX_IMPORT, `Import at most ${MAX_IMPORT} rows at a time.`),
});

function pick(row: Record<string, string>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const key = keys.find((k) => k.trim().toLowerCase() === name);
    if (key && row[key]?.trim()) return row[key].trim();
  }
  return '';
}

export async function importRows(ctx: CrmContext, input: z.infer<typeof importInput>) {
  const members = await prisma.teamMember.findMany({
    where: { teamId: ctx.teamId, role: { not: 'CLIENT' } },
    select: { user: { select: { id: true, email: true } } },
  });
  const ownerByEmail = new Map(members.map((m) => [m.user.email.toLowerCase(), m.user.id] as [string, string]));

  let created = 0;
  let skipped = 0;
  const errors: { row: number; message: string }[] = [];

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const ownerEmail = pick(row, 'owner email', 'owner');
    const ownerId = ownerEmail ? (ownerByEmail.get(ownerEmail.toLowerCase()) ?? null) : ctx.userId;

    try {
      if (input.entity === 'companies') {
        const name = pick(row, 'name', 'company', 'company name');
        if (!name) {
          skipped += 1;
          continue;
        }
        const company = await createCompany(ctx, {
          name,
          domain: normalizeDomain(pick(row, 'domain', 'website', 'url')) ?? undefined,
          industry: pick(row, 'industry') || undefined,
          ownerId: null,
        });
        const extra = {
          ownerId,
          phone: pick(row, 'phone') || null,
          email: pick(row, 'email') || null,
          city: pick(row, 'city') || null,
          stateCode: pick(row, 'state', 'region') || null,
          country: pick(row, 'country') || null,
          linkedinUrl: pick(row, 'linkedin') || null,
          description: pick(row, 'description') || null,
        };
        if (Object.values(extra).some(Boolean)) await prisma.crmCompany.update({ where: { id: company.id }, data: extra });
      } else {
        const firstName = pick(row, 'first name', 'firstname', 'first');
        const fullName = pick(row, 'name', 'full name');
        const [first, ...rest] = (firstName || fullName).split(/\s+/);
        if (!first) {
          skipped += 1;
          continue;
        }

        const companyText = pick(row, 'company', 'company name', 'company domain');
        let companyId: string | null | undefined;
        if (companyText) {
          const domain = normalizeDomain(companyText);
          const company = await prisma.crmCompany.findFirst({
            where: { teamId: ctx.teamId, OR: [{ name: { equals: companyText, mode: 'insensitive' } }, ...(domain ? [{ domain }] : [])] },
            select: { id: true },
          });
          if (company) companyId = company.id;
          else {
            companyId = (await createCompany(ctx, { name: companyText, domain: domain ?? undefined, ownerId: null })).id;
            if (ownerId) await prisma.crmCompany.update({ where: { id: companyId }, data: { ownerId } });
          }
        }

        const email = normalizeEmail(pick(row, 'email', 'e-mail', 'work email'));
        if (email && (await prisma.crmContact.findFirst({ where: { teamId: ctx.teamId, email }, select: { id: true } }))) {
          skipped += 1;
          continue;
        }

        const contact = await createContact(ctx, {
          firstName: first,
          lastName: pick(row, 'last name', 'lastname', 'last') || rest.join(' ') || undefined,
          email: email ?? '',
          phone: pick(row, 'phone', 'mobile') || undefined,
          title: pick(row, 'title', 'job title', 'role') || undefined,
          companyId,
          ownerId: null,
        });
        if (ownerId) await prisma.crmContact.update({ where: { id: contact.id }, data: { ownerId } });
      }
      created += 1;
    } catch (error) {
      errors.push({ row: index + 2, message: error instanceof CrmError ? error.message : 'Could not import this row.' });
    }
  }

  return { created, skipped, failed: errors.length, errors: errors.slice(0, 20) };
}
