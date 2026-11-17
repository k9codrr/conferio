'use client';

// Unified calendar: meetings, notetaker, tasks, to-dos, reminders, CRM,
// timesheet, notes, docs, drive, clips and whiteboards in one view.
// Data: /api/calendar/feed. Live: any relevant realtime event refetches.
import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { addDays, endOfMonth, format, startOfMonth } from 'date-fns';
import { toast } from 'sonner';
import { AlarmClock, ExternalLink, ListTodo, Video, X } from 'lucide-react';

import { useCalendarContext } from '@/components/calendar/event-calendar/calendar-context';
import { EventCalendar, type CalendarEvent, type EventColor } from '@/components/calendar/event-calendar';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useSSE } from 'hooks/useSSE';
import CustomFieldsPanel from '@/components/custom-fields/CustomFieldsPanel';
import CircularText from '../ui/CircularTextLoader';

export interface FeedSourceMeta { label: string; color: string; group: string }
interface FeedItem {
  id: string; source: string; title: string; description?: string;
  start: string; end: string; allDay: boolean; color: string; href?: string; meta?: Record<string, any>;
}

/** Kept for backwards compatibility with older imports (calendar-context). */
export const etiquettes = [
  { id: 'my-events', name: 'My Events', color: 'emerald' as EventColor, isActive: true },
  { id: 'marketing-team', name: 'Marketing Team', color: 'orange' as EventColor, isActive: true },
  { id: 'interviews', name: 'Interviews', color: 'violet' as EventColor, isActive: true },
  { id: 'events-planning', name: 'Events Planning', color: 'blue' as EventColor, isActive: true },
  { id: 'holidays', name: 'Holidays', color: 'rose' as EventColor, isActive: true },
];

// Realtime event types that can change what the calendar shows.
const LIVE_TYPES = new Set([
  'task:created', 'task:updated', 'task:moved', 'task:deleted',
  'event:created', 'event:updated', 'event:deleted', 'meeting:changed',
  'reminder:changed', 'reminder:due', 'calendar:changed', 'new-clip', 'clip-deleted',
]);

// Sources the user can reschedule by dragging.
const DRAGGABLE = new Set(['task', 'mytask', 'reminder']);

export function useCalendarRange() {
  const { currentDate } = useCalendarContext();
  // Month ± a week covers month/week/day views; +5 weeks covers the agenda view.
  return useMemo(() => {
    const from = addDays(startOfMonth(currentDate), -7);
    const to = addDays(endOfMonth(currentDate), 37);
    return { from, to, key: `${format(from, 'yyyy-MM-dd')}_${format(to, 'yyyy-MM-dd')}` };
  }, [currentDate]);
}

export default function Component() {
  const { data: session, status } = useSession();
  const { push } = useRouter();
  const queryClient = useQueryClient();
  const { isSourceVisible } = useCalendarContext();
  const range = useCalendarRange();
  const [selected, setSelected] = useState<CalendarEvent | null>(null);
  const [creatingAt, setCreatingAt] = useState<Date | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') push('/auth/login');
  }, [status, push]);

  const feedKey = useMemo(() => ['calendar-feed', range.key], [range.key]);
  const { data, isLoading, error } = useQuery({
    queryKey: feedKey,
    queryFn: async () => {
      const qs = new URLSearchParams({ from: range.from.toISOString(), to: range.to.toISOString() });
      const res = await fetch(`/api/calendar/feed?${qs}`);
      if (!res.ok) throw new Error('Failed to load calendar');
      return res.json() as Promise<{ items: FeedItem[]; sources: Record<string, FeedSourceMeta> }>;
    },
    enabled: !!session,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: true,
    refetchInterval: 60_000, // catches uploads/edits from modules without realtime events
  });

  // ── Realtime: refetch (debounced) when anything calendar-relevant changes ──
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refetchSoon = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => queryClient.invalidateQueries({ queryKey: ['calendar-feed'] }), 400);
  }, [queryClient]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useSSE((evt) => {
    if (evt.type === 'sse:reconnected' || LIVE_TYPES.has(evt.type)) refetchSoon();
  });

  const events: CalendarEvent[] = useMemo(
    () =>
      (data?.items ?? []).map((i) => ({
        id: i.id,
        title: i.title,
        description: i.description,
        start: new Date(i.start),
        end: new Date(i.end),
        allDay: i.allDay,
        color: i.color as EventColor,
        source: i.source,
        href: i.href,
        meta: i.meta,
        label: data?.sources?.[i.source]?.label,
      })),
    [data]
  );
  const visibleEvents = useMemo(() => events.filter((e) => isSourceVisible(e.source)), [events, isSourceVisible]);

  // ── Drag to reschedule ─────────────────────────────────────────────────────
  const reschedule = useMutation({
    mutationFn: async (e: CalendarEvent) => {
      const rowId = e.id.split(':').slice(1).join(':');
      const start = new Date(e.start);
      let res: Response;
      if (e.source === 'task') {
        res = await fetch(`/api/tasks/${rowId}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: format(start, 'yyyy-MM-dd') }),
        });
      } else if (e.source === 'mytask') {
        res = await fetch('/api/task', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: rowId, dueTime: start.toISOString() }),
        });
      } else {
        res = await fetch(`/api/reminders/${rowId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dueDate: start.toISOString() }),
        });
      }
      if (!res.ok) throw new Error('Could not reschedule');
    },
    onMutate: async (e) => {
      await queryClient.cancelQueries({ queryKey: feedKey });
      const prev = queryClient.getQueryData(feedKey);
      queryClient.setQueryData(feedKey, (old: any) =>
        old ? { ...old, items: old.items.map((i: FeedItem) => (i.id === e.id ? { ...i, start: new Date(e.start).toISOString(), end: new Date(e.end).toISOString() } : i)) } : old
      );
      return { prev };
    },
    onError: (err: any, _e, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(feedKey, ctx.prev);
      toast.error(err.message);
    },
    onSettled: refetchSoon,
  });

  const handleEventUpdate = (e: CalendarEvent) => {
    if (!e.source || !DRAGGABLE.has(e.source)) {
      toast('This item can only be rescheduled from its own page.');
      refetchSoon();
      return;
    }
    reschedule.mutate(e);
  };

  const cancelMeeting = useMutation({
    mutationFn: async (meetingId: string) => {
      const res = await fetch(`/api/meeting/cancel/${meetingId}`, { method: 'PUT' });
      if (!res.ok) throw new Error('Failed to cancel meeting');
    },
    onSuccess: () => { toast.success('Meeting cancelled'); setSelected(null); refetchSoon(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (status === 'loading' || (isLoading && !data)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <CircularText text="CONFERIO*CALENDAR*" onHover="speedUp" spinDuration={5} className="custom-class" />
      </div>
    );
  }
  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500">
        Error loading calendar: {(error as Error).message}
      </div>
    );
  }
  if (status === 'unauthenticated') return null;

  return (
    <>
      <EventCalendar
        events={visibleEvents}
        onEventUpdate={handleEventUpdate}
        onEventSelect={(e) => { setSelected(e); return true; }}
        onSlotSelect={(start) => { setCreatingAt(start); return true; }}
        initialView="week"
      />

      <EventDetails
        event={selected}
        sourceLabel={selected?.source ? data?.sources?.[selected.source]?.label : undefined}
        onClose={() => setSelected(null)}
        onOpen={(href) => { setSelected(null); push(href); }}
        onCancelMeeting={(id) => cancelMeeting.mutate(id)}
        cancelling={cancelMeeting.isPending}
      />

      <QuickCreate
        at={creatingAt}
        onClose={() => setCreatingAt(null)}
        onCreated={() => { setCreatingAt(null); refetchSoon(); }}
        onScheduleMeeting={() => { setCreatingAt(null); push('/meetings/new'); }}
      />
    </>
  );
}

// ─── Details dialog ──────────────────────────────────────────────────────────

function EventDetails({ event, sourceLabel, onClose, onOpen, onCancelMeeting, cancelling }: {
  event: CalendarEvent | null; sourceLabel?: string; onClose: () => void;
  onOpen: (href: string) => void; onCancelMeeting: (id: string) => void; cancelling: boolean;
}) {
  const rowId = event?.id.split(':').slice(1).join(':');
  const when = event
    ? event.allDay
      ? format(new Date(event.start), 'EEE, MMM d, yyyy')
      : `${format(new Date(event.start), 'EEE, MMM d · h:mm a')} – ${format(new Date(event.end), 'h:mm a')}`
    : '';
  return (
    <Dialog open={!!event} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        {event && (
          <>
            <DialogHeader>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{sourceLabel ?? event.source}</p>
              <DialogTitle className="text-lg leading-snug">{event.title}</DialogTitle>
              <DialogDescription>{when}</DialogDescription>
            </DialogHeader>
            {event.description && <p className="text-sm text-muted-foreground whitespace-pre-wrap">{event.description}</p>}
            {event.meta && (
              <div className="flex flex-wrap gap-1.5 text-[11px]">
                {Object.entries(event.meta)
                  .filter(([k, v]) => v !== null && v !== undefined && v !== '' && !['meetLink'].includes(k) && typeof v !== 'object')
                  .map(([k, v]) => (
                    <span key={k} className="rounded-md bg-muted px-1.5 py-0.5 text-muted-foreground">
                      {k}: {String(v)}
                    </span>
                  ))}
              </div>
            )}
            {rowId && (event.source === 'reminder' || event.source === 'mytask' || event.source === 'event') && (
              <CustomFieldsPanel entity={event.source === 'event' ? 'event' : 'reminder'} recordId={rowId} className="border-t pt-3" />
            )}
            <DialogFooter className="gap-2 sm:gap-2">
              {event.source === 'meeting' && rowId && (
                <Button variant="outline" disabled={cancelling} onClick={() => onCancelMeeting(rowId)}>
                  <X className="size-4" /> Cancel meeting
                </Button>
              )}
              {event.meta?.meetLink && (
                <Button variant="outline" onClick={() => window.open(event.meta!.meetLink, '_blank')}>
                  <Video className="size-4" /> Join
                </Button>
              )}
              {event.href && (
                <Button onClick={() => onOpen(event.href!)}>
                  <ExternalLink className="size-4" /> Open
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick create (click an empty slot) ──────────────────────────────────────

function QuickCreate({ at, onClose, onCreated, onScheduleMeeting }: {
  at: Date | null; onClose: () => void; onCreated: () => void; onScheduleMeeting: () => void;
}) {
  const [kind, setKind] = useState<'reminder' | 'todo'>('reminder');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [when, setWhen] = useState('');
  const [recurrence, setRecurrence] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (at) {
      setTitle(''); setDescription(''); setRecurrence('');
      setWhen(format(at, "yyyy-MM-dd'T'HH:mm"));
    }
  }, [at]);

  const save = async () => {
    if (!title.trim() || !when) return;
    setSaving(true);
    try {
      const due = new Date(when);
      const res =
        kind === 'reminder'
          ? await fetch('/api/reminders', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title, description: description || null, dueDate: due.toISOString(),
                recurrence: recurrence || null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              }),
            })
          : await fetch('/api/task', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ title, description, dueTime: due.toISOString(), priority: 'medium' }),
            });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.error || 'Could not create');
      toast.success(kind === 'reminder' ? 'Reminder set — you will get a sound alert and an email' : 'To-do added');
      onCreated();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!at} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add to calendar</DialogTitle>
          <DialogDescription>{at ? format(at, 'EEEE, MMM d · h:mm a') : ''}</DialogDescription>
        </DialogHeader>
        <div className="flex gap-1.5">
          {([['reminder', 'Reminder', AlarmClock], ['todo', 'To-do', ListTodo]] as const).map(([k, label, Icon]) => (
            <button key={k} type="button" onClick={() => setKind(k)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-sm ${kind === k ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'}`}>
              <Icon className="size-4" />{label}
            </button>
          ))}
          <button type="button" onClick={onScheduleMeeting}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-muted">
            <Video className="size-4" />Meeting
          </button>
        </div>
        <div className="space-y-2">
          <Input autoFocus placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && save()} />
          <Textarea placeholder="Notes (optional)" value={description} onChange={(e) => setDescription(e.target.value)} className="min-h-[70px]" />
          <div className="flex gap-2">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="flex-1" />
            {kind === 'reminder' && (
              <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)}
                className="rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="">Once</option>
                <option value="daily">Daily</option>
                <option value="weekdays">Weekdays</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={saving || !title.trim()} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
