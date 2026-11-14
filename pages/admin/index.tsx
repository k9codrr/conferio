import React from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Activity, AlertTriangle, Building2, CreditCard, IndianRupee, Radio, Users, UsersRound } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { ago, Badge, Card, CardHeader, Empty, money, Spinner, Stat, statusTone, UserCell } from '@/components/platform/ui';
import { MODULE_BY_KEY, type ModuleKey } from '@/lib/platform/modules';

type Point = { day: string; value: number };

function TrendChart({ data, money: isMoney }: { data: Point[]; money?: boolean }) {
  return (
    <div className="h-48 px-2 pb-3 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
          <defs>
            <linearGradient id={isMoney ? 'gRev' : 'gSign'} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={isMoney ? '#10b981' : '#3b82f6'} stopOpacity={0.3} />
              <stop offset="100%" stopColor={isMoney ? '#10b981' : '#3b82f6'} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} strokeOpacity={0.12} />
          <XAxis
            dataKey="day"
            tickFormatter={(d: string) => d.slice(5)}
            tick={{ fontSize: 10, fill: '#888' }}
            tickLine={false}
            axisLine={false}
            interval={6}
          />
          <YAxis
            tick={{ fontSize: 10, fill: '#888' }}
            tickLine={false}
            axisLine={false}
            width={isMoney ? 56 : 28}
            allowDecimals={false}
            tickFormatter={(v: number) => (isMoney ? money(v, 'INR', true) : String(v))}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, borderRadius: 8 }}
            labelFormatter={(d: string) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
            formatter={(v: number) => [isMoney ? money(v) : v, isMoney ? 'Revenue' : 'Count']}
          />
          <Area
            type="monotone"
            dataKey="value"
            stroke={isMoney ? '#10b981' : '#3b82f6'}
            strokeWidth={2}
            fill={`url(#${isMoney ? 'gRev' : 'gSign'})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function BarList({ rows }: { rows: { label: string; value: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="space-y-2.5 p-5">
      {rows.map((r) => (
        <div key={r.label} className="space-y-1">
          <div className="flex justify-between text-xs">
            <span className="text-gray-600 dark:text-neutral-400">{r.label}</span>
            <span className="font-semibold tabular-nums">{r.value.toLocaleString('en-IN')}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-100 dark:bg-neutral-800">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

const AdminOverview: NextPageWithLayout = () => {
  const { data, error } = useSWR('/api/admin/overview', fetcher, { refreshInterval: 60_000 });
  const o = data?.data;

  return (
    <>
      <PageHeader title="Platform overview" description="Everything happening across workspaces, teams and billing." />
      {error ? (
        <Empty title="Couldn't load the overview">{String(error.message)}</Empty>
      ) : !o ? (
        <Spinner />
      ) : (
        <div className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="MRR" value={money(o.kpis.mrr)} hint={`${o.kpis.activeSubscriptions} active subscriptions`} icon={IndianRupee} tone="good" />
            <Stat label="Revenue (30d)" value={money(o.kpis.revenue30)} hint={`${money(o.kpis.revenueAll)} all time`} icon={CreditCard} />
            <Stat label="Users" value={o.kpis.users.toLocaleString('en-IN')} hint={`+${o.kpis.newUsers7} this week · +${o.kpis.newUsers30} in 30d`} icon={Users} />
            <Stat label="Online now" value={o.kpis.onlineNow} hint="active in the last 15 min" icon={Radio} tone="good" />
            <Stat label="Workspaces" value={o.kpis.workspaces} hint={`${o.kpis.suspendedWorkspaces} suspended`} icon={Building2} />
            <Stat label="Teams" value={o.kpis.teams} icon={UsersRound} />
            <Stat
              label="Failed payments (30d)"
              value={o.kpis.failedPayments30}
              icon={AlertTriangle}
              tone={o.kpis.failedPayments30 ? 'bad' : 'default'}
            />
            <Stat label="Suspended users" value={o.kpis.suspendedUsers} icon={Activity} tone={o.kpis.suspendedUsers ? 'warn' : 'default'} />
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Card>
              <CardHeader title="Sign-ups" description="New users per day, last 30 days" />
              <TrendChart data={o.charts.signups} />
            </Card>
            <Card>
              <CardHeader title="Revenue" description="Captured payments per day, last 30 days" />
              <TrendChart data={o.charts.revenue} money />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Workspaces by plan" description="Effective plan today" />
              <BarList rows={o.planDistribution.map((p: { name: string; count: number }) => ({ label: p.name, value: p.count }))} />
            </Card>
            <Card className="lg:col-span-2">
              <CardHeader title="Module usage" description="Page views per module, last 7 days" actions={<Link href="/admin/modules" className="text-xs font-medium text-blue-600 hover:underline">Manage modules</Link>} />
              <BarList
                rows={Object.entries(o.moduleUsage as Record<ModuleKey, number>)
                  .map(([k, v]) => ({ label: MODULE_BY_KEY[k as ModuleKey]?.label ?? k, value: v }))
                  .sort((a, b) => b.value - a.value)
                  .slice(0, 8)}
              />
            </Card>
          </div>

          <div className="grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title="Newest users" actions={<Link href="/admin/users" className="text-xs font-medium text-blue-600 hover:underline">All users</Link>} />
              <div className="divide-y dark:divide-[#1e1e1e]">
                {o.recentUsers.map((u: any) => (
                  <Link key={u.id} href={`/admin/users/${u.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151515]">
                    <UserCell user={u} />
                    <span className="flex-shrink-0 text-xs text-gray-400">{ago(u.createdAt)}</span>
                  </Link>
                ))}
              </div>
            </Card>
            <Card>
              <CardHeader title="Recent payments" actions={<Link href="/admin/payments" className="text-xs font-medium text-blue-600 hover:underline">All payments</Link>} />
              {o.recentPayments.length === 0 ? (
                <Empty title="No payments yet">Payments appear here once workspaces subscribe.</Empty>
              ) : (
                <div className="divide-y dark:divide-[#1e1e1e]">
                  {o.recentPayments.map((p: any) => (
                    <Link key={p.id} href={`/admin/workspaces/${p.workspace.id}`} className="flex items-center justify-between gap-3 px-5 py-2.5 hover:bg-gray-50 dark:hover:bg-[#151515]">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.workspace.name}</p>
                        <p className="text-xs text-gray-400">{ago(p.createdAt)}</p>
                      </div>
                      <div className="flex flex-shrink-0 items-center gap-2">
                        <span className="text-sm font-semibold tabular-nums">{money(p.amount, p.currency)}</span>
                        <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </Card>
            <Card>
              <CardHeader title="Admin actions" actions={<Link href="/admin/audit" className="text-xs font-medium text-blue-600 hover:underline">Audit log</Link>} />
              {o.recentAudit.length === 0 ? (
                <Empty title="Nothing logged yet" />
              ) : (
                <div className="divide-y dark:divide-[#1e1e1e]">
                  {o.recentAudit.map((a: any) => (
                    <div key={a.id} className="px-5 py-2.5">
                      <p className="text-sm">
                        <span className="font-medium">{a.actor?.name ?? 'System'}</span>{' '}
                        <code className="rounded bg-gray-100 px-1 text-[11px] dark:bg-neutral-800">{a.action}</code>
                      </p>
                      <p className="text-xs text-gray-400">{ago(a.createdAt)}</p>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>
        </div>
      )}
    </>
  );
};

AdminOverview.getLayout = adminLayout;
export default AdminOverview;
