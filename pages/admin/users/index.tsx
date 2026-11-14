import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { ago, Badge, Card, Empty, fmtDate, Pagination, SearchBox, Spinner, Table, Td, Th, UserCell } from '@/components/platform/ui';
import { cn } from '@/lib/utils';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'admins', label: 'Platform admins' },
  { key: 'suspended', label: 'Suspended' },
];

const UsersPage: NextPageWithLayout = () => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced, filter]);

  const qs = new URLSearchParams({ search: debounced, filter, page: String(page) });
  const { data, error } = useSWR(`/api/admin/users?${qs}`, fetcher, { keepPreviousData: true });

  return (
    <>
      <PageHeader title="Users" description="Every account on the platform. Grant admin access, suspend accounts or sign users out." />
      <div className="p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 dark:border-[#222]">
            <SearchBox value={search} onChange={setSearch} placeholder="Name, email or username…" />
            <div className="flex rounded-lg border p-0.5 text-xs font-medium dark:border-[#2a2a2a]">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    'rounded-md px-2.5 py-1',
                    filter === f.key ? 'bg-yellow-400 text-black dark:bg-[#2647eb] dark:text-white' : 'text-gray-500 hover:text-black dark:hover:text-white'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {error ? (
            <Empty title="Couldn't load users">{error.message}</Empty>
          ) : !data ? (
            <Spinner />
          ) : data.data.length === 0 ? (
            <Empty title="No users match" />
          ) : (
            <Table
              head={
                <>
                  <Th>User</Th>
                  <Th>Teams</Th>
                  <Th>Workspaces owned</Th>
                  <Th>Last seen</Th>
                  <Th>Joined</Th>
                  <Th>Status</Th>
                </>
              }
            >
              {data.data.map((u: any) => (
                <tr key={u.id} className="hover:bg-gray-50 dark:hover:bg-[#151515]">
                  <Td>
                    <Link href={`/admin/users/${u.id}`} className="block hover:opacity-80">
                      <UserCell user={u} />
                    </Link>
                  </Td>
                  <Td className="tabular-nums">{u.teams}</Td>
                  <Td className="tabular-nums">{u.workspacesOwned}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">{u.lastSeenAt ? ago(u.lastSeenAt) : 'never'}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">{fmtDate(u.createdAt)}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {u.isPlatformAdmin || u.envAdmin ? <Badge tone="violet">admin</Badge> : null}
                      {u.suspendedAt ? <Badge tone="red">suspended</Badge> : <Badge tone="green">active</Badge>}
                      {!u.emailVerified ? <Badge tone="amber">unverified</Badge> : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
        </Card>
      </div>
    </>
  );
};

UsersPage.getLayout = adminLayout;
export default UsersPage;
