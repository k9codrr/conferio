import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import toast from 'react-hot-toast';
import { Building2, Check, CreditCard, Lock, Plus, Users } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import { cn } from '@/lib/utils';
import Mainsidebar from '@/components/ui/mainSideBar';
import { Header } from '@/components/doc-components/Header';
import { MODULES } from '@/lib/platform/modules';
import useTeams from 'hooks/useTeams';
import { useTeamStore } from 'store/teamStore';
import {
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
  Spinner,
  statusTone,
  Table,
  Td,
  Th,
} from '@/components/platform/ui';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type Tab = 'overview' | 'teams' | 'billing' | 'settings';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'teams', label: 'Teams' },
  { key: 'billing', label: 'Plans & billing' },
  { key: 'settings', label: 'Settings' },
];

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void };
  }
}

function loadRazorpay(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.Razorpay) return Promise.resolve(true);
  return new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = 'https://checkout.razorpay.com/v1/checkout.js';
    s.async = true;
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ d, onTab }: { d: any; onTab: (t: Tab) => void }) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader
          title="Plan"
          actions={
            d.canManage ? (
              <Btn size="sm" variant="primary" onClick={() => onTab('billing')}>
                {d.plan?.priceMonthly ? 'Manage plan' : 'Upgrade'}
              </Btn>
            ) : null
          }
        />
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-semibold">{d.plan?.name ?? 'Free'}</span>
            {d.subscription ? (
              <Badge tone={statusTone(d.subscription.status)}>
                {d.subscription.interval.toLowerCase()} · {d.subscription.status}
              </Badge>
            ) : null}
            {d.workspace.planExpiresAt && d.workspace.planSource === 'MANUAL' ? (
              <Badge tone="violet">until {fmtDate(d.workspace.planExpiresAt)}</Badge>
            ) : null}
          </div>
          {d.planExpired ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              Your previous plan has ended, so the workspace is on the free plan. Renew to restore your limits and modules.
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-3">
            <Meter label="Teams" used={d.usage.teams} limit={d.limits.maxTeams} />
            <Meter label="Seats" used={d.usage.seats} limit={d.limits.maxMembers} />
            <Meter
              label="Storage"
              used={d.usage.storageBytes}
              limit={d.limits.maxStorageGb < 0 ? -1 : d.limits.maxStorageGb * 1024 ** 3}
              format={bytes}
            />
          </div>
          <p className="text-xs text-gray-500">
            Seats count everyone in any team of this workspace once. Client guests are free. {d.usage.pendingInvites} pending invitation
            {d.usage.pendingInvites === 1 ? '' : 's'} hold a seat.
          </p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Modules" description="What this workspace can use" />
        <div className="divide-y dark:divide-[#1e1e1e]">
          {MODULES.map((m) => (
            <div key={m.key} className="flex items-center justify-between px-5 py-2">
              <span className={cn('text-sm', !d.modules[m.key] && 'text-gray-400')}>{m.label}</span>
              {d.modules[m.key] ? <Check className="size-4 text-emerald-500" /> : <Lock className="size-3.5 text-gray-300 dark:text-neutral-600" />}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Teams ────────────────────────────────────────────────────────────────────
function Teams({ d, onChanged }: { d: any; onChanged: () => void }) {
  const router = useRouter();
  const { mutateTeams } = useTeams();
  const setSelectedTeam = useTeamStore((s) => s.setSelectedTeam);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const atLimit = d.limits.maxTeams >= 0 && d.usage.teams >= d.limits.maxTeams;

  const create = async () => {
    setBusy(true);
    try {
      const res = await api<{ data: { id: string; name: string; slug: string } }>(`/api/workspace/${d.workspace.id}/teams`, 'POST', { name }, 'Team created');
      setOpen(false);
      setName('');
      onChanged();
      await mutateTeams();
      setSelectedTeam(res.data);
    } catch {
      /* toast */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader
        title={`Teams (${d.teams.length} of ${limitLabel(d.limits.maxTeams)})`}
        description="Teams share this workspace's plan, seats and billing."
        actions={
          d.canManage ? (
            <Btn variant="primary" size="sm" onClick={() => setOpen(true)} disabled={atLimit} title={atLimit ? 'Team limit reached' : undefined}>
              <Plus className="size-3.5" /> New team
            </Btn>
          ) : null
        }
      />
      {atLimit && d.canManage ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-amber-50 px-5 py-2.5 text-xs text-amber-800 dark:border-[#222] dark:bg-amber-500/10 dark:text-amber-300">
          Your {d.plan?.name} plan allows {limitLabel(d.limits.maxTeams)} team{d.limits.maxTeams === 1 ? '' : 's'}.
          <button type="button" className="font-semibold underline" onClick={() => router.replace({ query: { ...router.query, tab: 'billing' } }, undefined, { shallow: true })}>
            Upgrade to add more
          </button>
        </div>
      ) : null}
      {d.teams.length === 0 ? (
        <Empty title="No teams yet" />
      ) : (
        <Table head={<><Th>Team</Th><Th>Members</Th><Th>Your role</Th><Th>Created</Th><Th /></>}>
          {d.teams.map((t: any) => (
            <tr key={t.id}>
              <Td>
                <p className="font-medium">{t.name}</p>
                <p className="text-xs text-gray-400">{t.slug}</p>
              </Td>
              <Td className="tabular-nums">{t.members}</Td>
              <Td>{t.myRole ? <Badge tone={t.myRole === 'OWNER' ? 'violet' : 'gray'}>{t.myRole.toLowerCase()}</Badge> : <span className="text-xs text-gray-400">not a member</span>}</Td>
              <Td className="text-xs text-gray-500">{fmtDate(t.createdAt)}</Td>
              <Td>
                {t.myRole ? (
                  <div className="flex justify-end gap-1.5">
                    <Btn size="sm" onClick={() => setSelectedTeam({ id: t.id, name: t.name, slug: t.slug })}>
                      Switch to
                    </Btn>
                    <Link href={`/teams/${t.slug}/members`}>
                      <Btn size="sm" variant="ghost">
                        <Users className="size-3.5" /> Members
                      </Btn>
                    </Link>
                  </div>
                ) : null}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New team in {d.workspace.name}</DialogTitle>
            <DialogDescription>You will be the team owner. Members you invite use workspace seats.</DialogDescription>
          </DialogHeader>
          <Field label="Team name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Marketing" autoFocus onKeyDown={(e) => e.key === 'Enter' && name.trim() && create()} />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setOpen(false)}>Cancel</Btn>
            <Btn variant="primary" loading={busy} disabled={!name.trim()} onClick={create}>
              Create team
            </Btn>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Billing ──────────────────────────────────────────────────────────────────
function Billing({ workspaceId, onChanged }: { workspaceId: string; onChanged: () => void }) {
  const { data, mutate } = useSWR(`/api/workspace/${workspaceId}/billing`, fetcher);
  const [interval, setBillingInterval] = useState<'MONTHLY' | 'YEARLY'>('MONTHLY');
  const [busy, setBusy] = useState<string | null>(null);
  const b = data?.data;

  const refresh = useCallback(async () => {
    await mutate();
    onChanged();
  }, [mutate, onChanged]);

  if (!b) return <Spinner />;

  const live = b.activeSubscription && ['active', 'authenticated', 'pending'].includes(b.activeSubscription.status) ? b.activeSubscription : null;
  const isCurrent = (p: any) =>
    b.currentPlan?.id === p.id && (p.priceMonthly === 0 || !live || live.interval === interval);

  const choose = async (plan: any) => {
    setBusy(plan.id);
    try {
      const res = await api(`/api/workspace/${workspaceId}/billing/subscribe`, 'POST', { planId: plan.id, interval });
      if (res.data.free) {
        toast.success(res.data.endsAt ? `Auto-renew stopped. Your plan stays until ${fmtDate(res.data.endsAt)}.` : 'Switched plan');
        await refresh();
        return;
      }
      const ok = await loadRazorpay();
      if (!ok || !window.Razorpay) {
        if (res.data.shortUrl) {
          window.open(res.data.shortUrl, '_blank', 'noopener');
          toast('Complete the payment in the new tab, then come back here.');
        } else toast.error('Could not load Razorpay checkout');
        return;
      }
      const rzp = new window.Razorpay({
        key: res.data.keyId,
        subscription_id: res.data.subscriptionId,
        name: 'Conferio',
        description: `${res.data.plan.name} · ${res.data.plan.interval === 'YEARLY' ? 'yearly' : 'monthly'} · ${res.data.workspaceName}`,
        prefill: res.data.prefill,
        notes: { workspaceId },
        theme: { color: '#2647eb' },
        handler: async (resp: Record<string, string>) => {
          try {
            await api(`/api/workspace/${workspaceId}/billing/verify`, 'POST', resp, `You're on ${res.data.plan.name}!`);
            await refresh();
          } catch {
            toast('Payment received. It will be confirmed shortly by Razorpay.');
            setTimeout(() => void refresh(), 5000);
          }
        },
        modal: { ondismiss: () => setBusy(null) },
      });
      rzp.on('payment.failed', (r: any) => toast.error(r?.error?.description || 'Payment failed'));
      rzp.open();
    } catch {
      /* toast */
    } finally {
      setBusy(null);
    }
  };

  const cancel = async () => {
    if (!window.confirm('Turn off auto-renew? Your plan stays active until the end of the paid period.')) return;
    setBusy('cancel');
    try {
      await api(`/api/workspace/${workspaceId}/billing/cancel`, 'POST', {}, 'Auto-renew turned off');
      await refresh();
    } catch {
      /* toast */
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      {!b.configured ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">
          Online payments are not set up on this platform yet. Contact the platform admin to change plans.
        </div>
      ) : null}

      {live ? (
        <Card>
          <CardHeader
            title="Current subscription"
            actions={
              b.canManage && !live.cancelAtPeriodEnd ? (
                <Btn size="sm" loading={busy === 'cancel'} onClick={cancel}>
                  Cancel auto-renew
                </Btn>
              ) : null
            }
          />
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 text-sm">
            <span className="font-semibold">{live.plan.name}</span>
            <Badge tone={statusTone(live.status)}>{live.status}</Badge>
            <span className="text-gray-500">Billed {live.interval.toLowerCase()}</span>
            {live.currentEnd ? (
              <span className="text-gray-500">
                {live.cancelAtPeriodEnd ? 'Ends' : 'Renews'} {fmtDate(live.currentEnd)}
              </span>
            ) : null}
            {live.status === 'pending' ? (
              <span className="text-xs text-amber-600">Last renewal failed — Razorpay is retrying. Update your payment method from the Razorpay email.</span>
            ) : null}
          </div>
        </Card>
      ) : null}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Plans</h3>
        <div className="flex rounded-lg border p-0.5 text-xs font-medium dark:border-[#2a2a2a]">
          {(['MONTHLY', 'YEARLY'] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setBillingInterval(v)}
              className={cn(
                'rounded-md px-3 py-1',
                interval === v ? 'bg-yellow-400 text-black dark:bg-[#2647eb] dark:text-white' : 'text-gray-500 hover:text-black dark:hover:text-white'
              )}
            >
              {v === 'MONTHLY' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {b.plans.map((p: any) => {
          const price = interval === 'YEARLY' ? p.priceYearly : p.priceMonthly;
          const saving = interval === 'YEARLY' && p.priceMonthly > 0 ? Math.round((1 - p.priceYearly / (p.priceMonthly * 12)) * 100) : 0;
          const current = isCurrent(p);
          return (
            <Card key={p.id} className={cn('flex flex-col p-5', current && 'ring-2 ring-yellow-400 dark:ring-[#2647eb]')}>
              <div className="flex items-center justify-between">
                <p className="font-semibold">{p.name}</p>
                {current ? <Badge tone="green">Current</Badge> : saving > 0 ? <Badge tone="blue">Save {saving}%</Badge> : null}
              </div>
              {p.description ? <p className="mt-1 text-xs text-gray-500">{p.description}</p> : null}
              <p className="mt-3 text-2xl font-semibold">
                {price ? money(price, p.currency) : 'Free'}
                {price ? <span className="text-sm font-normal text-gray-500"> /{interval === 'YEARLY' ? 'yr' : 'mo'}</span> : null}
              </p>
              <ul className="mt-4 space-y-1.5 text-xs">
                {(p.features.length ? p.features : [`${limitLabel(p.maxTeams)} teams`, `${limitLabel(p.maxMembers)} seats`]).map((f: string) => (
                  <li key={f} className="flex items-start gap-1.5">
                    <Check className="mt-0.5 size-3.5 flex-shrink-0 text-emerald-500" /> {f}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-gray-500">
                {p.modules.length} modules: {p.modules.map((k: string) => MODULES.find((m) => m.key === k)?.label ?? k).join(', ')}
              </p>
              <div className="mt-auto pt-4">
                {b.canManage ? (
                  <Btn
                    variant={current ? 'default' : 'primary'}
                    className="w-full"
                    disabled={current || (!b.configured && price > 0)}
                    loading={busy === p.id}
                    onClick={() => choose(p)}
                  >
                    {current ? 'Current plan' : price ? (b.currentPlan && b.currentPlan.priceMonthly > p.priceMonthly ? 'Switch' : 'Upgrade') : 'Downgrade'}
                  </Btn>
                ) : (
                  <p className="text-center text-xs text-gray-500">Ask a workspace admin to change plans</p>
                )}
              </div>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader title="Payment history" />
        {b.payments.length === 0 ? (
          <Empty title="No payments yet" />
        ) : (
          <Table head={<><Th>Date</Th><Th>Amount</Th><Th>Method</Th><Th>Status</Th><Th>Reference</Th></>}>
            {b.payments.map((p: any) => (
              <tr key={p.id}>
                <Td className="text-xs">{fmtDate(p.createdAt, true)}</Td>
                <Td className="font-medium tabular-nums">{money(p.amount, p.currency)}</Td>
                <Td className="text-xs">{p.method ?? '—'}</Td>
                <Td>
                  <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                </Td>
                <Td className="text-xs text-gray-500">
                  <code>{p.razorpayPaymentId}</code>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

// ── Settings ─────────────────────────────────────────────────────────────────
function Settings({ d, onChanged }: { d: any; onChanged: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(d.workspace.name);
  const [email, setEmail] = useState(d.workspace.billingEmail ?? '');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Workspace details" />
        <div className="space-y-3 p-5">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!d.canManage} />
          </Field>
          <Field label="Billing email" hint="Receipts and renewal notices from Razorpay go here.">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={!d.canManage} />
          </Field>
          {d.canManage ? (
            <Btn
              variant="primary"
              loading={busy === 'save'}
              onClick={async () => {
                setBusy('save');
                try {
                  await api(`/api/workspace/${d.workspace.id}`, 'PATCH', { name, billingEmail: email || null }, 'Saved');
                  onChanged();
                } catch {
                  /* toast */
                } finally {
                  setBusy(null);
                }
              }}
            >
              Save
            </Btn>
          ) : (
            <p className="text-xs text-gray-500">Only workspace owners and team admins can edit these.</p>
          )}
          <p className="pt-2 text-xs text-gray-500">
            Owner: {d.workspace.owner?.name ?? '—'} · created {fmtDate(d.workspace.createdAt)}
          </p>
        </div>
      </Card>
      <Card>
        <CardHeader title="Create another workspace" description="A separate tenant with its own teams, plan and billing — e.g. for another company." />
        <div className="space-y-3 p-5">
          <Field label="Workspace name">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Acme Inc." />
          </Field>
          <Btn
            loading={busy === 'new'}
            disabled={newName.trim().length < 2}
            onClick={async () => {
              setBusy('new');
              try {
                const res = await api<{ data: { id: string } }>('/api/workspace', 'POST', { name: newName }, 'Workspace created');
                setNewName('');
                router.replace({ query: { ws: res.data.id, tab: 'teams' } }, undefined, { shallow: true });
              } catch {
                /* toast */
              } finally {
                setBusy(null);
              }
            }}
          >
            <Building2 className="size-4" /> Create workspace
          </Btn>
        </div>
      </Card>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const router = useRouter();
  const selectedTeam = useTeamStore((s) => s.selectedTeam);
  const tab = (TABS.some((t) => t.key === router.query.tab) ? router.query.tab : 'overview') as Tab;
  const setTab = (t: Tab) => router.replace({ query: { ...router.query, tab: t } }, undefined, { shallow: true });

  const { data: list, mutate: mutateList } = useSWR(
    `/api/workspace${selectedTeam?.slug ? `?teamSlug=${encodeURIComponent(selectedTeam.slug)}` : ''}`,
    fetcher
  );
  const wsId = (router.query.ws as string) || list?.currentWorkspaceId || null;
  const { data, error, mutate } = useSWR(wsId ? `/api/workspace/${wsId}` : null, fetcher);
  const d = data?.data;

  const onChanged = useCallback(() => {
    void mutate();
    void mutateList();
  }, [mutate, mutateList]);

  const workspaces = useMemo(() => list?.data ?? [], [list]);

  // Razorpay hosted-page return (?billing=done) → refresh.
  useEffect(() => {
    if (router.query.billing === 'done') onChanged();
  }, [router.query.billing, onChanged]);

  return (
    <div className="flex h-screen max-h-screen !overflow-y-hidden bg-[#F9F9F9] dark:bg-[#090909]">
      <Mainsidebar />
      <div className="flex w-full min-w-0 flex-col">
        <Header />
        <div className="border-b bg-white px-6 dark:border-[#222] dark:bg-[#111111]">
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-yellow-400 text-black dark:bg-[#2647eb] dark:text-white">
                <Building2 className="size-5" />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">{d?.workspace.name ?? 'Workspace'}</h1>
                <p className="text-xs text-muted-foreground">
                  {d ? `${d.plan?.name ?? 'Free'} plan · ${d.teams.length} team${d.teams.length === 1 ? '' : 's'} · ${d.usage.seats} seat${d.usage.seats === 1 ? '' : 's'} used` : ' '}
                </p>
              </div>
            </div>
            {workspaces.length > 1 ? (
              <select
                value={wsId ?? ''}
                onChange={(e) => router.replace({ query: { ws: e.target.value, tab } }, undefined, { shallow: true })}
                className="h-9 rounded-lg border bg-white px-2.5 text-sm dark:border-[#2a2a2a] dark:bg-[#0d0d0d]"
                aria-label="Switch workspace"
              >
                {workspaces.map((w: any) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.plan?.name ?? 'Free'}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="mt-3 flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={cn(
                  'flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 pb-2.5 text-sm transition-colors',
                  tab === t.key ? 'border-black font-medium dark:border-white' : 'border-transparent text-gray-500 hover:text-black dark:hover:text-white'
                )}
              >
                {t.key === 'billing' ? <CreditCard className="size-3.5" /> : null}
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-6">
          {list && !wsId ? (
            <Empty title="You're not in a workspace yet">Create a team or ask to be invited to one.</Empty>
          ) : error ? (
            <Empty title="Couldn't load this workspace">{error.message}</Empty>
          ) : !d ? (
            <Spinner />
          ) : (
            <>
              {d.workspace.status === 'SUSPENDED' ? (
                <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300">
                  This workspace is suspended{d.workspace.suspendedReason ? `: ${d.workspace.suspendedReason}` : ''}. Contact support to restore access.
                </div>
              ) : null}
              {tab === 'overview' ? <Overview d={d} onTab={setTab} /> : null}
              {tab === 'teams' ? <Teams d={d} onChanged={onChanged} /> : null}
              {tab === 'billing' ? <Billing workspaceId={d.workspace.id} onChanged={onChanged} /> : null}
              {tab === 'settings' ? <Settings d={d} onChanged={onChanged} /> : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
