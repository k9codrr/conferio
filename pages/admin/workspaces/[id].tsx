import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import { Ban, CheckCircle2, RefreshCw, Trash2 } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { MODULES, type ModuleKey } from '@/lib/platform/modules';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import {
  ago,
  api,
  Badge,
  Btn,
  bytes,
  Card,
  CardHeader,
  Empty,
  Field,
  fmtDate,
  Input,
  limitLabel,
  Meter,
  money,
  Select,
  Spinner,
  statusTone,
  Table,
  Td,
  Th,
  UserCell,
} from '@/components/platform/ui';
import { cn } from '@/lib/utils';

type Tri = 'inherit' | 'on' | 'off';

function TriToggle({ value, onChange }: { value: Tri; onChange: (v: Tri) => void }) {
  return (
    <div className="flex rounded-lg border p-0.5 text-[11px] font-medium dark:border-[#2a2a2a]">
      {(['inherit', 'on', 'off'] as Tri[]).map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            'rounded-md px-2 py-0.5 capitalize transition-colors',
            value === v
              ? v === 'on'
                ? 'bg-emerald-500 text-white'
                : v === 'off'
                  ? 'bg-red-500 text-white'
                  : 'bg-gray-200 text-black dark:bg-neutral-700 dark:text-white'
              : 'text-gray-500 hover:text-black dark:hover:text-white'
          )}
        >
          {v === 'inherit' ? 'Plan' : v}
        </button>
      ))}
    </div>
  );
}

const toLocalInput = (d: string | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

const WorkspaceDetail: NextPageWithLayout = () => {
  const router = useRouter();
  const id = router.query.id as string | undefined;
  const { data, error, mutate } = useSWR(id ? `/api/admin/workspaces/${id}` : null, fetcher);
  const { data: plansRes } = useSWR('/api/admin/plans', fetcher);
  const d = data?.data;

  const [overrides, setOverrides] = useState<Partial<Record<ModuleKey, boolean>>>({});
  const [limits, setLimits] = useState<{ maxTeams: string; maxMembers: string; maxStorageGb: string }>({ maxTeams: '', maxMembers: '', maxStorageGb: '' });
  const [planId, setPlanId] = useState('');
  const [expires, setExpires] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!d) return;
    setOverrides(d.overrides ?? {});
    const lo = (d.workspace.limitOverrides ?? {}) as Record<string, number>;
    setLimits({
      maxTeams: lo.maxTeams?.toString() ?? '',
      maxMembers: lo.maxMembers?.toString() ?? '',
      maxStorageGb: lo.maxStorageGb?.toString() ?? '',
    });
    setPlanId(d.workspace.planId ?? '');
    setExpires(toLocalInput(d.workspace.planExpiresAt));
    setName(d.workspace.name);
  }, [d]);

  if (error) return <Empty title="Couldn't load workspace">{error.message}</Empty>;
  if (!d) return <Spinner />;
  const ws = d.workspace;

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await fn();
      await mutate();
    } catch {
      /* toast shown */
    } finally {
      setBusy(null);
    }
  };

  const patch = (body: unknown, msg: string) => api(`/api/admin/workspaces/${ws.id}`, 'PATCH', body, msg);

  const saveLimits = () => {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(limits)) if (v.trim() !== '') out[k] = parseInt(v, 10);
    return run('limits', () => patch({ limitOverrides: out }, 'Limits saved'));
  };

  const suspend = () => {
    const reason = window.prompt('Reason for suspending this workspace (shown to its members):', ws.suspendedReason ?? '');
    if (reason === null) return;
    return run('status', () => patch({ status: 'SUSPENDED', suspendedReason: reason || null }, 'Workspace suspended'));
  };

  return (
    <>
      <PageHeader
        back={{ href: '/admin/workspaces', label: 'Workspaces' }}
        title={
          <span className="flex items-center gap-2">
            {ws.name} <Badge tone={statusTone(ws.status)}>{ws.status.toLowerCase()}</Badge>
          </span>
        }
        description={`${ws.slug} · created ${fmtDate(ws.createdAt)}`}
        actions={
          <>
            {ws.status === 'ACTIVE' ? (
              <Btn variant="danger" loading={busy === 'status'} onClick={suspend}>
                <Ban className="size-4" /> Suspend
              </Btn>
            ) : (
              <Btn loading={busy === 'status'} onClick={() => run('status', () => patch({ status: 'ACTIVE' }, 'Workspace reactivated'))}>
                <CheckCircle2 className="size-4" /> Reactivate
              </Btn>
            )}
            {d.teams.length === 0 ? (
              <Btn
                variant="ghost"
                onClick={async () => {
                  if (!window.confirm('Delete this empty workspace? This cannot be undone.')) return;
                  await api(`/api/admin/workspaces/${ws.id}`, 'DELETE', undefined, 'Workspace deleted');
                  router.push('/admin/workspaces');
                }}
              >
                <Trash2 className="size-4" /> Delete
              </Btn>
            ) : null}
          </>
        }
      />

      <div className="space-y-5 p-6">
        {ws.status === 'SUSPENDED' ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
            Suspended{ws.suspendedReason ? `: ${ws.suspendedReason}` : ''}. All modules are off and no teams can be created.
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader title="Plan & billing" description={d.planExpired ? 'Assigned plan has expired — the default plan applies.' : undefined} />
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Effective plan</p>
                <p className="mt-0.5 text-lg font-semibold">{d.plan?.name ?? '—'}</p>
                <p className="text-xs text-gray-500">
                  Source: {ws.planSource === 'SUBSCRIPTION' ? 'Razorpay subscription' : 'set by admin'}
                  {ws.planExpiresAt ? ` · until ${fmtDate(ws.planExpiresAt)}` : ' · no expiry'}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Subscription</p>
                {d.subscription ? (
                  <div className="mt-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{d.subscription.plan.name}</span>
                      <Badge tone={statusTone(d.subscription.status)}>{d.subscription.status}</Badge>
                      <Badge>{d.subscription.interval.toLowerCase()}</Badge>
                      {d.subscription.cancelAtPeriodEnd ? <Badge tone="amber">cancels at period end</Badge> : null}
                    </div>
                    <p className="text-xs text-gray-500">
                      {d.subscription.currentEnd ? `Renews ${fmtDate(d.subscription.currentEnd)}` : 'Awaiting first payment'} ·{' '}
                      <code className="text-[11px]">{d.subscription.razorpaySubscriptionId}</code>
                    </p>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <Btn size="sm" loading={busy === 'sync'} onClick={() => run('sync', () => api(`/api/admin/workspaces/${ws.id}/subscription`, 'POST', { action: 'sync' }, 'Synced from Razorpay'))}>
                        <RefreshCw className="size-3" /> Sync
                      </Btn>
                      {!d.subscription.cancelAtPeriodEnd ? (
                        <Btn
                          size="sm"
                          loading={busy === 'cancel'}
                          onClick={() => {
                            if (!window.confirm('Stop auto-renew? The plan stays until the paid period ends.')) return;
                            run('cancel', () => api(`/api/admin/workspaces/${ws.id}/subscription`, 'POST', { action: 'cancel' }, 'Auto-renew cancelled'));
                          }}
                        >
                          Cancel at period end
                        </Btn>
                      ) : null}
                      <Btn
                        size="sm"
                        variant="danger"
                        loading={busy === 'cancelNow'}
                        onClick={() => {
                          if (!window.confirm('Cancel immediately and drop the workspace to the default plan now?')) return;
                          run('cancelNow', () => api(`/api/admin/workspaces/${ws.id}/subscription`, 'POST', { action: 'cancel', immediate: true }, 'Subscription cancelled'));
                        }}
                      >
                        Cancel now
                      </Btn>
                    </div>
                  </div>
                ) : (
                  <p className="mt-1 text-sm text-gray-500">No active subscription</p>
                )}
              </div>
            </div>
            <div className="grid gap-3 border-t p-5 dark:border-[#222] sm:grid-cols-[1fr_180px_auto] sm:items-end">
              <Field label="Assign plan manually" hint="Overrides billing until the expiry date. Leave expiry empty for no expiry.">
                <Select value={planId} onChange={(e) => setPlanId(e.target.value)} className="w-full">
                  <option value="">— Default plan —</option>
                  {(plansRes?.data ?? []).map((p: any) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.isActive ? '' : '(inactive)'}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Expires">
                <Input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
              </Field>
              <Btn
                variant="primary"
                loading={busy === 'plan'}
                onClick={() =>
                  run('plan', () =>
                    patch(
                      { planId: planId || null, planExpiresAt: expires ? new Date(`${expires}T23:59:59`).toISOString() : null },
                      'Plan updated'
                    )
                  )
                }
              >
                Save plan
              </Btn>
            </div>
          </Card>

          <Card>
            <CardHeader title="Usage" />
            <div className="space-y-4 p-5">
              <Meter label="Teams" used={d.usage.teams} limit={d.limits.maxTeams} />
              <Meter label="Seats" used={d.usage.seats} limit={d.limits.maxMembers} />
              <Meter
                label="Storage"
                used={d.usage.storageBytes}
                limit={d.limits.maxStorageGb < 0 ? -1 : d.limits.maxStorageGb * 1024 ** 3}
                format={bytes}
              />
              <p className="text-xs text-gray-500">
                {d.usage.pendingInvites} pending invites · {d.usage.clients} client guests (not counted as seats)
              </p>
            </div>
          </Card>
        </div>

        <div className="grid gap-5 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader
              title="Modules"
              description="“Plan” follows the workspace plan; On/Off overrides it for this workspace only. Modules switched off platform-wide stay off."
              actions={
                <Btn variant="primary" size="sm" loading={busy === 'modules'} onClick={() => run('modules', () => patch({ moduleOverrides: overrides }, 'Modules saved'))}>
                  Save modules
                </Btn>
              }
            />
            <div className="divide-y dark:divide-[#1e1e1e]">
              {MODULES.map((m) => {
                const o = overrides[m.key];
                const value: Tri = o === true ? 'on' : o === false ? 'off' : 'inherit';
                const effective = d.modules[m.key];
                const globalOff = d.globalModules[m.key] === false;
                return (
                  <div key={m.key} className="flex flex-wrap items-center justify-between gap-3 px-5 py-2.5">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {m.label}
                        {effective ? <Badge tone="green">on</Badge> : <Badge>off</Badge>}
                        {globalOff ? <Badge tone="red">off platform-wide</Badge> : null}
                      </p>
                      <p className="text-xs text-gray-500">
                        {m.description} · plan {d.plan?.modules?.includes(m.key) ? 'includes' : 'excludes'} it
                      </p>
                    </div>
                    <TriToggle
                      value={value}
                      onChange={(v) =>
                        setOverrides((prev) => {
                          const next = { ...prev };
                          if (v === 'inherit') delete next[m.key];
                          else next[m.key] = v === 'on';
                          return next;
                        })
                      }
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          <div className="space-y-5">
            <Card>
              <CardHeader title="Limit overrides" description="Empty = use the plan. -1 = unlimited." />
              <div className="space-y-3 p-5">
                {(
                  [
                    ['maxTeams', 'Max teams', d.plan?.maxTeams],
                    ['maxMembers', 'Max seats', d.plan?.maxMembers],
                    ['maxStorageGb', 'Storage (GB)', d.plan?.maxStorageGb],
                  ] as const
                ).map(([k, label, planVal]) => (
                  <Field key={k} label={`${label} — plan: ${limitLabel(planVal)}`}>
                    <Input
                      type="number"
                      min={-1}
                      value={limits[k]}
                      placeholder="Use plan"
                      onChange={(e) => setLimits((l) => ({ ...l, [k]: e.target.value }))}
                    />
                  </Field>
                ))}
                <Btn variant="primary" className="w-full" loading={busy === 'limits'} onClick={saveLimits}>
                  Save limits
                </Btn>
              </div>
            </Card>
            <Card>
              <CardHeader title="Details" />
              <div className="space-y-3 p-5">
                <Field label="Name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                <Btn className="w-full" loading={busy === 'name'} disabled={name.trim() === ws.name} onClick={() => run('name', () => patch({ name }, 'Renamed'))}>
                  Rename
                </Btn>
                <div className="pt-1 text-xs text-gray-500">
                  <p className="mb-1 font-medium text-gray-600 dark:text-neutral-400">Owner</p>
                  <UserCell user={ws.owner} />
                  <p className="mt-2">Billing email: {ws.billingEmail ?? '—'}</p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        <Card>
          <CardHeader title={`Teams (${d.teams.length})`} />
          {d.teams.length === 0 ? (
            <Empty title="No teams in this workspace" />
          ) : (
            <div className="divide-y dark:divide-[#1e1e1e]">
              {d.teams.map((t: any) => (
                <details key={t.id} className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3 hover:bg-gray-50 dark:hover:bg-[#151515]">
                    <div>
                      <p className="text-sm font-medium">{t.name}</p>
                      <p className="text-xs text-gray-400">
                        {t.slug} · {t.members.length} members · created {fmtDate(t.createdAt)}
                      </p>
                    </div>
                    <span className="text-xs text-gray-400 group-open:hidden">Show members</span>
                    <span className="hidden text-xs text-gray-400 group-open:inline">Hide</span>
                  </summary>
                  <div className="grid gap-2 bg-gray-50/50 px-5 py-3 dark:bg-[#0d0d0d] sm:grid-cols-2 lg:grid-cols-3">
                    {t.members.map((m: any) => (
                      <Link key={m.user.id} href={`/admin/users/${m.user.id}`} className="flex items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 hover:border-gray-300 dark:border-[#222] dark:bg-[#111]">
                        <UserCell user={m.user} />
                        <Badge tone={m.role === 'OWNER' ? 'violet' : m.role === 'ADMIN' ? 'blue' : 'gray'}>{m.role.toLowerCase()}</Badge>
                      </Link>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          )}
        </Card>

        <div className="grid gap-5 lg:grid-cols-2">
          <Card>
            <CardHeader title="Payments" />
            {d.payments.length === 0 ? (
              <Empty title="No payments" />
            ) : (
              <Table head={<><Th>Date</Th><Th>Amount</Th><Th>Status</Th><Th>Payment ID</Th></>}>
                {d.payments.map((p: any) => (
                  <tr key={p.id}>
                    <Td className="whitespace-nowrap text-xs">{fmtDate(p.createdAt, true)}</Td>
                    <Td className="font-medium tabular-nums">{money(p.amount, p.currency)}</Td>
                    <Td>
                      <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                    </Td>
                    <Td className="text-xs text-gray-500">
                      <code>{p.razorpayPaymentId}</code>
                      {p.errorDescription ? <p className="text-red-500">{p.errorDescription}</p> : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
          <Card>
            <CardHeader title="History" description="Admin and billing events for this workspace" />
            {d.auditLog.length === 0 ? (
              <Empty title="No events yet" />
            ) : (
              <div className="max-h-96 divide-y overflow-y-auto dark:divide-[#1e1e1e]">
                {d.auditLog.map((a: any) => (
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

WorkspaceDetail.getLayout = adminLayout;
export default WorkspaceDetail;
