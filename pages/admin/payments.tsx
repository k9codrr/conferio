import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { Badge, Card, Empty, fmtDate, money, Pagination, SearchBox, Select, Spinner, Stat, statusTone, Table, Td, Th } from '@/components/platform/ui';
import { cn } from '@/lib/utils';

const PAYMENT_STATUSES = ['captured', 'authorized', 'failed', 'refunded'];
const SUB_STATUSES = ['created', 'authenticated', 'active', 'pending', 'halted', 'cancelled', 'completed', 'expired'];

const PaymentsPage: NextPageWithLayout = () => {
  const [view, setView] = useState<'payments' | 'subscriptions'>('payments');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [view, status, debounced]);

  const qs = new URLSearchParams({ view, status, search: debounced, page: String(page) });
  const { data, error } = useSWR(`/api/admin/payments?${qs}`, fetcher, { keepPreviousData: true });
  const totals: { status: string; amount: number; count: number }[] = data?.totals ?? [];
  const captured = totals.find((t) => t.status === 'captured');
  const failed = totals.find((t) => t.status === 'failed');

  return (
    <>
      <PageHeader title="Payments" description="Razorpay payments and subscriptions for every workspace." />
      <div className="space-y-5 p-6">
        {view === 'payments' && data ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Captured (all time)" value={money(captured?.amount ?? 0)} hint={`${captured?.count ?? 0} payments`} tone="good" />
            <Stat label="Failed" value={failed?.count ?? 0} tone={failed?.count ? 'bad' : 'default'} />
          </div>
        ) : null}
        <Card>
          <div className="flex flex-wrap items-center gap-2 border-b px-5 py-3 dark:border-[#222]">
            <div className="flex rounded-lg border p-0.5 text-xs font-medium dark:border-[#2a2a2a]">
              {(['payments', 'subscriptions'] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => {
                    setView(v);
                    setStatus('');
                  }}
                  className={cn(
                    'rounded-md px-2.5 py-1 capitalize',
                    view === v ? 'bg-yellow-400 text-black dark:bg-[#2647eb] dark:text-white' : 'text-gray-500 hover:text-black dark:hover:text-white'
                  )}
                >
                  {v}
                </button>
              ))}
            </div>
            <SearchBox value={search} onChange={setSearch} placeholder="Workspace…" />
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="">All statuses</option>
              {(view === 'payments' ? PAYMENT_STATUSES : SUB_STATUSES).map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
          {error ? (
            <Empty title="Couldn't load">{error.message}</Empty>
          ) : !data ? (
            <Spinner />
          ) : data.data.length === 0 ? (
            <Empty title={`No ${view} yet`}>They appear once workspaces subscribe through Razorpay.</Empty>
          ) : view === 'payments' ? (
            <Table head={<><Th>Date</Th><Th>Workspace</Th><Th>Plan</Th><Th>Amount</Th><Th>Method</Th><Th>Status</Th><Th>Razorpay ID</Th></>}>
              {data.data.map((p: any) => (
                <tr key={p.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(p.createdAt, true)}</Td>
                  <Td>
                    <Link href={`/admin/workspaces/${p.workspace.id}`} className="font-medium hover:underline">
                      {p.workspace.name}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {p.subscription ? `${p.subscription.plan.name} · ${p.subscription.interval.toLowerCase()}` : '—'}
                  </Td>
                  <Td className="font-semibold tabular-nums">{money(p.amount, p.currency)}</Td>
                  <Td className="text-xs">{p.method ?? '—'}</Td>
                  <Td>
                    <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    {p.errorDescription ? <p className="mt-0.5 max-w-[200px] truncate text-[11px] text-red-500" title={p.errorDescription}>{p.errorDescription}</p> : null}
                  </Td>
                  <Td className="text-xs text-gray-500">
                    <code>{p.razorpayPaymentId}</code>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Table head={<><Th>Created</Th><Th>Workspace</Th><Th>Plan</Th><Th>Status</Th><Th>Current period</Th><Th>Payments</Th><Th>Razorpay ID</Th></>}>
              {data.data.map((s: any) => (
                <tr key={s.id}>
                  <Td className="whitespace-nowrap text-xs">{fmtDate(s.createdAt)}</Td>
                  <Td>
                    <Link href={`/admin/workspaces/${s.workspace.id}`} className="font-medium hover:underline">
                      {s.workspace.name}
                    </Link>
                  </Td>
                  <Td className="text-xs">
                    {s.plan.name} · {s.interval.toLowerCase()} ·{' '}
                    {money(s.interval === 'YEARLY' ? s.plan.priceYearly : s.plan.priceMonthly, s.plan.currency)}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      <Badge tone={statusTone(s.status)}>{s.status}</Badge>
                      {s.cancelAtPeriodEnd ? <Badge tone="amber">ending</Badge> : null}
                    </div>
                  </Td>
                  <Td className="whitespace-nowrap text-xs">
                    {s.currentStart ? `${fmtDate(s.currentStart)} → ${fmtDate(s.currentEnd)}` : '—'}
                  </Td>
                  <Td className="tabular-nums">{s._count.payments}</Td>
                  <Td className="text-xs text-gray-500">
                    <code>{s.razorpaySubscriptionId}</code>
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

PaymentsPage.getLayout = adminLayout;
export default PaymentsPage;
