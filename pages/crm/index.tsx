import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { AlertTriangle, Briefcase, Building2, CalendarDays, CheckSquare, Phone, Square } from 'lucide-react';
import { format, isToday, isTomorrow } from 'date-fns';
import { cn } from '@/lib/utils';
import { CrmShell } from '@/components/crm/crm-shell';
import { useOpenRecord } from '@/components/crm/navigation';
import { CompanyMark, OwnerCell, PersonAvatar, RelativeTime, Spinner, StageBadge } from '@/components/crm/primitives';
import { ActivityIcon } from '@/components/crm/timeline';
import { useCrmMutation, useCrmQuery, type Person } from '@/components/crm/api';
import {
  ACTIVITY_LABELS,
  STAGE_COLORS,
  contactName,
  dealStageLabel,
  formatMoney,
  formatMoneyCompact,
  type ActivityType,
  type DealStage,
} from '@/lib/crm/constants';

type TaskRow = {
  id: string;
  subject: string | null;
  dueAt: string | null;
  company: { id: string; name: string } | null;
  deal: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null } | null;
  assignee: Person | null;
};

type AgendaItem = {
  id: string;
  kind: 'task' | 'meeting' | 'call' | 'close';
  title: string;
  at: string;
  person: Person | null;
  about: { kind: 'company' | 'contact' | 'deal'; id: string; name: string } | null;
  amountCents?: number | null;
  currency?: string;
  stage?: DealStage;
};

type Summary = {
  scope: 'me' | 'everyone';
  reportingCurrency: string;
  currencyInferred: boolean;
  unconverted: { count: number; currencies: string[] };
  slippedDeals: number;
  agenda: AgendaItem[];
  agendaDays: number;
  undatedTasks: TaskRow[];
  totals: { companies: number; contacts: number; deals: number };
  pipeline: { stages: { stage: DealStage; count: number; valueCents: number }[]; totalCents: number; totalDeals: number };
  wonThisMonth: { count: number; valueCents: number };
  wonPrevMonth: { count: number; valueCents: number };
  performance: { windowDays: number; wins: number; losses: number; winRate: number | null; avgDealCents: number | null; avgCycleDays: number | null };
  trend: { month: string; won: number; created: number }[];
  closingThisMonthTotal: { count: number; valueCents: number };
  biggestOpen: {
    id: string;
    name: string;
    stage: DealStage;
    currency: string;
    amountCents: number | null;
    baseAmountCents: number | null;
    expectedCloseDate: string | null;
    stageChangedAt: string;
    company: { id: string; name: string };
    owner: Person;
  }[];
  overdueTasks: TaskRow[];
  myClients: { id: string; name: string; domain: string | null; lastActivityAt: string | null; openDeals: number; relation: string }[];
  recentActivity: {
    id: string;
    type: ActivityType;
    subject: string | null;
    createdAt: string;
    meta: Record<string, unknown> | null;
    createdBy: Person;
    company: { id: string; name: string } | null;
    deal: { id: string; name: string } | null;
  }[];
};

function Card({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('min-w-0 rounded-lg border bg-white dark:border-[#222] dark:bg-[#111]', className)}>
      <header className="border-b px-4 py-3 dark:border-[#222]">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Kpi({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white px-4 py-3 dark:border-[#222] dark:bg-[#111]">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

function change(current: number, previous: number): string {
  if (previous === 0) return current === 0 ? 'Same as last month' : 'Up from nothing last month';
  const pct = Math.round(((current - previous) / previous) * 100);
  return pct === 0 ? 'Same as last month' : `${pct > 0 ? '+' : ''}${pct}% vs last month`;
}

function TaskList({ tasks, overdue }: { tasks: TaskRow[]; overdue?: boolean }) {
  const openRecord = useOpenRecord();
  const complete = useCrmMutation<string>((call, id) => call(`/activities/${id}`, 'PATCH', { completed: true }), { success: 'Task done.' });

  return (
    <ul className="divide-y dark:divide-[#1f1f1f]">
      {tasks.map((task) => {
        const about = task.deal
          ? { kind: 'deal' as const, id: task.deal.id, name: task.deal.name }
          : task.contact
            ? { kind: 'contact' as const, id: task.contact.id, name: contactName(task.contact) }
            : task.company
              ? { kind: 'company' as const, id: task.company.id, name: task.company.name }
              : null;
        return (
          <li key={task.id} className="flex items-start gap-2 py-2">
            <button type="button" aria-label="Mark as done" disabled={complete.isPending} onClick={() => complete.mutate(task.id)} className="mt-0.5 text-muted-foreground hover:text-foreground">
              {complete.isPending && complete.variables === task.id ? <CheckSquare className="size-4" /> : <Square className="size-4" />}
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm">{task.subject}</div>
              {about ? (
                <button type="button" className="truncate text-xs text-blue-600 hover:underline dark:text-blue-400" onClick={() => openRecord({ kind: about.kind, id: about.id })}>
                  {about.name}
                </button>
              ) : null}
            </div>
            {task.assignee ? <PersonAvatar person={task.assignee} size="xs" className="mt-0.5" /> : null}
            <span className={cn('whitespace-nowrap text-xs', overdue ? 'text-red-500' : 'text-muted-foreground')}>
              <RelativeTime date={task.dueAt} empty="No date" />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export default function CrmOverviewPage() {
  const router = useRouter();
  const openRecord = useOpenRecord();
  const scope = router.query.scope === 'everyone' ? 'everyone' : 'me';
  const query = useCrmQuery<Summary>(['dashboard', scope], `/dashboard?scope=${scope}`, { keepPrevious: true });
  const summary = query.data;

  const setScope = (next: 'me' | 'everyone') => {
    const nextQuery = { ...router.query };
    if (next === 'me') delete nextQuery.scope;
    else nextQuery.scope = next;
    void router.replace({ pathname: router.pathname, query: nextQuery }, undefined, { shallow: true });
  };

  const scopeToggle = (
    <div className="flex rounded-md border p-0.5 text-sm dark:border-[#262626]">
      {(['me', 'everyone'] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => setScope(value)}
          className={cn('rounded px-2.5 py-1', scope === value ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'text-muted-foreground hover:text-foreground')}
        >
          {value === 'me' ? 'Mine' : 'Everyone'}
        </button>
      ))}
    </div>
  );

  return (
    <CrmShell title="CRM overview" actions={scopeToggle}>
      {!summary ? (
        <div className="flex justify-center py-16"><Spinner className="size-5" /></div>
      ) : (
        <Dashboard summary={summary} onOpenDeal={(id) => openRecord({ kind: 'deal', id })} onOpenCompany={(id) => openRecord({ kind: 'company', id })} />
      )}
    </CrmShell>
  );
}

function Dashboard({ summary, onOpenDeal, onOpenCompany }: { summary: Summary; onOpenDeal: (id: string) => void; onOpenCompany: (id: string) => void }) {
  const currency = summary.reportingCurrency;
  const { pipeline, performance } = summary;
  const maxStage = Math.max(1, ...pipeline.stages.map((stage) => stage.valueCents));
  const maxTrend = Math.max(1, ...summary.trend.map((month) => Math.max(month.won, month.created)));
  const largest = summary.biggestOpen[0]?.baseAmountCents ?? 0;

  return (
    <div className="space-y-5">
      {summary.unconverted.count > 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {summary.unconverted.count} deal{summary.unconverted.count === 1 ? ' is' : 's are'} in {summary.unconverted.currencies.join(', ')} and not counted in these {currency} totals, because there is no exchange rate.{' '}
            <Link href="/crm/settings" className="font-medium underline">
              Set a rate or change the reporting currency
            </Link>
            .
          </span>
        </div>
      ) : summary.currencyInferred && summary.totals.deals > 0 ? (
        <p className="text-xs text-muted-foreground">
          Reporting in {currency}, the currency most of your deals use. <Link href="/crm/settings" className="underline">Change it in settings</Link>.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Open pipeline" value={formatMoneyCompact(pipeline.totalCents, currency)} hint={`${pipeline.totalDeals} open deals${summary.slippedDeals ? ` · ${summary.slippedDeals} past close date` : ''}`} />
        <Kpi label="Won this month" value={formatMoneyCompact(summary.wonThisMonth.valueCents, currency)} hint={`${summary.wonThisMonth.count} deals · ${change(summary.wonThisMonth.valueCents, summary.wonPrevMonth.valueCents)}`} />
        <Kpi label="Closing this month" value={formatMoneyCompact(summary.closingThisMonthTotal.valueCents, currency)} hint={`${summary.closingThisMonthTotal.count} deals expected`} />
        <Kpi
          label={`Win rate, last ${performance.windowDays} days`}
          value={performance.winRate === null ? '—' : `${Math.round(performance.winRate * 100)}%`}
          hint={
            performance.wins + performance.losses === 0
              ? 'No deals decided yet'
              : `${performance.wins} won, ${performance.losses} lost${performance.avgCycleDays !== null ? ` · ${performance.avgCycleDays}-day cycle` : ''}`
          }
        />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card title="Pipeline by stage" description="Open deals, valued in the reporting currency">
          <div className="space-y-3">
            {pipeline.stages.map((stage) => (
              <div key={stage.stage}>
                <div className="mb-1 flex justify-between text-xs">
                  <StageBadge stage={stage.stage} className="text-xs" />
                  <span className="tabular-nums text-muted-foreground">
                    {stage.count} · {formatMoneyCompact(stage.valueCents, currency)}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-[#1c1c1c]">
                  <div className="h-full rounded-full" style={{ width: `${(stage.valueCents / maxStage) * 100}%`, backgroundColor: STAGE_COLORS[stage.stage] }} />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Six-month trend" description="Value of deals opened and won each month">
          <div className="flex h-40 items-end gap-3">
            {summary.trend.map((month) => (
              <div key={month.month} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-32 w-full items-end justify-center gap-1">
                  <div className="w-1/3 rounded-t bg-neutral-300 dark:bg-[#333]" style={{ height: `${(month.created / maxTrend) * 100}%` }} title={`Opened ${formatMoney(month.created, currency)}`} />
                  <div className="w-1/3 rounded-t bg-green-500" style={{ height: `${(month.won / maxTrend) * 100}%` }} title={`Won ${formatMoney(month.won, currency)}`} />
                </div>
                <span className="text-[11px] text-muted-foreground">{month.month}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-neutral-300 dark:bg-[#333]" />Opened</span>
            <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-green-500" />Won</span>
            {performance.avgDealCents !== null ? <span className="ml-auto">Average win {formatMoney(performance.avgDealCents, currency)}</span> : null}
          </div>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Card title="Deals in progress" description="The largest open deals, and how long each has sat in its stage" className="xl:col-span-2">
          {summary.biggestOpen.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Nothing open. Time to fill the pipeline.</p>
          ) : (
            <ul className="divide-y dark:divide-[#1f1f1f]">
              {summary.biggestOpen.map((deal) => (
                <li key={deal.id}>
                  <button type="button" onClick={() => onOpenDeal(deal.id)} className="grid w-full grid-cols-[1fr_auto] items-center gap-3 py-2 text-left hover:bg-accent/40 sm:grid-cols-[1fr_150px_120px_90px]">
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{deal.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {deal.company.name} · in stage <RelativeTime date={deal.stageChangedAt} />
                      </span>
                    </span>
                    <span className="hidden sm:block"><StageBadge stage={deal.stage} className="text-xs" /></span>
                    <span className="hidden h-1.5 overflow-hidden rounded-full bg-neutral-100 sm:block dark:bg-[#1c1c1c]">
                      <span className="block h-full" style={{ width: `${largest > 0 ? ((deal.baseAmountCents ?? 0) / largest) * 100 : 0}%`, backgroundColor: STAGE_COLORS[deal.stage] }} />
                    </span>
                    <span className="text-right text-sm tabular-nums">{formatMoneyCompact(deal.amountCents, deal.currency)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="My clients" description="Accounts you own or are assigned to">
          {summary.myClients.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">You are not on any client yet.</p>
          ) : (
            <ul className="divide-y dark:divide-[#1f1f1f]">
              {summary.myClients.map((client) => (
                <li key={client.id}>
                  <button type="button" onClick={() => onOpenCompany(client.id)} className="flex w-full items-center gap-2 py-2 text-left hover:bg-accent/40">
                    <CompanyMark name={client.name} domain={client.domain} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{client.name}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {client.relation} · {client.openDeals} open deals
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground"><RelativeTime date={client.lastActivityAt} empty="—" /></span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Card
          title="Upcoming"
          description={`The next ${summary.agendaDays} days: tasks, scheduled calls and meetings, and expected closes${summary.scope === 'me' ? ' that are yours' : ' across the team'}`}
          className="xl:col-span-3"
        >
          <Agenda items={summary.agenda} undated={summary.undatedTasks} onOpenDeal={onOpenDeal} />
        </Card>
        <Card
          title="Overdue tasks"
          description={summary.overdueTasks.length ? `${summary.overdueTasks.length} past due` : summary.scope === 'me' ? 'Every task assigned to you is done or still to come' : 'Nothing overdue across the team'}
          className="xl:col-span-2"
        >
          {summary.overdueTasks.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">Nothing overdue. Good.</p> : <TaskList tasks={summary.overdueTasks} overdue />}
        </Card>
      </div>

      <Card title={summary.scope === 'me' ? 'Your recent activity' : 'Recent activity'} description={summary.scope === 'me' ? 'Every note, task and stage change you have logged' : 'Every note, task and stage change across the team'}>
        {summary.recentActivity.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-muted-foreground">
            <Building2 className="size-5" />
            Nothing has happened yet. Open a company and log a note, call or task.
          </div>
        ) : (
          <ul className="divide-y dark:divide-[#1f1f1f]">
            {summary.recentActivity.map((entry) => {
              const meta = entry.meta as { from?: DealStage; to?: DealStage } | null;
              const label =
                entry.type === 'STAGE_CHANGE' && meta?.from && meta?.to
                  ? `${dealStageLabel(meta.from)} → ${dealStageLabel(meta.to)}`
                  : (entry.subject ?? ACTIVITY_LABELS[entry.type]);
              return (
                <li key={entry.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 py-2 sm:grid-cols-[auto_1fr_180px_140px_90px]">
                  <ActivityIcon type={entry.type} className="text-muted-foreground" />
                  <span className="truncate text-sm">{label}</span>
                  <span className="hidden truncate text-sm sm:block">
                    {entry.deal ? (
                      <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => onOpenDeal(entry.deal!.id)}>{entry.deal.name}</button>
                    ) : entry.company ? (
                      <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => onOpenCompany(entry.company!.id)}>{entry.company.name}</button>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </span>
                  <span className="hidden text-sm sm:block"><OwnerCell owner={entry.createdBy} /></span>
                  <span className="text-right text-xs text-muted-foreground"><RelativeTime date={entry.createdAt} /></span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <p className="text-xs text-muted-foreground">
        {summary.totals.companies} companies · {summary.totals.contacts} contacts · {summary.totals.deals} deals in this team
      </p>
    </div>
  );
}

const AGENDA_ICONS = { task: CheckSquare, meeting: CalendarDays, call: Phone, close: Briefcase } as const;
const AGENDA_LABELS = { task: 'Task', meeting: 'Meeting', call: 'Call', close: 'Expected close' } as const;

function dayLabel(iso: string) {
  const date = new Date(iso);
  if (isToday(date)) return 'Today';
  if (isTomorrow(date)) return 'Tomorrow';
  return format(date, 'EEEE, MMM d');
}

function Agenda({ items, undated, onOpenDeal }: { items: AgendaItem[]; undated: TaskRow[]; onOpenDeal: (id: string) => void }) {
  const openRecord = useOpenRecord();
  const complete = useCrmMutation<string>((call, id) => call(`/activities/${id}`, 'PATCH', { completed: true }), { success: 'Task done.' });

  if (items.length === 0 && undated.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-muted-foreground">
        Nothing scheduled. Add a task, or schedule a call or meeting from the Activity tab of any record.
      </p>
    );
  }

  const days: { label: string; items: AgendaItem[] }[] = [];
  for (const item of items) {
    const label = dayLabel(item.at);
    const last = days[days.length - 1];
    if (last && last.label === label) last.items.push(item);
    else days.push({ label, items: [item] });
  }

  return (
    <div className="space-y-4">
      {days.map((day) => (
        <div key={day.label}>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">{day.label}</div>
          <ul className="divide-y dark:divide-[#1f1f1f]">
            {day.items.map((item) => {
              const Icon = AGENDA_ICONS[item.kind];
              const hasTime = item.kind === 'meeting' || item.kind === 'call';
              return (
                <li key={`${item.kind}:${item.id}`} className="flex items-center gap-3 py-2">
                  {item.kind === 'task' ? (
                    <button type="button" aria-label="Mark as done" disabled={complete.isPending} onClick={() => complete.mutate(item.id)} className="text-muted-foreground hover:text-foreground">
                      <Square className="size-4" />
                    </button>
                  ) : (
                    <Icon className={cn('size-4', item.kind === 'close' ? 'text-green-600' : 'text-blue-600')} />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{item.title}</div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                      <span>
                        {AGENDA_LABELS[item.kind]}
                        {hasTime ? ` · ${format(new Date(item.at), 'h:mm a')}` : ''}
                      </span>
                      {item.about ? (
                        <button
                          type="button"
                          className="truncate text-blue-600 hover:underline dark:text-blue-400"
                          onClick={() => (item.kind === 'close' ? onOpenDeal(item.id) : openRecord({ kind: item.about!.kind, id: item.about!.id }))}
                        >
                          {item.about.name}
                        </button>
                      ) : null}
                      {item.stage ? <StageBadge stage={item.stage} className="text-xs" /> : null}
                    </div>
                  </div>
                  {item.kind === 'close' && item.amountCents !== undefined ? (
                    <span className="text-sm tabular-nums">{formatMoneyCompact(item.amountCents ?? null, item.currency ?? 'USD')}</span>
                  ) : null}
                  {item.person ? <PersonAvatar person={item.person} size="xs" /> : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {undated.length > 0 ? (
        <div>
          <div className="mb-1 text-xs font-semibold text-muted-foreground">No due date</div>
          <TaskList tasks={undated} />
        </div>
      ) : null}
    </div>
  );
}
