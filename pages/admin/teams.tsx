import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRightLeft } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { api, Badge, Btn, Card, Empty, fmtDate, Input, Pagination, SearchBox, Spinner, Table, Td, Th, UserCell } from '@/components/platform/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

function MoveDialog({ team, onClose, onDone }: { team: any; onClose: () => void; onDone: () => void }) {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  const { data } = useSWR(`/api/admin/workspaces?search=${encodeURIComponent(debounced)}&pageSize=8`, fetcher);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Move “{team.name}”</DialogTitle>
          <DialogDescription>
            Pick the workspace this team should belong to. Its members, data and billing follow the new workspace. Plan limits are not checked for admin moves.
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Search workspaces…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
        <div className="max-h-72 space-y-1 overflow-y-auto">
          {(data?.data ?? []).map((w: any) => (
            <button
              key={w.id}
              type="button"
              disabled={busy || w.id === team.workspace?.id}
              onClick={async () => {
                setBusy(true);
                try {
                  await api(`/api/admin/teams?id=${team.id}`, 'PATCH', { workspaceId: w.id }, `Moved to ${w.name}`);
                  onDone();
                } catch {
                  setBusy(false);
                }
              }}
              className="flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm hover:bg-gray-50 disabled:opacity-50 dark:border-[#222] dark:hover:bg-[#151515]"
            >
              <span>
                <span className="font-medium">{w.name}</span>
                <span className="block text-xs text-gray-500">
                  {w.owner?.email ?? 'no owner'} · {w.teams} teams · {w.plan?.name}
                </span>
              </span>
              {w.id === team.workspace?.id ? <Badge>current</Badge> : null}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const TeamsPage: NextPageWithLayout = () => {
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [moving, setMoving] = useState<any>(null);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => setPage(1), [debounced]);

  const { data, error, mutate } = useSWR(`/api/admin/teams?search=${encodeURIComponent(debounced)}&page=${page}`, fetcher, { keepPreviousData: true });

  return (
    <>
      <PageHeader title="Teams" description="All teams across all workspaces." />
      <div className="p-6">
        <Card>
          <div className="border-b px-5 py-3 dark:border-[#222]">
            <SearchBox value={search} onChange={setSearch} placeholder="Team, slug or workspace…" />
          </div>
          {error ? (
            <Empty title="Couldn't load teams">{error.message}</Empty>
          ) : !data ? (
            <Spinner />
          ) : data.data.length === 0 ? (
            <Empty title="No teams match" />
          ) : (
            <Table
              head={
                <>
                  <Th>Team</Th>
                  <Th>Workspace</Th>
                  <Th>Owner</Th>
                  <Th>Members</Th>
                  <Th>Content</Th>
                  <Th>Created</Th>
                  <Th />
                </>
              }
            >
              {data.data.map((t: any) => (
                <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-[#151515]">
                  <Td>
                    <p className="font-medium">{t.name}</p>
                    <p className="text-xs text-gray-400">{t.slug}</p>
                  </Td>
                  <Td>
                    {t.workspace ? (
                      <Link href={`/admin/workspaces/${t.workspace.id}`} className="hover:underline">
                        {t.workspace.name}
                      </Link>
                    ) : (
                      <Badge tone="amber">none</Badge>
                    )}
                  </Td>
                  <Td>
                    <UserCell user={t.owner} />
                  </Td>
                  <Td className="tabular-nums">{t.counts.members}</Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">
                    {t.counts.channels} channels · {t.counts.pages} docs · {t.counts.files} files · {t.counts.crmDeals} deals
                  </Td>
                  <Td className="whitespace-nowrap text-xs text-gray-500">{fmtDate(t.createdAt)}</Td>
                  <Td>
                    <Btn size="sm" onClick={() => setMoving(t)}>
                      <ArrowRightLeft className="size-3" /> Move
                    </Btn>
                  </Td>
                </tr>
              ))}
            </Table>
          )}
          {data ? <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
        </Card>
      </div>
      {moving ? (
        <MoveDialog
          team={moving}
          onClose={() => setMoving(null)}
          onDone={() => {
            setMoving(null);
            void mutate();
          }}
        />
      ) : null}
    </>
  );
};

TeamsPage.getLayout = adminLayout;
export default TeamsPage;
