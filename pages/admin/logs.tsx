import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWRInfinite from 'swr/infinite';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { Badge, Btn, Card, Empty, fmtDate, SearchBox, Spinner } from '@/components/platform/ui';
import { useSSE } from 'hooks/useSSE';

const SOURCES: { key: string; label: string }[] = [
  { key: 'audit', label: 'Admin audit' },
  { key: 'task', label: 'Tasks & boards' },
  { key: 'crm', label: 'CRM' },
  { key: 'doc', label: 'Docs' },
  { key: 'note', label: 'Notes' },
  { key: 'file', label: 'Files' },
  { key: 'meeting', label: 'Meetings' },
  { key: 'clip', label: 'Clips' },
  { key: 'whiteboard', label: 'Whiteboards' },
  { key: 'team', label: 'Teams' },
  { key: 'user', label: 'Sign-ups' },
];
const TONE: Record<string, 'gray' | 'blue' | 'green' | 'amber' | 'red' | 'violet'> = {
  audit: 'red', task: 'blue', crm: 'green', doc: 'violet', note: 'amber', file: 'gray',
  meeting: 'blue', clip: 'violet', whiteboard: 'green', team: 'amber', user: 'green',
};

const LogsPage: NextPageWithLayout = () => {
  const [q, setQ] = useState('');
  const [sources, setSources] = useState<string[]>([]);
  const [newCount, setNewCount] = useState(0);

  const base = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (sources.length) p.set('sources', sources.join(','));
    return p.toString();
  }, [q, sources]);

  const { data, error, size, setSize, isValidating, mutate } = useSWRInfinite(
    (i, prev: any) => {
      if (i === 0) return `/api/admin/logs?${base}`;
      const before = prev?.data?.nextBefore;
      return before ? `/api/admin/logs?${base}&before=${encodeURIComponent(before)}` : null;
    },
    fetcher,
    { revalidateFirstPage: true }
  );

  // New platform activity → show a "N new" pill instead of jumping the list.
  useSSE((evt) => {
    if (evt.type === 'admin:activity' && evt.kind === 'write') setNewCount((n) => n + 1);
  });

  const entries = (data ?? []).flatMap((d: any) => d?.data?.entries ?? []);
  const hasMore = !!data?.[data.length - 1]?.data?.nextBefore;
  const toggle = (k: string) => setSources((s) => (s.includes(k) ? s.filter((x) => x !== k) : [...s, k]));

  return (
    <>
      <PageHeader title="Activity logs" description="Everything happening across all workspaces: admin actions, tasks, CRM, content, meetings, teams and sign-ups." />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-72 max-w-full"><SearchBox value={q} onChange={setQ} placeholder="Search logs…" /></div>
          {SOURCES.map((s) => (
            <button key={s.key} type="button" onClick={() => toggle(s.key)}
              className={`rounded-full border px-2.5 py-1 text-xs ${sources.includes(s.key) ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 text-gray-600 dark:border-[#2a2a2a] dark:text-gray-400'}`}>
              {s.label}
            </button>
          ))}
          {sources.length > 0 && <button type="button" className="text-xs text-gray-500 hover:underline" onClick={() => setSources([])}>Clear</button>}
        </div>

        {newCount > 0 && (
          <button type="button" onClick={() => { setNewCount(0); mutate(); }}
            className="w-full rounded-lg border border-blue-200 bg-blue-50 py-2 text-xs font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
            {newCount} new event{newCount === 1 ? '' : 's'} — click to refresh
          </button>
        )}

        <Card>
          {error ? (
            <Empty title="Couldn't load logs">{error.message}</Empty>
          ) : !data ? (
            <Spinner />
          ) : entries.length === 0 ? (
            <Empty title="No activity matches these filters" />
          ) : (
            <div className="divide-y dark:divide-[#1e1e1e]">
              {entries.map((e: any) => (
                <div key={e.id} className="flex items-start gap-3 px-5 py-2.5">
                  <span className="w-36 flex-shrink-0 pt-0.5 text-xs text-gray-400">{fmtDate(e.at, true)}</span>
                  <Badge tone={TONE[e.source] ?? 'gray'} className="mt-0.5 flex-shrink-0">{SOURCES.find((s) => s.key === e.source)?.label ?? e.source}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">
                      {e.href ? <Link href={e.href} className="hover:underline">{e.text}</Link> : e.text}
                    </p>
                    <p className="text-xs text-gray-500">
                      {e.actor ? (
                        <Link href={`/admin/users/${e.actor.id}`} className="hover:underline">{e.actor.name || e.actor.email}</Link>
                      ) : 'system'}
                      {e.team ? ` · ${e.team}` : ''}
                      {e.source === 'audit' && e.meta ? (
                        <code className="ml-2 inline-block max-w-md truncate align-bottom text-[11px] text-gray-400" title={JSON.stringify(e.meta)}>{JSON.stringify(e.meta)}</code>
                      ) : null}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {hasMore && (
            <div className="border-t p-3 text-center dark:border-[#222]">
              <Btn variant="default" loading={isValidating} onClick={() => setSize(size + 1)}>{isValidating ? 'Loading…' : 'Load older'}</Btn>
            </div>
          )}
        </Card>
      </div>
    </>
  );
};

LogsPage.getLayout = adminLayout;
export default LogsPage;
