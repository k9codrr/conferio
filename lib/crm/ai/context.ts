import { prisma } from '@/lib/prisma';
import {
  ACTIVITY_LABELS,
  contactName,
  dealStageLabel,
  formatMoney,
  type ActivityType,
  type DealStage,
  type RecordKind,
} from '../constants';
import { getCompany } from '../companies';
import { getContact } from '../contacts';
import { getDeal } from '../deals';
import { dashboardSummary } from '../dashboard';
import type { CrmContext } from '../http';

export type Anchor = { kind: RecordKind; id: string } | null;

function day(iso: string | null | undefined): string {
  return iso ? iso.slice(0, 10) : 'none';
}

function line(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return `${label}: ${value}`;
}

async function recentActivity(ctx: CrmContext, where: { companyId?: string; contactId?: string; dealId?: string }) {
  const rows = await prisma.crmActivity.findMany({
    where: { teamId: ctx.teamId, ...where },
    orderBy: [{ occurredAt: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }],
    take: 25,
    select: {
      id: true,
      type: true,
      subject: true,
      body: true,
      occurredAt: true,
      dueAt: true,
      completedAt: true,
      meta: true,
      createdBy: { select: { name: true } },
      assignee: { select: { name: true } },
    },
  });

  if (rows.length === 0) return 'Activity: nothing logged yet.';

  return [
    'Activity, newest first:',
    ...rows.map((row) => {
      const meta = row.meta as { from?: DealStage; to?: DealStage } | null;
      const what =
        row.type === 'STAGE_CHANGE' && meta?.from && meta?.to
          ? `stage ${dealStageLabel(meta.from)} -> ${dealStageLabel(meta.to)}`
          : (row.subject ?? '');
      const task =
        row.type === 'TASK'
          ? ` [task id ${row.id}, ${row.completedAt ? 'done' : 'open'}, due ${day(row.dueAt?.toISOString())}, assigned to ${row.assignee?.name ?? 'nobody'}]`
          : '';
      const body = row.body ? ` | ${row.body.replace(/\s+/g, ' ').slice(0, 400)}` : '';
      return `- ${day(row.occurredAt?.toISOString())} ${ACTIVITY_LABELS[row.type as ActivityType]} by ${row.createdBy.name}: ${what}${task}${body}`;
    }),
  ].join('\n');
}

function fieldLines(fields: { label: string; value: unknown; type: string; options: { id: string; label: string }[] }[]) {
  return fields
    .filter((field) => field.value !== null && field.value !== '')
    .map((field) => {
      const value = field.type === 'SELECT' ? (field.options.find((o) => o.id === field.value)?.label ?? field.value) : field.value;
      return `${field.label}: ${value}`;
    });
}

async function briefText(where: { companyId?: string; contactId?: string; dealId?: string }) {
  const brief = await prisma.crmBrief.findFirst({ where, select: { summary: true, refreshedAt: true } });
  return brief ? `AI brief (from research on ${day(brief.refreshedAt.toISOString())}): ${brief.summary}` : null;
}

export async function recordSnapshot(ctx: CrmContext, anchor: Anchor): Promise<string> {
  if (!anchor) return teamSnapshot(ctx);

  if (anchor.kind === 'company') {
    const c = await getCompany(ctx, anchor.id);
    return [
      `COMPANY (id ${c.id}): ${c.name}`,
      line('Domain', c.domain),
      line('Website', c.website),
      line('Industry', c.industry),
      line('Location', [c.city, c.stateCode, c.country].filter(Boolean).join(', ')),
      line('Phone', c.phone),
      line('Email', c.email),
      line('Description', c.description),
      `Owner: ${c.owner ? `${c.owner.name} (user id ${c.owner.id})` : 'unassigned'}`,
      `Assigned team: ${c.members.length ? c.members.map((m) => `${m.name}${m.role ? ` as ${m.role}` : ''} (user id ${m.id})`).join('; ') : 'nobody'}`,
      ...fieldLines(c.fields),
      `Contacts: ${c.contacts.length ? c.contacts.map((p) => `${contactName(p)}${p.title ? `, ${p.title}` : ''}${p.email ? ` <${p.email}>` : ''} (contact id ${p.id})${p.id === c.primaryContactId ? ' [primary]' : ''}`).join('; ') : 'none'}`,
      `Deals: ${c.deals.length ? c.deals.map((d) => `${d.name} - ${dealStageLabel(d.stage)} - ${formatMoney(d.amountCents, d.currency)} - close ${day(d.expectedCloseDate)} - owner ${d.owner.name} (deal id ${d.id})`).join('; ') : 'none'}`,
      await briefText({ companyId: c.id }),
      await recentActivity(ctx, { companyId: c.id }),
    ]
      .filter(Boolean)
      .join('\n');
  }

  if (anchor.kind === 'contact') {
    const p = await getContact(ctx, anchor.id);
    return [
      `CONTACT (id ${p.id}): ${contactName(p)}`,
      line('Title', p.title),
      line('Email', p.email),
      line('Phone', p.phone),
      line('LinkedIn', p.linkedinUrl),
      `Company: ${p.company ? `${p.company.name} (company id ${p.company.id})` : 'none'}`,
      `Owner: ${p.owner ? `${p.owner.name} (user id ${p.owner.id})` : 'unassigned'}`,
      ...fieldLines(p.fields),
      `Deals: ${p.deals.length ? p.deals.map((d) => `${d.name} - ${dealStageLabel(d.stage)}${d.role ? ` - role ${d.role}` : ''} (deal id ${d.id})`).join('; ') : 'none'}`,
      `Logged: ${p.relationship.calls} calls, ${p.relationship.meetings} meetings, ${p.relationship.emails} emails, ${p.relationship.notes} notes`,
      await briefText({ contactId: p.id }),
      await recentActivity(ctx, { contactId: p.id }),
    ]
      .filter(Boolean)
      .join('\n');
  }

  const d = await getDeal(ctx, anchor.id);
  return [
    `DEAL (id ${d.id}): ${d.name}`,
    `Company: ${d.company.name} (company id ${d.company.id})`,
    `Stage: ${dealStageLabel(d.stage)} since ${day(d.stageChangedAt)}`,
    `Amount: ${formatMoney(d.amountCents, d.currency)}`,
    `Expected close: ${day(d.expectedCloseDate)}`,
    line('Closed', d.closedAt ? `${day(d.closedAt)}${d.closedReason ? ` - reason: ${d.closedReason}` : ''}` : null),
    `Owner: ${d.owner.name} (user id ${d.owner.id})`,
    line('Description', d.description),
    `Client team: ${d.company.members.length ? d.company.members.map((m) => `${m.name}${m.role ? ` as ${m.role}` : ''}`).join('; ') : 'nobody'}`,
    `People on the deal: ${d.contacts.length ? d.contacts.map((p) => `${contactName(p)}${p.role ? ` (${p.role})` : ''}${p.title ? `, ${p.title}` : ''} (contact id ${p.id})`).join('; ') : 'none'}`,
    ...fieldLines(d.fields),
    await briefText({ dealId: d.id }),
    await recentActivity(ctx, { dealId: d.id }),
  ]
    .filter(Boolean)
    .join('\n');
}

async function teamSnapshot(ctx: CrmContext): Promise<string> {
  const s = await dashboardSummary(ctx, 'everyone');
  const money = (cents: number) => formatMoney(cents, s.reportingCurrency);
  return [
    `TEAM PIPELINE for ${ctx.teamName} (reporting currency ${s.reportingCurrency})`,
    `Records: ${s.totals.companies} companies, ${s.totals.contacts} contacts, ${s.totals.deals} deals`,
    `Open pipeline: ${money(s.pipeline.totalCents)} across ${s.pipeline.totalDeals} deals`,
    `By stage: ${s.pipeline.stages.map((st) => `${dealStageLabel(st.stage)} ${st.count} (${money(st.valueCents)})`).join('; ')}`,
    `Won this month: ${s.wonThisMonth.count} (${money(s.wonThisMonth.valueCents)}); last month ${s.wonPrevMonth.count} (${money(s.wonPrevMonth.valueCents)})`,
    `Win rate last ${s.performance.windowDays} days: ${s.performance.winRate === null ? 'n/a' : `${Math.round(s.performance.winRate * 100)}%`} (${s.performance.wins} won, ${s.performance.losses} lost)`,
    s.unconverted.count ? `Not counted in totals for lack of an exchange rate: ${s.unconverted.count} deals in ${s.unconverted.currencies.join(', ')}` : null,
    `Largest open deals: ${s.biggestOpen.map((d) => `${d.name} at ${d.company.name} - ${dealStageLabel(d.stage)} - ${formatMoney(d.amountCents, d.currency)} - close ${day(d.expectedCloseDate)} - owner ${d.owner.name} (deal id ${d.id})`).join('; ') || 'none'}`,
    `Deals past their expected close date: ${s.slippedDeals}`,
    `Overdue tasks (team): ${s.overdueTasks.map((t) => `${t.subject} due ${day(t.dueAt)} for ${t.assignee?.name ?? 'nobody'} (task id ${t.id})`).join('; ') || 'none'}`,
    `Next ${s.agendaDays} days: ${s.agenda.map((a) => `${day(a.at)} ${a.kind}: ${a.title}${a.about ? ` (${a.about.kind} ${a.about.name}, id ${a.about.id})` : ''}`).join('; ') || 'nothing scheduled'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export async function teamRoster(ctx: CrmContext): Promise<string> {
  const members = await prisma.teamMember.findMany({
    where: { teamId: ctx.teamId, role: { not: 'CLIENT' } },
    select: { role: true, user: { select: { id: true, name: true, email: true } } },
  });
  return members.map((m) => `- ${m.user.name} <${m.user.email}> role ${m.role} (user id ${m.user.id})`).join('\n');
}
