import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { Badge, Card, Empty, fmtDate, Pagination, SearchBox, Select, Spinner, statusTone, Table, Td, Th, UserCell } from '@/components/platform/ui';

function useDebounced<T>(v: T, ms = 300) {
  const [d, setD] = useState(v);
  useEffect(() => {
    const t = setTimeout(() => setD(v), ms);
    return () => clearTimeout(t);
  }, [v, ms]);
  return d;
}

const WorkspacesPage: NextPageWithLayout = () => {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [plan, setPlan] = useState('');
  const [page, setPage] = useState(1);
  const s = useDebounced(search);
  useEffect(() => setPage(1), [s, status, plan]);

  const { data: plans } = useSWR('/api/admin/plans', fetcher);
  const qs = new URLSearchParams({ search: s, status, plan, page: String(page) });
  const { data, error } = useSWR(`/api/admin/workspaces?${qs}`, fetcher, { keepPreviousData: true });

  return (
    <>
      <PageHeader title="Workspaces" description="Every tenant on the platform. Open one to change its plan, modules, limits or status." />
      <div className="p-6">
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 dark:border-[#222]">
            <SearchBox value={search} onChange={setSearch} placeholder="Name, slug, owner email, team…" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              <option value="ACTIVE">Active</option>
              <option value="SUSPENDED">Suspended</option>
            </Select>
            <Select value={plan} onChange={(e) => setPlan(e.target.value)}>
              <option value="">All assigned plans</option>
              {(plans?.data ?? []).map((p: any) => (
                <option key={p.id} value={p.key}>
                  {p.name}
                </option>
              ))}
            </Select>
          </div>
          {error ? (
            <Empty title="Couldn't load workspaces">{error.message}</Empty>
          ) : !data ? (
            <Spinner />
          ) : data.data.length === 0 ? (
            <Empty title="No workspaces match" />
          ) : (
            <Table
              head={
                <>
                  <Th>Workspace</Th>
                  <Th>Owner</Th>
                  <Th>Plan</Th>
                  <Th>Teams</Th>
                  <Th>Seats</Th>
                  <Th>Status</Th>
                  <Th>Created</Th>
                </>
              }
            >
              {data.data.map((w: any) => (
                <tr key={w.id} className="hover:bg-gray-50 dark:hover:bg-[#151515]">
                  <Td>
                    <Link href={`/admin/workspaces/${w.id}`} className="font-medium hover:underline">
                      {w.name}
                    </Link>
                    <p className="text-xs text-gray-400">{w.slug}</p>
                  </Td>
                  <Td>
                    <UserCell user={w.owner} />
                  </Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className="text-sm">{w.plan?.name ?? '—'}</span>
                      {w.subscription ? (
                        <Badge tone={statusTone(w.subscription.status)}>
                          {w.subscription.interval === 'YEARLY' ? 'yearly' : 'monthly'} · {w.subscription.status}
                        </Badge>
                      ) : w.planSource === 'MANUAL' && w.assignedPlan ? (
                        <Badge tone="violet">manual</Badge>
                      ) : null}
                    </div>
                    {w.planExpiresAt ? <p className="text-[11px] text-gray-400">until {fmtDate(w.planExpiresAt)}</p> : null}
                  </Td>
                  <Td className="tabular-nums">{w.teams}</Td>
                  <Td className="tabular-nums">{w.seats}</Td>
                  <Td>
                    <Badge tone={statusTone(w.status)}>{w.status.toLowerCase()}</Badge>
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">{fmtDate(w.createdAt)}</Td>
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

WorkspacesPage.getLayout = adminLayout;
export default WorkspacesPage;
