import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { MODULE_BY_KEY, MODULE_KEYS, type ModuleKey } from '@/lib/platform/modules';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { ago, Badge, Card, CardHeader, Empty, Spinner, Stat, UserCell } from '@/components/platform/ui';
import { useSSE } from 'hooks/useSSE';

const modLabel = (m: ModuleKey | null) => (m ? MODULE_BY_KEY[m]?.label : null);

interface LiveEvent {
  key: string;
  kind: 'pageview' | 'write';
  at: string;
  text: React.ReactNode;
  module?: ModuleKey | null;
}

const fmtMins = (s: number) => (s >= 3600 ? `${Math.round(s / 360) / 10}h` : `${Math.round(s / 60)}m`);

const ActivityPage: NextPageWithLayout = () => {
  const { data, error, mutate } = useSWR('/api/admin/activity', fetcher, { refreshInterval: 30_000 });
  const a = data?.data;
  const [live, setLive] = useState<LiveEvent[]>([]);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => () => { if (refetchTimer.current) clearTimeout(refetchTimer.current); }, []);

  // Realtime: page opens + things created/deleted anywhere on the platform.
  useSSE((evt) => {
    if (evt.type === 'sse:reconnected') { setConnected(true); mutate(); return; }
    if (evt.type !== 'admin:activity') return;
    setConnected(true);
    const item: LiveEvent =
      evt.kind === 'pageview'
        ? {
            key: `pv:${evt.at}:${evt.user?.id}`,
            kind: 'pageview',
            at: evt.at,
            module: evt.module,
            text: (
              <>
                <Link href={`/admin/users/${evt.user?.id}`} className="font-medium hover:underline">{evt.user?.name || evt.user?.email}</Link>{' '}
                <span className="text-gray-500">opened</span> {evt.routeLabel || evt.path}
                <span className="text-xs text-gray-400"> · {evt.workspace ?? '—'} / {evt.team ?? '—'}</span>
              </>
            ),
          }
        : {
            key: `w:${evt.model}:${evt.id}:${evt.action}`,
            kind: 'write',
            at: evt.at,
            text: (
              <>
                <span className="text-gray-500">{evt.action}</span> {evt.label}
                {evt.title ? <> <span className="font-medium">“{evt.title}”</span></> : null}
              </>
            ),
          };
    setLive((l) => (l.some((x) => x.key === item.key) ? l : [item, ...l].slice(0, 150)));
    if (evt.kind === 'pageview') {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(() => mutate(), 1500);
    }
  });

  const maxViews = a ? Math.max(1, ...MODULE_KEYS.map((k) => a.modulesToday[k]?.views ?? 0)) : 1;

  return (
    <>
      <PageHeader
        title="Live activity"
        description={
          <span className="inline-flex items-center gap-2">
            <span className={`inline-block size-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            {connected ? 'Live — updates as people use the platform' : 'Connecting to live stream…'}
          </span>
        }
      />
      {error ? (
        <Empty title="Couldn't load activity">{error.message}</Empty>
      ) : !a ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 p-6 lg:grid-cols-3">
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-3">
            <Stat label="Online now" value={a.online.length} />
            <Stat label="Page views today" value={a.pageViewsToday} />
            <Stat label="Live events (this session)" value={live.length} />
          </div>

          <Card className="lg:col-span-1">
            <CardHeader title={`Online now (${a.online.length})`} description="Open tab with a heartbeat in the last 2 minutes" />
            {a.online.length === 0 ? (
              <Empty title="Nobody online right now" />
            ) : (
              <div className="max-h-[60vh] divide-y overflow-y-auto dark:divide-[#1e1e1e]">
                {a.online.map((o: any) => (
                  <Link key={o.user.id} href={`/admin/users/${o.user.id}`} className="block px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151515]">
                    <div className="flex items-center justify-between gap-2">
                      <UserCell user={o.user} />
                      <span className="flex flex-shrink-0 items-center gap-1 text-xs text-gray-400">
                        <span className="size-1.5 rounded-full bg-emerald-500" />{ago(o.at)}
                      </span>
                    </div>
                    <p className="mt-1 truncate pl-9 text-xs text-gray-500">
                      {modLabel(o.module) ? <Badge tone="blue" className="mr-1">{modLabel(o.module)}</Badge> : null}
                      {o.routeLabel || o.route}
                      {o.workspace ? ` · ${o.workspace.name}` : ''}
                    </p>
                  </Link>
                ))}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Live stream" description="Page opens and things created or deleted, as they happen" />
            {live.length === 0 && a.feed.length === 0 ? (
              <Empty title="Waiting for activity…" />
            ) : (
              <div className="max-h-[60vh] divide-y overflow-y-auto dark:divide-[#1e1e1e]">
                {live.map((e) => (
                  <div key={e.key} className="flex items-center justify-between gap-3 bg-emerald-500/[0.03] px-5 py-2">
                    <p className="min-w-0 truncate text-sm">{e.text}</p>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {e.kind === 'write' ? <Badge tone="green">change</Badge> : modLabel(e.module ?? null) ? <Badge tone="blue">{modLabel(e.module ?? null)}</Badge> : null}
                      <span className="text-xs text-gray-400">{ago(e.at)}</span>
                    </div>
                  </div>
                ))}
                {a.feed.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 px-5 py-2">
                    <p className="min-w-0 truncate text-sm">
                      <Link href={`/admin/users/${f.user.id}`} className="font-medium hover:underline">{f.user.name}</Link>{' '}
                      <span className="text-gray-500">opened</span> {f.routeLabel || f.route}
                      <span className="text-xs text-gray-400"> · {f.workspace ?? '—'} / {f.team ?? '—'}</span>
                    </p>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {f.open ? <Badge tone="green">viewing</Badge> : f.duration ? <span className="text-xs text-gray-400">{fmtMins(f.duration)}</span> : null}
                      {modLabel(f.module) ? <Badge tone="blue">{modLabel(f.module)}</Badge> : null}
                      <span className="text-xs text-gray-400">{ago(f.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="lg:col-span-2">
            <CardHeader title="Module page views today" description="Views and time spent per module since midnight" />
            <div className="space-y-2 p-5">
              {MODULE_KEYS.map((k) => {
                const m = a.modulesToday[k] ?? { views: 0, seconds: 0 };
                return (
                  <div key={k} className="flex items-center gap-3 text-xs">
                    <span className="w-40 truncate text-gray-600 dark:text-gray-300">{modLabel(k)}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${(m.views / maxViews) * 100}%` }} />
                    </div>
                    <span className="w-24 text-right tabular-nums text-gray-500">{m.views} · {fmtMins(m.seconds)}</span>
                  </div>
                );
              })}
            </div>
          </Card>

          <Card className="lg:col-span-1">
            <CardHeader title="Newest teams" />
            <div className="divide-y dark:divide-[#1e1e1e]">
              {a.recentTeams.map((t: any) => (
                <div key={t.id} className="px-5 py-2">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {t.workspace ? <Link href={`/admin/workspaces/${t.workspace.id}`} className="hover:underline">{t.workspace.name}</Link> : 'no workspace'} · {ago(t.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </>
  );
};

ActivityPage.getLayout = adminLayout;
export default ActivityPage;
