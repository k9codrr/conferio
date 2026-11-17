'use client';

// AI Notetaker — list view for the Clips page (table, matches the Clips list).
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { ArrowUpDown, Calendar1, ChevronRight, FileText, Search, Users } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import LazyLoader from '@/components/loader/lazyloader';
import { useLiveInvalidate } from 'hooks/useLiveInvalidate';

export interface NotetakerMeeting {
  id: string;
  meetingName: string | null;
  meetingUrl: string;
  platform: string | null;
  status: string;
  duration: number | null;
  createdAt: string;
  speakers: string[];
  summary: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  s3VideoKey: string | null;
  s3AudioKey: string | null;
}

export const NOTETAKER_QUERY_KEY = ['ai-notetaker-meetings'];

/** Shared by the grid and list views so switching views never refetches. */
export function useNotetakerMeetings() {
  useLiveInvalidate([NOTETAKER_QUERY_KEY], { sources: ['AiMeeting'] });
  return useQuery({
    queryKey: NOTETAKER_QUERY_KEY,
    queryFn: async (): Promise<NotetakerMeeting[]> => {
      const res = await fetch('/api/aimeetings');
      if (!res.ok) throw new Error('Failed to load meetings');
      const data = await res.json();
      return Array.isArray(data) ? data : data.meetings ?? [];
    },
    staleTime: 15_000,
  });
}

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  scheduled: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
  joined: 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  recording: 'bg-red-500/15 text-red-600 dark:text-red-400',
  processing: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  completed: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  failed: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
};
const PLATFORM: Record<string, string> = { zoom: 'Zoom', google_meet: 'Google Meet', teams: 'Teams', conferio: 'Conferio' };

const fmtDuration = (s: number | null) => {
  if (!s) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m ${String(s % 60).padStart(2, '0')}s`;
};

type SortKey = 'date' | 'name' | 'duration';

export default function NotetakerList() {
  const { data: meetings = [], isLoading, error } = useNotetakerMeetings();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('all');
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'date', dir: -1 });

  const statuses = useMemo(() => Array.from(new Set(meetings.map((m) => m.status))).sort(), [meetings]);
  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return meetings
      .filter((m) => status === 'all' || m.status === status)
      .filter((m) =>
        !needle ||
        (m.meetingName ?? '').toLowerCase().includes(needle) ||
        m.meetingUrl.toLowerCase().includes(needle) ||
        (m.summary ?? '').toLowerCase().includes(needle)
      )
      .sort((a, b) => {
        const v =
          sort.key === 'name'
            ? (a.meetingName ?? '').localeCompare(b.meetingName ?? '')
            : sort.key === 'duration'
              ? (a.duration ?? 0) - (b.duration ?? 0)
              : +new Date(a.createdAt) - +new Date(b.createdAt);
        return v * sort.dir;
      });
  }, [meetings, q, status, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === 'name' ? 1 : -1 }));

  if (isLoading) {
    return <div className="flex h-64 items-center justify-center"><LazyLoader /></div>;
  }
  if (error) {
    return <p className="py-16 text-center text-sm text-red-500">{(error as Error).message}</p>;
  }
  if (!meetings.length) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-900">
          <Calendar1 className="size-7 text-zinc-500" />
        </div>
        <p className="mb-1 font-medium text-zinc-700 dark:text-zinc-300">No notetaker meetings yet</p>
        <p className="text-sm text-zinc-500">Have the AI notetaker join your next meeting to get transcripts and summaries.</p>
      </div>
    );
  }

  const SortHead = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <TableHead className={cn('h-8 py-2 text-xs font-medium text-neutral-500', className)}>
      <button type="button" onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-foreground">
        {children}
        <ArrowUpDown className={cn('size-3', sort.key === k ? 'opacity-100' : 'opacity-30')} />
      </button>
    </TableHead>
  );

  return (
    <div className="w-full">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="relative w-64 max-w-full">
          <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-neutral-500" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search meetings, links, summaries…"
            className="h-8 w-full rounded-md border border-neutral-200 bg-transparent pl-8 pr-2 text-xs outline-none focus:border-neutral-400 dark:border-neutral-800 dark:focus:border-neutral-600"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {['all', ...statuses].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={cn(
                'h-8 rounded-md border px-2.5 text-xs capitalize',
                status === s
                  ? 'border-neutral-900 bg-neutral-900 text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-neutral-200 text-neutral-500 hover:text-foreground dark:border-neutral-800'
              )}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="ml-auto text-xs text-neutral-500">{rows.length} of {meetings.length}</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow className="border-none hover:bg-transparent">
            <SortHead k="name" className="pl-3">Meeting</SortHead>
            <TableHead className="h-8 py-2 text-xs font-medium text-neutral-500">Status</TableHead>
            <TableHead className="h-8 py-2 text-xs font-medium text-neutral-500 max-md:hidden">Platform</TableHead>
            <SortHead k="duration" className="max-sm:hidden">Duration</SortHead>
            <TableHead className="h-8 py-2 text-xs font-medium text-neutral-500 max-lg:hidden">Speakers</TableHead>
            <SortHead k="date">Date</SortHead>
            <TableHead className="h-8 w-8 py-2" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((m) => (
            <TableRow key={m.id} className="group border-neutral-100 dark:border-neutral-900">
              <TableCell className="max-w-[360px] py-2.5 pl-3">
                <Link href={`/meetings/${m.id}`} className="block min-w-0">
                  <p className="truncate text-sm font-medium text-neutral-900 group-hover:text-blue-600 dark:text-neutral-100 dark:group-hover:text-blue-400">
                    {m.meetingName || 'Untitled meeting'}
                  </p>
                  {m.summary ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-neutral-500">
                      <FileText className="size-3 shrink-0 text-emerald-500" />
                      <span className="truncate">{m.summary}</span>
                    </p>
                  ) : (
                    <p className="mt-0.5 truncate text-xs text-neutral-500">{m.meetingUrl}</p>
                  )}
                </Link>
              </TableCell>
              <TableCell className="py-2.5">
                <span className={cn('inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium capitalize', STATUS_STYLE[m.status] ?? 'bg-neutral-500/15 text-neutral-500')}>
                  {m.status === 'recording' && <span className="mr-1 mt-1 size-1.5 animate-pulse rounded-full bg-red-500" />}
                  {m.status}
                </span>
              </TableCell>
              <TableCell className="py-2.5 text-xs text-neutral-600 dark:text-neutral-400 max-md:hidden">
                {PLATFORM[m.platform ?? ''] ?? m.platform ?? '—'}
              </TableCell>
              <TableCell className="py-2.5 text-xs tabular-nums text-neutral-600 dark:text-neutral-400 max-sm:hidden">{fmtDuration(m.duration)}</TableCell>
              <TableCell className="py-2.5 text-xs text-neutral-600 dark:text-neutral-400 max-lg:hidden">
                {m.speakers?.length ? (
                  <span className="inline-flex items-center gap-1" title={m.speakers.join(', ')}>
                    <Users className="size-3" />{m.speakers.length}
                  </span>
                ) : '—'}
              </TableCell>
              <TableCell className="py-2.5 text-xs text-neutral-600 dark:text-neutral-400" title={format(new Date(m.createdAt), 'PPpp')}>
                {formatDistanceToNow(new Date(m.createdAt), { addSuffix: true })}
              </TableCell>
              <TableCell className="py-2.5 pr-3">
                <Link href={`/meetings/${m.id}`} aria-label="Open meeting">
                  <ChevronRight className="size-4 text-neutral-400 group-hover:text-blue-500" />
                </Link>
              </TableCell>
            </TableRow>
          ))}
          {!rows.length && (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={7} className="py-10 text-center text-xs text-neutral-500">No meetings match these filters.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
