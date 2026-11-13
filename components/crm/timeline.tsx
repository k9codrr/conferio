import React, { useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import {
  ArrowRightLeft,
  CalendarDays,
  CheckSquare,
  Mail,
  MessageSquareText,
  Phone,
  Sparkles,
  Square,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  ACTIVITY_LABELS,
  COMPOSABLE_ACTIVITY_TYPES,
  contactName,
  dealStageLabel,
  type ActivityType,
  type DealStage,
  type TimelineFilter,
} from '@/lib/crm/constants';
import { toQuery, useCrmApi, useCrmMembers, useCrmMutation, type ActivityEntry } from './api';
import { useOpenRecord } from './navigation';
import { FieldLabel, MemberSelect, PersonAvatar, RelativeTime, Spinner } from './primitives';

export type TimelineAnchor = { companyId?: string; contactId?: string; dealId?: string };

const ICONS: Record<ActivityType, React.ComponentType<{ className?: string }>> = {
  NOTE: MessageSquareText,
  CALL: Phone,
  EMAIL: Mail,
  MEETING: CalendarDays,
  TASK: CheckSquare,
  STAGE_CHANGE: ArrowRightLeft,
  ENRICHMENT: Sparkles,
};

const FILTERS: { value: TimelineFilter; label: string; count: keyof TimelineCounts }[] = [
  { value: 'all', label: 'All', count: 'all' },
  { value: 'notes', label: 'Notes', count: 'notes' },
  { value: 'upcoming', label: 'Upcoming', count: 'upcoming' },
  { value: 'done', label: 'Done', count: 'done' },
  { value: 'email', label: 'Email', count: 'email' },
  { value: 'meetings', label: 'Meetings', count: 'meetings' },
];

type TimelineCounts = { all: number; notes: number; upcoming: number; done: number; email: number; meetings: number };
type TimelinePage = { entries: ActivityEntry[]; nextCursor: string | null; counts: TimelineCounts };

export function ActivityIcon({ type, className }: { type: ActivityType; className?: string }) {
  const Icon = ICONS[type] ?? MessageSquareText;
  return <Icon className={cn('size-3.5', className)} />;
}

export function Timeline({ anchor }: { anchor: TimelineAnchor }) {
  const { slug, ready, call } = useCrmApi();
  const [filter, setFilter] = useState<TimelineFilter>('all');

  const query = useInfiniteQuery<TimelinePage>({
    queryKey: ['crm', slug, 'timeline', anchor, filter],
    enabled: ready,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      call<TimelinePage>(`/activities${toQuery({ ...anchor, filter, cursor: pageParam as string | undefined, limit: 30 })}`),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });

  const counts = query.data?.pages[0]?.counts;
  const entries = query.data?.pages.flatMap((page) => page.entries) ?? [];

  return (
    <div className="space-y-4">
      <ActivityComposer anchor={anchor} />

      <div className="flex flex-wrap gap-1">
        {FILTERS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value)}
            className={cn(
              'rounded-full border px-2.5 py-0.5 text-xs dark:border-[#2a2a2a]',
              filter === option.value ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'hover:bg-accent'
            )}
          >
            {option.label}
            {counts ? <span className="ml-1 opacity-60">{counts[option.count]}</span> : null}
          </button>
        ))}
      </div>

      {query.isPending ? (
        <div className="flex justify-center py-6"><Spinner /></div>
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Nothing logged here yet.</p>
      ) : (
        <ol className="relative space-y-3 border-l pl-5 dark:border-[#2a2a2a]">
          {entries.map((entry) => (
            <TimelineEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      )}

      {query.hasNextPage ? (
        <Button variant="outline" size="sm" className="w-full" disabled={query.isFetchingNextPage} onClick={() => query.fetchNextPage()}>
          {query.isFetchingNextPage ? <Spinner /> : null}
          Load older
        </Button>
      ) : null}
    </div>
  );
}

function TimelineEntry({ entry }: { entry: ActivityEntry }) {
  const openRecord = useOpenRecord();
  const isTask = entry.type === 'TASK';
  const done = Boolean(entry.completedAt);
  const overdue = isTask && !done && entry.dueAt && new Date(entry.dueAt) < new Date();
  const scheduled = (entry.type === 'MEETING' || entry.type === 'CALL') && entry.occurredAt && new Date(entry.occurredAt) > new Date();

  const complete = useCrmMutation<boolean>((call, completed) => call(`/activities/${entry.id}`, 'PATCH', { completed }));
  const remove = useCrmMutation<void>((call) => call(`/activities/${entry.id}`, 'DELETE'), { success: 'Deleted.' });

  const meta = entry.meta as { from?: DealStage; to?: DealStage } | null;
  const title =
    entry.type === 'STAGE_CHANGE' && meta?.from && meta?.to
      ? `${dealStageLabel(meta.from)} → ${dealStageLabel(meta.to)}`
      : (entry.subject ?? ACTIVITY_LABELS[entry.type]);

  return (
    <li className="group relative">
      <span className="absolute -left-[29px] top-0.5 flex size-4 items-center justify-center rounded-full border bg-background dark:border-[#333]">
        <ActivityIcon type={entry.type} className="size-2.5" />
      </span>
      <div className="flex items-start gap-2">
        {isTask ? (
          <button
            type="button"
            aria-label={done ? 'Mark as not done' : 'Mark as done'}
            disabled={complete.isPending}
            onClick={() => complete.mutate(!done)}
            className="mt-0.5 text-muted-foreground hover:text-foreground"
          >
            {done ? <CheckSquare className="size-4 text-green-600" /> : <Square className="size-4" />}
          </button>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className={cn('text-sm font-medium', done && 'text-muted-foreground line-through')}>{title}</span>
            <span className="text-xs text-muted-foreground">
              {ACTIVITY_LABELS[entry.type]} · {entry.createdBy.name} · <RelativeTime date={entry.occurredAt ?? entry.createdAt} />
            </span>
            {scheduled ? (
              <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                Scheduled {format(new Date(entry.occurredAt!), 'MMM d, h:mm a')}
              </span>
            ) : null}
          </div>
          {isTask ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
              {entry.dueAt ? (
                <span className={cn(overdue && 'font-medium text-red-500')}>Due {format(new Date(entry.dueAt), 'MMM d, yyyy')}</span>
              ) : (
                <span>No due date</span>
              )}
              {entry.assignee ? (
                <span className="flex items-center gap-1">
                  <PersonAvatar person={entry.assignee} size="xs" /> {entry.assignee.name}
                </span>
              ) : null}
            </div>
          ) : null}
          {entry.body ? <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.body}</p> : null}
          <div className="mt-1 flex flex-wrap gap-2 text-xs">
            {entry.deal ? (
              <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => openRecord({ kind: 'deal', id: entry.deal!.id })}>
                {entry.deal.name}
              </button>
            ) : null}
            {entry.contact ? (
              <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => openRecord({ kind: 'contact', id: entry.contact!.id })}>
                {contactName(entry.contact)}
              </button>
            ) : null}
          </div>
        </div>
        {entry.type !== 'STAGE_CHANGE' && entry.type !== 'ENRICHMENT' ? (
          <button
            type="button"
            aria-label="Delete"
            disabled={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete this from the timeline?')) remove.mutate();
            }}
            className="rounded p-1 text-muted-foreground opacity-0 hover:bg-accent hover:text-red-500 group-hover:opacity-100"
          >
            <Trash2 className="size-3.5" />
          </button>
        ) : null}
      </div>
    </li>
  );
}

function ActivityComposer({ anchor }: { anchor: TimelineAnchor }) {
  const members = useCrmMembers();
  const [type, setType] = useState<ActivityType>('NOTE');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [dueAt, setDueAt] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | null>(null);
  const [when, setWhen] = useState('');

  const isTask = type === 'TASK';
  const schedulable = type === 'MEETING' || type === 'CALL';

  const create = useCrmMutation<Record<string, unknown>>((call, input) => call('/activities', 'POST', input), {
    success: isTask ? 'Task added.' : 'Logged.',
    onSuccess: () => {
      setSubject('');
      setBody('');
      setDueAt('');
      setAssigneeId(null);
      setWhen('');
    },
  });

  const canSubmit = isTask ? subject.trim() !== '' : subject.trim() !== '' || body.trim() !== '';

  return (
    <form
      className="space-y-2 rounded-lg border p-3 dark:border-[#262626]"
      onSubmit={(event) => {
        event.preventDefault();
        if (!canSubmit) return;
        create.mutate({
          ...anchor,
          type,
          subject: subject.trim() || undefined,
          body: body.trim() || undefined,
          dueAt: isTask && dueAt ? new Date(`${dueAt}T09:00:00`).toISOString() : undefined,
          occurredAt: schedulable && when ? new Date(when).toISOString() : undefined,
          assigneeId: isTask ? (assigneeId ?? members.data?.me.id ?? null) : undefined,
        });
      }}
    >
      <div className="flex flex-wrap gap-1">
        {COMPOSABLE_ACTIVITY_TYPES.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setType(option)}
            className={cn(
              'flex items-center gap-1 rounded-md px-2 py-1 text-xs',
              type === option ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'text-muted-foreground hover:bg-accent'
            )}
          >
            <ActivityIcon type={option} />
            {ACTIVITY_LABELS[option]}
          </button>
        ))}
      </div>

      <Input
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
        placeholder={isTask ? 'What needs doing?' : 'Subject (optional)'}
        className="h-8 text-sm"
      />
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        placeholder={isTask ? 'Details (optional)' : `What happened on the ${ACTIVITY_LABELS[type].toLowerCase()}?`}
        rows={2}
        className="text-sm"
      />

      {schedulable ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>When (leave empty if it already happened)</FieldLabel>
            <Input type="datetime-local" value={when} onChange={(event) => setWhen(event.target.value)} className="h-9 text-sm" />
          </div>
          {when && new Date(when) > new Date() ? (
            <p className="self-end pb-2 text-xs text-muted-foreground">Scheduled: it shows under Upcoming until then.</p>
          ) : null}
        </div>
      ) : null}

      {isTask ? (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <FieldLabel>Due</FieldLabel>
            <Input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className="h-9 text-sm" />
          </div>
          <div>
            <FieldLabel>Assign to</FieldLabel>
            <MemberSelect
              value={assigneeId ?? members.data?.me.id ?? null}
              members={members.data?.members}
              allowUnassigned={false}
              onChange={setAssigneeId}
            />
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" size="sm" disabled={!canSubmit || create.isPending}>
          {create.isPending ? <Spinner className="text-current" /> : null}
          {isTask ? 'Add task' : schedulable && when && new Date(when) > new Date() ? `Schedule ${ACTIVITY_LABELS[type].toLowerCase()}` : `Log ${ACTIVITY_LABELS[type].toLowerCase()}`}
        </Button>
      </div>
    </form>
  );
}
