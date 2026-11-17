'use client';

// Widget catalog + renderers for the customizable dashboard layouts.
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { format, formatDistanceToNow, isToday, isTomorrow } from 'date-fns';
import {
  Activity, AlarmClock, BarChart3, Bookmark, Briefcase, CalendarDays, CheckSquare, Clock, FileText,
  Film, Gauge, Globe, HardDrive, Mic, NotebookPen, StickyNote, Users,
} from 'lucide-react';
import { ActivityFeedCard } from '@/components/dashboard/ActivityFeedCard';
import { useSSE } from 'hooks/useSSE';
import { cn } from '@/lib/utils';

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  title?: string;
  w: number; // grid columns (1–12)
  h: number; // grid rows (row = 72px)
  config?: Record<string, any>;
}

export type WidgetType =
  | 'stats' | 'agenda' | 'tasks' | 'reminders' | 'docs' | 'notes' | 'files' | 'crm' | 'workload' | 'time'
  | 'clips' | 'notetaker' | 'activity' | 'quick_note' | 'clock' | 'embed' | 'bookmarks';

interface WidgetDef {
  type: WidgetType;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
  /** server data key (lib/dashboard/widgets.ts) */
  server?: string;
}

export const WIDGETS: Record<WidgetType, WidgetDef> = {
  stats:      { type: 'stats', title: 'At a glance', description: 'Open tasks, overdue, meetings, reminders, unread', icon: Gauge, w: 12, h: 2, minW: 4, minH: 2, server: 'stats' },
  agenda:     { type: 'agenda', title: 'Agenda', description: 'Meetings, due tasks and reminders for the next 7 days', icon: CalendarDays, w: 4, h: 5, minW: 3, minH: 3, server: 'agenda' },
  tasks:      { type: 'tasks', title: 'My tasks', description: 'Board tasks assigned to you, by due date', icon: CheckSquare, w: 4, h: 5, minW: 3, minH: 3, server: 'tasks' },
  reminders:  { type: 'reminders', title: 'Reminders & to-dos', description: 'Upcoming reminders and personal to-dos', icon: AlarmClock, w: 4, h: 4, minW: 3, minH: 3, server: 'reminders' },
  docs:       { type: 'docs', title: 'Recent docs', description: 'Latest updated team docs', icon: FileText, w: 4, h: 4, minW: 3, minH: 3, server: 'docs' },
  notes:      { type: 'notes', title: 'My notes', description: 'Pinned and recent notes', icon: NotebookPen, w: 4, h: 4, minW: 3, minH: 3, server: 'notes' },
  files:      { type: 'files', title: 'Recent files', description: 'Latest uploads you can see', icon: HardDrive, w: 4, h: 4, minW: 3, minH: 3, server: 'files' },
  crm:        { type: 'crm', title: 'Deal pipeline', description: 'CRM deals by stage', icon: Briefcase, w: 6, h: 4, minW: 4, minH: 3, server: 'crm' },
  workload:   { type: 'workload', title: 'Team workload', description: 'Open tasks per team member', icon: Users, w: 6, h: 4, minW: 3, minH: 3, server: 'workload' },
  time:       { type: 'time', title: 'Time tracked', description: 'Your hours over the last 7 days', icon: BarChart3, w: 4, h: 3, minW: 3, minH: 3, server: 'time' },
  clips:      { type: 'clips', title: 'Recent clips', description: 'Your latest recordings', icon: Film, w: 4, h: 3, minW: 3, minH: 2, server: 'clips' },
  notetaker:  { type: 'notetaker', title: 'AI notetaker', description: 'Recent meeting notes and summaries', icon: Mic, w: 4, h: 4, minW: 3, minH: 3, server: 'notetaker' },
  activity:   { type: 'activity', title: 'Activity', description: 'Live workspace activity stream', icon: Activity, w: 4, h: 6, minW: 3, minH: 4 },
  quick_note: { type: 'quick_note', title: 'Scratchpad', description: 'A private note that autosaves', icon: StickyNote, w: 4, h: 3, minW: 2, minH: 2 },
  clock:      { type: 'clock', title: 'Clock', description: 'Time, date and a greeting', icon: Clock, w: 3, h: 2, minW: 2, minH: 2 },
  embed:      { type: 'embed', title: 'Embed', description: 'Any web page (Figma, Loom, sheets…)', icon: Globe, w: 6, h: 5, minW: 3, minH: 3 },
  bookmarks:  { type: 'bookmarks', title: 'Bookmarks', description: 'Your own quick links', icon: Bookmark, w: 3, h: 3, minW: 2, minH: 2 },
};

let seq = 0;
export const newWidget = (type: WidgetType): WidgetInstance => ({
  id: `${type}-${Date.now().toString(36)}-${(seq++).toString(36)}`,
  type,
  w: WIDGETS[type].w,
  h: WIDGETS[type].h,
});

export const DEFAULT_GRID: WidgetInstance[] = [
  { id: 'stats', type: 'stats', w: 12, h: 2 },
  { id: 'agenda', type: 'agenda', w: 4, h: 6 },
  { id: 'tasks', type: 'tasks', w: 4, h: 6 },
  { id: 'activity', type: 'activity', w: 4, h: 6 },
  { id: 'reminders', type: 'reminders', w: 4, h: 4 },
  { id: 'docs', type: 'docs', w: 4, h: 4 },
  { id: 'time', type: 'time', w: 4, h: 4 },
  { id: 'crm', type: 'crm', w: 6, h: 4 },
  { id: 'workload', type: 'workload', w: 6, h: 4 },
];

// ── Data ─────────────────────────────────────────────────────────────────────

/** One request for every server-backed widget on screen; refreshes live. */
export function useWidgetData(widgets: WidgetInstance[]) {
  const types = useMemo(
    () => Array.from(new Set(widgets.map((w) => WIDGETS[w.type]?.server).filter(Boolean) as string[])).sort(),
    [widgets]
  );
  const key = types.length ? `/api/dashboard/widgets?types=${types.join(',')}` : null;
  const { data, mutate, isLoading } = useSWR(key, (u: string) => fetch(u).then((r) => r.json()), {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
    keepPreviousData: true,
  });
  useSSE((evt) => {
    if (
      evt.type === 'sse:reconnected' ||
      evt.type === 'calendar:changed' ||
      evt.type === 'reminder:changed' ||
      evt.type === 'reminder:due' ||
      evt.type?.startsWith?.('task:')
    ) {
      mutate();
    }
  });
  return { data: (data?.data ?? {}) as Record<string, any>, isLoading, refresh: mutate };
}

// ── Renderers ────────────────────────────────────────────────────────────────

const Empty = ({ children }: { children: React.ReactNode }) => (
  <p className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">{children}</p>
);
const Row = ({ href, children, className }: { href?: string; children: React.ReactNode; className?: string }) =>
  href ? (
    <Link href={href} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent', className)}>{children}</Link>
  ) : (
    <div className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-sm', className)}>{children}</div>
  );
const when = (d: string | Date) => {
  const x = new Date(d);
  return isToday(x) ? `Today ${format(x, 'h:mm a')}` : isTomorrow(x) ? `Tomorrow ${format(x, 'h:mm a')}` : format(x, 'EEE, MMM d');
};
const AGENDA_COLOR: Record<string, string> = {
  rose: '#f43f5e', pink: '#ec4899', fuchsia: '#d946ef', violet: '#8b5cf6', sky: '#0ea5e9', cyan: '#06b6d4', amber: '#f59e0b',
  teal: '#14b8a6', emerald: '#10b981', lime: '#84cc16', yellow: '#eab308', blue: '#3b82f6', orange: '#f97316', red: '#ef4444', indigo: '#6366f1',
};
const PRIORITY: Record<string, string> = { URGENT: 'bg-red-500', HIGH: 'bg-orange-500', MEDIUM: 'bg-blue-500', LOW: 'bg-gray-400' };
const fmtBytes = (n: number) => (n > 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

export function WidgetBody({
  widget, data, onConfig,
}: {
  widget: WidgetInstance;
  data: Record<string, any>;
  onConfig: (config: Record<string, any>) => void;
}) {
  const d = WIDGETS[widget.type]?.server ? data[WIDGETS[widget.type].server!] : undefined;
  if (WIDGETS[widget.type]?.server && d === undefined) {
    return <div className="space-y-2 p-3">{[0, 1, 2].map((i) => <div key={i} className="h-6 animate-pulse rounded bg-muted" />)}</div>;
  }
  if (d?.error) return <Empty>Couldn&apos;t load this card.</Empty>;

  switch (widget.type) {
    case 'stats': {
      const items = [
        ['Open tasks', d.openTasks, '/scrumboard'], ['Overdue', d.overdue, '/scrumboard'], ['Meetings today', d.meetingsToday, '/calendar/page'],
        ['Reminders', d.reminders, '/calendar/page'], ['Unread', d.unread, undefined], ['Docs this week', d.docsWeek, '/docs'],
      ] as const;
      return (
        <div className="grid h-full grid-cols-3 gap-2 p-3 md:grid-cols-6">
          {items.map(([label, value, href]) => {
            const inner = (
              <>
                <p className={cn('text-2xl font-semibold tabular-nums', label === 'Overdue' && value > 0 && 'text-red-500')}>{value}</p>
                <p className="text-[11px] text-muted-foreground">{label}</p>
              </>
            );
            return href ? (
              <Link key={label} href={href} className="rounded-lg border bg-background/50 p-3 hover:bg-accent">{inner}</Link>
            ) : (
              <div key={label} className="rounded-lg border bg-background/50 p-3">{inner}</div>
            );
          })}
        </div>
      );
    }
    case 'agenda':
      return !d.length ? <Empty>Nothing scheduled for the next 7 days.</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((i: any) => (
            <Row key={i.id} href={i.href}>
              <span className="w-1 self-stretch rounded-full" style={{ background: AGENDA_COLOR[i.color] ?? 'hsl(var(--primary))' }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{i.title}</span>
                <span className="block text-[11px] text-muted-foreground">{i.allDay ? format(new Date(i.start), 'EEE, MMM d') : when(i.start)}</span>
              </span>
            </Row>
          ))}
        </div>
      );
    case 'tasks':
      return !d.length ? <Empty>No open tasks assigned to you 🎉</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((t: any) => (
            <Row key={t.id} href={t.href}>
              <span className={cn('size-2 shrink-0 rounded-full', PRIORITY[t.priority] ?? 'bg-gray-400')} />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{t.title}</span>
                <span className="block truncate text-[11px] text-muted-foreground">{t.board} › {t.column}</span>
              </span>
              {t.dueDate && (
                <span className={cn('shrink-0 text-[11px]', new Date(t.dueDate) < new Date() ? 'text-red-500' : 'text-muted-foreground')}>
                  {format(new Date(t.dueDate), 'MMM d')}
                </span>
              )}
            </Row>
          ))}
        </div>
      );
    case 'reminders':
      return !d.length ? <Empty>No reminders. Click an empty slot on the calendar to add one.</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((r: any) => (
            <Row key={r.id}>
              <AlarmClock className={cn('size-3.5 shrink-0', new Date(r.due) < new Date() ? 'text-red-500' : 'text-amber-500')} />
              <span className="min-w-0 flex-1 truncate">{r.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{when(r.due)}</span>
            </Row>
          ))}
        </div>
      );
    case 'docs':
      return !d.length ? <Empty>No docs yet.</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((p: any) => (
            <Row key={p.id} href={p.href}>
              <span className="w-5 shrink-0 text-center">{p.emoji ?? '📄'}</span>
              <span className="min-w-0 flex-1 truncate">{p.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(p.updatedAt), { addSuffix: true })}</span>
            </Row>
          ))}
        </div>
      );
    case 'notes':
      return !d.length ? <Empty>No notes yet.</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((n: any) => (
            <Row key={n.id} href={n.href}>
              <span className="w-5 shrink-0 text-center">{n.emoji ?? (n.isPinned ? '📌' : '📝')}</span>
              <span className="min-w-0 flex-1 truncate">{n.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(n.updatedAt), { addSuffix: true })}</span>
            </Row>
          ))}
        </div>
      );
    case 'files':
      return !d.length ? <Empty>No files yet.</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((f: any) => (
            <Row key={f.id} href="/drive/all">
              <span className="w-5 shrink-0 text-center">{f.mimeType?.startsWith('image/') ? '🖼' : f.mimeType?.startsWith('video/') ? '🎬' : '📎'}</span>
              <span className="min-w-0 flex-1 truncate">{f.originalName}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{fmtBytes(f.size)}</span>
            </Row>
          ))}
        </div>
      );
    case 'crm': {
      const max = Math.max(1, ...d.stages.map((s: any) => s.count));
      return !d.total ? <Empty>No deals yet.</Empty> : (
        <div className="space-y-2 p-3">
          {d.stages.map((s: any) => (
            <Link key={s.stage} href="/crm/deals" className="block">
              <div className="mb-0.5 flex justify-between text-xs">
                <span className="capitalize">{s.stage.replace(/_/g, ' ').toLowerCase()}</span>
                <span className="tabular-nums text-muted-foreground">{s.count}{s.amount ? ` · ${Math.round(s.amount).toLocaleString()}` : ''}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={cn('h-full rounded-full', s.stage === 'CLOSED_WON' ? 'bg-emerald-500' : s.stage === 'CLOSED_LOST' ? 'bg-red-400' : 'bg-primary')}
                  style={{ width: `${(s.count / max) * 100}%` }} />
              </div>
            </Link>
          ))}
        </div>
      );
    }
    case 'workload': {
      const max = Math.max(1, ...d.map((m: any) => m.open));
      return !d.length ? <Empty>Select a team to see workload.</Empty> : (
        <div className="space-y-1.5 p-3">
          {d.map((m: any) => (
            <div key={m.userId} className="flex items-center gap-2 text-xs">
              <span className="w-28 truncate">{m.name ?? 'Member'}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-primary" style={{ width: `${(m.open / max) * 100}%` }} />
              </div>
              <span className="w-6 text-right tabular-nums text-muted-foreground">{m.open}</span>
            </div>
          ))}
        </div>
      );
    }
    case 'time': {
      const max = Math.max(1, ...d.days.map((x: any) => x.hours));
      return (
        <div className="flex h-full flex-col p-3">
          <p className="text-2xl font-semibold tabular-nums">{d.total}h <span className="text-xs font-normal text-muted-foreground">last 7 days</span></p>
          <div className="mt-2 flex flex-1 items-end gap-1.5">
            {d.days.map((x: any) => (
              <div key={x.day} className="flex flex-1 flex-col items-center gap-1" title={`${x.hours}h`}>
                <div className="w-full rounded-t bg-primary/80" style={{ height: `${Math.max(4, (x.hours / max) * 100)}%` }} />
                <span className="text-[10px] text-muted-foreground">{format(new Date(x.day), 'EEEEE')}</span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    case 'clips':
      return !d.length ? <Empty>No clips yet.</Empty> : (
        <div className="space-y-0.5 p-2">
          {d.map((c: any) => (
            <Row key={c.id} href="/clips">
              <Film className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">{c.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}</span>
            </Row>
          ))}
        </div>
      );
    case 'notetaker':
      return !d.length ? <Empty>No notetaker meetings yet.</Empty> : (
        <div className="space-y-1 p-2">
          {d.map((m: any) => (
            <Row key={m.id} href={`/meetings/${m.id}`} className="items-start">
              <Mic className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate">{m.meetingName || m.platform || 'Meeting'}</span>
                {m.summary && <span className="line-clamp-2 text-[11px] text-muted-foreground">{m.summary}</span>}
              </span>
              <span className="shrink-0 text-[10px] capitalize text-muted-foreground">{m.status}</span>
            </Row>
          ))}
        </div>
      );
    case 'activity':
      return <div className="h-full overflow-hidden [&>*]:h-full [&>*]:border-0 [&>*]:shadow-none">{<ActivityFeedCard />}</div>;
    case 'quick_note':
      return <QuickNote value={widget.config?.text ?? ''} onChange={(text) => onConfig({ ...widget.config, text })} />;
    case 'clock':
      return <ClockWidget />;
    case 'embed':
      return <EmbedWidget url={widget.config?.url} onUrl={(url) => onConfig({ ...widget.config, url })} />;
    case 'bookmarks':
      return <Bookmarks links={widget.config?.links ?? []} onChange={(links) => onConfig({ ...widget.config, links })} />;
    default:
      return <Empty>Unknown card.</Empty>;
  }
}

function QuickNote({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  useEffect(() => {
    if (text === value) return;
    const t = setTimeout(() => onChange(text), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  return (
    <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Jot something down… (autosaves)"
      className="h-full w-full resize-none bg-transparent p-3 text-sm outline-none placeholder:text-muted-foreground" />
  );
}

function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const h = now.getHours();
  return (
    <div className="flex h-full flex-col justify-center p-4">
      <p className="text-xs text-muted-foreground">{h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}</p>
      <p className="text-3xl font-semibold tabular-nums">{format(now, 'h:mm:ss a')}</p>
      <p className="text-xs text-muted-foreground">{format(now, 'EEEE, MMMM d')}</p>
    </div>
  );
}

function EmbedWidget({ url, onUrl }: { url?: string; onUrl: (u: string) => void }) {
  const [draft, setDraft] = useState(url ?? '');
  const valid = (u: string) => /^https:\/\//i.test(u);
  if (!url) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4">
        <p className="text-xs text-muted-foreground">Paste an https:// link to embed</p>
        <div className="flex w-full max-w-sm gap-2">
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="https://…"
            className="h-8 flex-1 rounded-md border bg-transparent px-2 text-xs outline-none" />
          <button type="button" disabled={!valid(draft)} onClick={() => onUrl(draft)}
            className="h-8 rounded-md bg-primary px-3 text-xs text-primary-foreground disabled:opacity-50">Embed</button>
        </div>
      </div>
    );
  }
  return <iframe src={url} title="Embedded content" className="h-full w-full border-0" sandbox="allow-scripts allow-same-origin allow-popups allow-forms" />;
}

function Bookmarks({ links, onChange }: { links: { label: string; url: string }[]; onChange: (l: { label: string; url: string }[]) => void }) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const add = () => {
    if (!url.trim()) return;
    const u = /^(https?:)?\/\//.test(url) || url.startsWith('/') ? url : `https://${url}`;
    onChange([...links, { label: label.trim() || u, url: u }]);
    setLabel('');
    setUrl('');
  };
  return (
    <div className="flex h-full flex-col p-2">
      <div className="flex-1 space-y-0.5 overflow-y-auto">
        {links.map((l, i) => (
          <div key={i} className="group flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-accent">
            <Bookmark className="size-3.5 shrink-0 text-muted-foreground" />
            <a href={l.url} target={l.url.startsWith('/') ? undefined : '_blank'} rel="noreferrer" className="min-w-0 flex-1 truncate">{l.label}</a>
            <button type="button" className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100" onClick={() => onChange(links.filter((_, j) => j !== i))}>✕</button>
          </div>
        ))}
        {!links.length && <p className="p-2 text-xs text-muted-foreground">Add links you open often.</p>}
      </div>
      <div className="mt-1 flex gap-1">
        <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Name" className="h-7 w-20 rounded border bg-transparent px-1.5 text-xs outline-none" />
        <input value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="URL or /path" className="h-7 min-w-0 flex-1 rounded border bg-transparent px-1.5 text-xs outline-none" />
        <button type="button" onClick={add} className="h-7 rounded bg-primary px-2 text-xs text-primary-foreground">Add</button>
      </div>
    </div>
  );
}
