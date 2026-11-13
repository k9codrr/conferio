import { prisma } from '@/lib/prisma';
import { contactName, type RecordKind } from './constants';
import type { CrmContext } from './http';

export type SearchHit = {
  kind: RecordKind;
  id: string;
  label: string;
  detail: string | null;
};

const PER_KIND = 5;

export async function quickSearch(ctx: CrmContext, q: string): Promise<{ hits: SearchHit[] }> {
  const term = q.trim();
  if (term.length < 2) return { hits: [] };

  const team = { teamId: ctx.teamId };
  const like = { contains: term, mode: 'insensitive' as const };

  const [companies, contacts, deals] = await Promise.all([
    prisma.crmCompany.findMany({
      where: { ...team, OR: [{ name: like }, { domain: like }] },
      take: PER_KIND,
      orderBy: { name: 'asc' },
      select: { id: true, name: true, domain: true },
    }),
    prisma.crmContact.findMany({
      where: { ...team, OR: [{ firstName: like }, { lastName: like }, { email: like }] },
      take: PER_KIND,
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, email: true, company: { select: { name: true } } },
    }),
    prisma.crmDeal.findMany({
      where: { ...team, name: like },
      take: PER_KIND,
      orderBy: [{ stage: 'asc' }, { name: 'asc' }],
      select: { id: true, name: true, company: { select: { name: true } } },
    }),
  ]);

  return {
    hits: [
      ...companies.map((company): SearchHit => ({
        kind: 'company',
        id: company.id,
        label: company.name,
        detail: company.domain,
      })),
      ...contacts.map((contact): SearchHit => ({
        kind: 'contact',
        id: contact.id,
        label: contactName(contact) || (contact.email ?? 'Unnamed'),
        detail: contact.company?.name ?? contact.email,
      })),
      ...deals.map((deal): SearchHit => ({
        kind: 'deal',
        id: deal.id,
        label: deal.name,
        detail: deal.company.name,
      })),
    ],
  };
}

export async function crmTeamMembers(ctx: CrmContext) {
  const members = await prisma.teamMember.findMany({
    where: { teamId: ctx.teamId, role: { not: 'CLIENT' } },
    orderBy: { createdAt: 'asc' },
    select: { role: true, user: { select: { id: true, name: true, email: true, image: true } } },
  });

  return {
    me: { id: ctx.userId, role: ctx.role, canManage: ctx.canManage },
    team: { id: ctx.teamId, slug: ctx.teamSlug, name: ctx.teamName },
    members: members.map((member) => ({ ...member.user, role: member.role })),
  };
}
