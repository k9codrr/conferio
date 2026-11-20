'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDistanceToNowStrict } from 'date-fns';
import {
  AlertTriangle,
  Bot,
  Briefcase,
  Clapperboard,
  FileText,
  FolderOpen,
  ListChecks,
  Mail,
  PenTool,
  RefreshCw,
  UserPlus,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ActivityFeed, FeedItem, FeedKind } from '@/lib/dashboard/activity-feed';

const REFRESH_MS = 60_000;

const KIND_META: Record<FeedKind, { icon: LucideIcon; tile: string; label: string }> = {
  mail: { icon: Mail, label: 'Mail', tile: 'bg-[#222] text-rose-600 dark:bg-rose-500/15 dark:text-rose-400' },
  crm: { icon: Briefcase, label: 'CRM', tile: 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400' },
  file: { icon: FolderOpen, label: 'Drive', tile: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400' },
  notetaker: { icon: Bot, label: 'AI Notetaker', tile: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400' },
  doc: { icon: FileText, label: 'Docs', tile: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400' },
  task: { icon: ListChecks, label: 'Tasks', tile: 'bg-blue-100 text-blue-600 dark:bg-blue-500/15 dark:text-blue-400' },
  member: { icon: UserPlus, label: 'Team', tile: 'bg-teal-100 text-teal-600 dark:bg-teal-500/15 dark:text-teal-400' },
  workload: { icon: AlertTriangle, label: 'Workload', tile: 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' },
  clip: { icon: Clapperboard, label: 'Clips', tile: 'bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-500/15 dark:text-fuchsia-400' },
  whiteboard: { icon: PenTool, label: 'Whiteboard', tile: 'bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400' },
};

function timeLabel(item: FeedItem, now: number) {
  const at = new Date(item.at).getTime();
  if (item.kind === 'workload') return 'now';
  if (at > now) {
    const mins = Math.round((at - now) / 60_000);
    if (mins < 1) return 'starting now';
    if (mins < 60) return `in ${mins} min`;
    return `in ${formatDistanceToNowStrict(at)}`;
  }
  if (item.kind === 'notetaker' && item.pinned) return 'joining now';
  if (now - at < 60_000) return 'just now';
  return `${formatDistanceToNowStrict(at)} ago`;
}

function Avatar({ actor, kind }: { actor: FeedItem['actor']; kind: FeedKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <div className="relative size-9 flex-shrink-0">
      <div className={cn('flex size-9 items-center justify-center rounded-[10px]', meta.tile)}>
        <Icon className="size-[18px]" />
      </div>
      {actor?.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={actor.image}
          alt=""
          className="absolute -bottom-1 -right-1 size-[18px] rounded-full object-cover ring-2 ring-white dark:ring-neutral-950"
        />
      ) : null}
    </div>
  );
}

function Row({ item, now }: { item: FeedItem; now: number }) {
  const upcoming = item.kind === 'notetaker' && item.pinned;
  return (
    <Link
      href={item.href}
      className={cn(
        'group flex w-full items-start gap-3 rounded-[12px] px-2.5 py-2 text-left transition-colors hover:bg-white dark:hover:bg-[#111]',
        upcoming && 'bg-violet-50/70 dark:bg-violet-500/[0.07]',
        item.kind === 'workload' && 'bg-red-50/70 dark:bg-red-500/[0.07]'
      )}
    >
      <Avatar actor={item.actor} kind={item.kind} />
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug text-gray-600 dark:text-neutral-400">
          {item.actor?.name ? <span className="font-semibold text-black dark:text-white">{item.actor.name} </span> : null}
          {item.action}
          {item.target ? <span className="font-medium text-black dark:text-white"> {item.target}</span> : null}
          {item.suffix ? <span>{item.suffix}</span> : null}
        </p>
        <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-gray-400 dark:text-neutral-500">
          <span className={cn(upcoming && 'font-semibold text-violet-600 dark:text-violet-400')}>{timeLabel(item, now)}</span>
          <span>·</span>
          <span className="truncate">{KIND_META[item.kind].label}{item.team ? ` · ${item.team}` : ''}</span>
          {item.forYou && !upcoming ? (
            <span className="ml-auto flex-shrink-0 rounded-full bg-yellow-400/90 px-1.5 text-[10px] font-semibold text-black dark:bg-[#2647eb] dark:text-white">
              You
            </span>
          ) : null}
        </p>
      </div>
    </Link>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2 px-2.5">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex animate-pulse items-center gap-3 py-2">
          <div className="size-9 rounded-[10px] bg-gray-200 dark:bg-neutral-800" />
          <div className="flex-1 space-y-1.5">
            <div className="h-2.5 w-4/5 rounded bg-gray-200 dark:bg-neutral-800" />
            <div className="h-2 w-1/3 rounded bg-gray-100 dark:bg-neutral-900" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ActivityFeedCard() {
  const [feed, setFeed] = useState<ActivityFeed | null>(null);
  const [error, setError] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'all' | 'you'>('all');
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch('/api/dashboard/activity');
      if (!res.ok) throw new Error(String(res.status));
      setFeed(await res.json());
      setError(false);
    } catch {
      setError(true);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
    };
  }, [load]);

  const items = useMemo(() => {
    const all = feed?.items ?? [];
    return tab === 'you' ? all.filter((i) => i.forYou) : all;
  }, [feed, tab]);
  const youCount = useMemo(() => (feed?.items ?? []).filter((i) => i.forYou).length, [feed]);

  return (
    <div className="flex min-h-0 h-1/3 max-h-[28.333%] w-full flex-none flex-col overflow-hidden rounded-[14px] border bg-gray-50 shadow-md dark:border-[#171717] dark:bg-neutral-950">
      <div className="flex flex-shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <h2 className="text-[15px] font-semibold">Activity</h2>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded-lg border p-0.5 text-[11px] font-medium dark:border-[#262626]">
            {(['all', 'you'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn(
                  'rounded-md px-2 py-0.5 transition-colors',
                  tab === t
                    ? 'bg-yellow-400 text-black dark:bg-[#2647eb] dark:text-white'
                    : 'text-gray-500 hover:text-black dark:text-neutral-400 dark:hover:text-white'
                )}
              >
                {t === 'all' ? 'All' : `For you${youCount ? ` · ${youCount}` : ''}`}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void load()}
            aria-label="Refresh activity"
            className="rounded-md p-1 text-gray-400 transition-colors hover:bg-white hover:text-black dark:hover:bg-[#111] dark:hover:text-white"
          >
            <RefreshCw className={cn('size-3.5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto px-1.5 pb-2">
        {!feed && !error ? (
          <Skeleton />
        ) : error && !feed ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 py-8 text-center text-sm text-gray-500">
            Couldn&apos;t load activity.
            <button type="button" onClick={() => void load()} className="text-xs font-medium text-blue-600 hover:underline">
              Try again
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 py-8 text-center">
            <p className="text-sm font-semibold">All quiet</p>
            <p className="text-xs text-gray-500">
              {tab === 'you' ? 'Nothing needs you right now.' : 'No team activity in the last 7 days.'}
            </p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {items.map((item) => (
              <Row key={item.id} item={item} now={now} />
            ))}
          </div>
        )}
      </div>

      {feed?.mail === 'not_connected' ? (
        <a
          href="/api/integrations/google/connect"
          className="flex flex-shrink-0 items-center justify-center gap-1.5 border-t px-4 py-2 text-[11px] font-medium text-gray-500 transition-colors hover:text-black dark:border-[#171717] dark:hover:text-white"
        >
          <Mail className="size-3" /> Connect Gmail to see new mail here
        </a>
      ) : null}
    </div>
  );
}

export default ActivityFeedCard;
