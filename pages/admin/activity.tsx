import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { MODULE_BY_KEY, type ModuleKey } from '@/lib/platform/modules';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { ago, Badge, Card, CardHeader, Empty, Spinner, UserCell } from '@/components/platform/ui';

const modLabel = (m: ModuleKey | null) => (m ? MODULE_BY_KEY[m]?.label : null);

const ActivityPage: NextPageWithLayout = () => {
  const { data, error } = useSWR('/api/admin/activity', fetcher, { refreshInterval: 20_000 });
  const a = data?.data;

  return (
    <>
      <PageHeader title="Live activity" description="Who is using the platform in the last hour and where. Refreshes every 20 seconds." />
      {error ? (
        <Empty title="Couldn't load activity">{error.message}</Empty>
      ) : !a ? (
        <Spinner />
      ) : (
        <div className="grid gap-5 p-6 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader title={`Active users (${a.online.length})`} description="Most recent page per user" />
            {a.online.length === 0 ? (
              <Empty title="Nobody active in the last hour" />
            ) : (
              <div className="divide-y dark:divide-[#1e1e1e]">
                {a.online.map((o: any) => (
                  <Link key={o.user.id} href={`/admin/users/${o.user.id}`} className="block px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151515]">
                    <div className="flex items-center justify-between gap-2">
                      <UserCell user={o.user} />
                      <span className="flex-shrink-0 text-xs text-gray-400">{ago(o.at)}</span>
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
            <CardHeader title="Activity stream" description="Page opens across all workspaces" />
            {a.feed.length === 0 ? (
              <Empty title="No activity in the last hour" />
            ) : (
              <div className="max-h-[70vh] divide-y overflow-y-auto dark:divide-[#1e1e1e]">
                {a.feed.map((f: any) => (
                  <div key={f.id} className="flex items-center justify-between gap-3 px-5 py-2">
                    <p className="min-w-0 truncate text-sm">
                      <Link href={`/admin/users/${f.user.id}`} className="font-medium hover:underline">
                        {f.user.name}
                      </Link>{' '}
                      <span className="text-gray-500">opened</span> {f.routeLabel || f.route}
                      <span className="text-xs text-gray-400">
                        {' '}
                        · {f.workspace ?? '—'} / {f.team ?? '—'}
                      </span>
                    </p>
                    <div className="flex flex-shrink-0 items-center gap-2">
                      {modLabel(f.module) ? <Badge tone="blue">{modLabel(f.module)}</Badge> : null}
                      <span className="text-xs text-gray-400">{ago(f.at)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card className="lg:col-span-3">
            <CardHeader title="Newest teams" />
            <div className="grid gap-2 p-5 sm:grid-cols-2 lg:grid-cols-5">
              {a.recentTeams.map((t: any) => (
                <div key={t.id} className="rounded-lg border px-3 py-2 dark:border-[#222]">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="truncate text-xs text-gray-500">
                    {t.workspace ? (
                      <Link href={`/admin/workspaces/${t.workspace.id}`} className="hover:underline">
                        {t.workspace.name}
                      </Link>
                    ) : (
                      'no workspace'
                    )}{' '}
                    · {ago(t.createdAt)}
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
