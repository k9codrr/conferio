import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';
import { Ban, CheckCircle2, LogOut, ShieldCheck, ShieldOff } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { ago, api, Badge, Btn, Card, CardHeader, Empty, fmtDate, Spinner, statusTone, UserCell } from '@/components/platform/ui';
import { MODULE_BY_KEY, matchPath } from '@/lib/platform/modules';

const UserDetail: NextPageWithLayout = () => {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const { data: session } = useSession();
  const { data, error, mutate } = useSWR(id ? `/api/admin/users/${id}` : null, fetcher);
  const [busy, setBusy] = useState<string | null>(null);
  const u = data?.data;

  if (error) return <Empty title="Couldn't load user">{error.message}</Empty>;
  if (!u) return <Spinner />;
  const isSelf = session?.user?.id === u.id;

  const act = async (key: string, body: unknown, msg: string) => {
    setBusy(key);
    try {
      await api(`/api/admin/users/${u.id}`, 'PATCH', body, msg);
      await mutate();
    } catch {
      /* toast shown */
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        back={{ href: '/admin/users', label: 'Users' }}
        title={<UserCell user={u} />}
        description={`Joined ${fmtDate(u.createdAt)} · ${u.sessions} active session${u.sessions === 1 ? '' : 's'}`}
        actions={
          <>
            {u.isPlatformAdmin ? (
              <Btn loading={busy === 'admin'} disabled={isSelf} onClick={() => act('admin', { isPlatformAdmin: false }, 'Admin access removed')}>
                <ShieldOff className="size-4" /> Remove admin
              </Btn>
            ) : (
              <Btn
                loading={busy === 'admin'}
                onClick={() => {
                  if (window.confirm(`Give ${u.email} full platform admin access?`)) act('admin', { isPlatformAdmin: true }, 'Admin access granted');
                }}
              >
                <ShieldCheck className="size-4" /> Make admin
              </Btn>
            )}
            <Btn loading={busy === 'signout'} onClick={() => act('signout', { signOut: true }, 'Signed out of all sessions')}>
              <LogOut className="size-4" /> Sign out everywhere
            </Btn>
            {u.suspendedAt ? (
              <Btn loading={busy === 'suspend'} onClick={() => act('suspend', { suspended: false }, 'Account reactivated')}>
                <CheckCircle2 className="size-4" /> Reactivate
              </Btn>
            ) : (
              <Btn
                variant="danger"
                disabled={isSelf}
                loading={busy === 'suspend'}
                onClick={() => {
                  const reason = window.prompt('Reason for suspending this account:');
                  if (reason !== null) act('suspend', { suspended: true, suspendedReason: reason || null }, 'Account suspended');
                }}
              >
                <Ban className="size-4" /> Suspend
              </Btn>
            )}
          </>
        }
      />
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap gap-1.5">
          {u.isPlatformAdmin ? <Badge tone="violet">platform admin</Badge> : null}
          {u.envAdmin ? <Badge tone="violet">admin via PLATFORM_ADMIN_EMAILS</Badge> : null}
          {u.suspendedAt ? (
            <Badge tone="red">
              suspended {ago(u.suspendedAt)}
              {u.suspendedReason ? ` — ${u.suspendedReason}` : ''}
            </Badge>
          ) : (
            <Badge tone="green">active</Badge>
          )}
          {u.emailVerified ? <Badge>email verified</Badge> : <Badge tone="amber">email not verified</Badge>}
          {u.username ? <Badge>@{u.username}</Badge> : null}
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title={`Team memberships (${u.teamMembers.length})`} />
            {u.teamMembers.length === 0 ? (
              <Empty title="Not in any team" />
            ) : (
              <div className="divide-y dark:divide-[#1e1e1e]">
                {u.teamMembers.map((m: any) => (
                  <div key={m.team.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.team.name}</p>
                      <p className="truncate text-xs text-gray-500">
                        {m.team.workspace ? (
                          <Link href={`/admin/workspaces/${m.team.workspace.id}`} className="hover:underline">
                            {m.team.workspace.name}
                          </Link>
                        ) : (
                          'no workspace'
                        )}{' '}
                        · joined {fmtDate(m.createdAt)}
                      </p>
                    </div>
                    <Badge tone={m.role === 'OWNER' ? 'violet' : m.role === 'ADMIN' ? 'blue' : 'gray'}>{m.role.toLowerCase()}</Badge>
                  </div>
                ))}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title={`Workspaces owned (${u.ownedWorkspaces.length})`} />
            {u.ownedWorkspaces.length === 0 ? (
              <Empty title="Owns no workspaces" />
            ) : (
              <div className="divide-y dark:divide-[#1e1e1e]">
                {u.ownedWorkspaces.map((w: any) => (
                  <Link key={w.id} href={`/admin/workspaces/${w.id}`} className="flex items-center justify-between px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151515]">
                    <span className="text-sm font-medium">{w.name}</span>
                    <Badge tone={statusTone(w.status)}>{w.status.toLowerCase()}</Badge>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Recent activity" description="Pages this user opened most recently" />
            {u.routeViewSessions.length === 0 ? (
              <Empty title="No tracked activity" />
            ) : (
              <div className="max-h-96 divide-y overflow-y-auto dark:divide-[#1e1e1e]">
                {u.routeViewSessions.map((s: any, i: number) => {
                  const mod = matchPath(s.route.split('?')[0], 'pages')?.module;
                  return (
                    <div key={i} className="flex items-center justify-between gap-3 px-5 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm">{s.routeLabel || s.route}</p>
                        <p className="truncate text-xs text-gray-400">
                          {s.team?.name ?? '—'}
                          {mod ? ` · ${MODULE_BY_KEY[mod].label}` : ''}
                        </p>
                      </div>
                      <span className="flex-shrink-0 text-xs text-gray-400">{ago(s.startedAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
          <Card>
            <CardHeader title="Audit trail" description="Admin actions on or by this user" />
            {u.auditLog.length === 0 ? (
              <Empty title="Nothing logged" />
            ) : (
              <div className="max-h-96 divide-y overflow-y-auto dark:divide-[#1e1e1e]">
                {u.auditLog.map((a: any) => (
                  <div key={a.id} className="px-5 py-2.5">
                    <p className="text-sm">
                      <code className="rounded bg-gray-100 px-1 text-[11px] dark:bg-neutral-800">{a.action}</code>{' '}
                      <span className="text-gray-500">by {a.actor?.name ?? 'system'}</span>
                    </p>
                    <p className="text-xs text-gray-400">{ago(a.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
};

UserDetail.getLayout = adminLayout;
export default UserDetail;
