import React, { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { Card, Empty, fmtDate, Pagination, Select, Spinner, Table, Td, Th } from '@/components/platform/ui';

const PREFIXES = ['workspace.', 'user.', 'plan.', 'modules.', 'team.', 'billing.'];

function targetHref(type: string | null, id: string | null) {
  if (!type || !id) return null;
  if (type === 'workspace') return `/admin/workspaces/${id}`;
  if (type === 'user') return `/admin/users/${id}`;
  if (type === 'plan') return '/admin/plans';
  if (type === 'platform') return '/admin/modules';
  return null;
}

const AuditPage: NextPageWithLayout = () => {
  const [action, setAction] = useState('');
  const [page, setPage] = useState(1);
  const { data, error } = useSWR(`/api/admin/audit?action=${action}&page=${page}`, fetcher, { keepPreviousData: true });

  return (
    <>
      <PageHeader title="Audit log" description="Every admin action and billing event on the platform." />
      <div className="p-6">
        <Card>
          <div className="border-b px-5 py-3 dark:border-[#222]">
            <Select
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All events</option>
              {PREFIXES.map((p) => (
                <option key={p} value={p}>
                  {p.replace('.', '')}
                </option>
              ))}
            </Select>
          </div>
          {error ? (
            <Empty title="Couldn't load the audit log">{error.message}</Empty>
          ) : !data ? (
            <Spinner />
          ) : data.data.length === 0 ? (
            <Empty title="Nothing logged yet" />
          ) : (
            <Table head={<><Th>When</Th><Th>Actor</Th><Th>Action</Th><Th>Target</Th><Th>Details</Th></>}>
              {data.data.map((a: any) => {
                const href = targetHref(a.targetType, a.targetId);
                return (
                  <tr key={a.id}>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(a.createdAt, true)}</Td>
                    <Td className="text-sm">{a.actor ? a.actor.name || a.actor.email : <span className="text-gray-400">system</span>}</Td>
                    <Td>
                      <code className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] dark:bg-neutral-800">{a.action}</code>
                    </Td>
                    <Td className="text-xs">
                      {href ? (
                        <Link href={href} className="text-blue-600 hover:underline">
                          {a.targetType}
                        </Link>
                      ) : (
                        a.targetType ?? '—'
                      )}
                    </Td>
                    <Td className="max-w-md">
                      <code className="block truncate text-[11px] text-gray-500" title={JSON.stringify(a.meta)}>
                        {JSON.stringify(a.meta)}
                      </code>
                    </Td>
                  </tr>
                );
              })}
            </Table>
          )}
          {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
        </Card>
      </div>
    </>
  );
};

AuditPage.getLayout = adminLayout;
export default AuditPage;
