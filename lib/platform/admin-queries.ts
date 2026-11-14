// Read-side queries for the platform admin console.
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { matchPath, MODULE_KEYS, type ModuleKey } from '@/lib/platform/modules';
import { getDefaultPlan, getGlobalModules, planIsCurrent, toModuleMap } from '@/lib/platform/workspace';
import { effectiveModules } from '@/lib/platform/modules';

const DAY = 86_400_000;

export function pageParams(query: Record<string, string | string[] | undefined>) {
  const page = Math.max(1, parseInt(String(query.page ?? '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(String(query.pageSize ?? '25'), 10) || 25));
  return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export async function seatCounts(workspaceIds: string[]): Promise<Map<string, number>> {
  if (!workspaceIds.length) return new Map();
  const rows = await prisma.$queryRaw<{ workspaceId: string; seats: bigint }[]>`
    SELECT t."workspaceId", COUNT(DISTINCT tm."userId") AS seats
    FROM "TeamMember" tm JOIN "Team" t ON t."id" = tm."teamId"
    WHERE t."workspaceId" IN (${Prisma.join(workspaceIds)}) AND tm."role" <> 'CLIENT'
    GROUP BY t."workspaceId"`;
  return new Map(rows.map((r) => [r.workspaceId, Number(r.seats)]));
}

function dayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function series(days: number, rows: { day: Date | string; value: number }[]) {
  const map = new Map(rows.map((r) => [typeof r.day === 'string' ? r.day.slice(0, 10) : dayKey(r.day), r.value]));
  const out: { day: string; value: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * DAY));
    out.push({ day: k, value: map.get(k) ?? 0 });
  }
  return out;
}

export async function moduleUsage7d(): Promise<Record<ModuleKey, number>> {
  const since = new Date(Date.now() - 7 * DAY);
  const rows = await prisma.routeViewSession.groupBy({
    by: ['route'],
    where: { startedAt: { gte: since } },
    _count: { _all: true },
  });
  const out = Object.fromEntries(MODULE_KEYS.map((k) => [k, 0])) as Record<ModuleKey, number>;
  for (const r of rows) {
    const m = matchPath(r.route.split('?')[0], 'pages');
    if (m) out[m.module] += r._count._all;
  }
  return out;
}

// Workspaces that effectively have each module on.
export async function moduleAdoption(): Promise<Record<ModuleKey, number>> {
  const [global, def, workspaces] = await Promise.all([
    getGlobalModules(),
    getDefaultPlan(),
    prisma.workspace.findMany({
      select: { planId: true, planExpiresAt: true, moduleOverrides: true, status: true, plan: { select: { modules: true } } },
    }),
  ]);
  const out = Object.fromEntries(MODULE_KEYS.map((k) => [k, 0])) as Record<ModuleKey, number>;
  for (const w of workspaces) {
    if (w.status === 'SUSPENDED') continue;
    const planModules = w.plan && planIsCurrent(w) ? w.plan.modules : def?.modules ?? [];
    const eff = effectiveModules({ global, planModules, overrides: toModuleMap(w.moduleOverrides) });
    for (const k of MODULE_KEYS) if (eff[k]) out[k]++;
  }
  return out;
}

export async function getOverview() {
  const now = new Date();
  const d30 = new Date(now.getTime() - 30 * DAY);
  const d7 = new Date(now.getTime() - 7 * DAY);
  const online = new Date(now.getTime() - 15 * 60_000);

  const [
    users,
    newUsers30,
    newUsers7,
    workspaces,
    suspendedWorkspaces,
    teams,
    suspendedUsers,
    liveSubs,
    revenue30,
    revenueAll,
    failed30,
    signupRows,
    revenueRows,
    workspaceRows,
    onlineRows,
    recentUsers,
    recentPayments,
    recentAudit,
    plans,
    allWs,
    def,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { createdAt: { gte: d30 } } }),
    prisma.user.count({ where: { createdAt: { gte: d7 } } }),
    prisma.workspace.count(),
    prisma.workspace.count({ where: { status: 'SUSPENDED' } }),
    prisma.team.count(),
    prisma.user.count({ where: { suspendedAt: { not: null } } }),
    prisma.workspaceSubscription.findMany({
      where: { status: { in: ['active', 'authenticated'] } },
      select: { interval: true, plan: { select: { priceMonthly: true, priceYearly: true } } },
    }),
    prisma.workspacePayment.aggregate({ where: { status: 'captured', createdAt: { gte: d30 } }, _sum: { amount: true } }),
    prisma.workspacePayment.aggregate({ where: { status: 'captured' }, _sum: { amount: true } }),
    prisma.workspacePayment.count({ where: { status: 'failed', createdAt: { gte: d30 } } }),
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS value FROM "User"
      WHERE "createdAt" >= ${d30} GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COALESCE(SUM("amount"),0) AS value FROM "WorkspacePayment"
      WHERE "status" = 'captured' AND "createdAt" >= ${d30} GROUP BY 1`,
    prisma.$queryRaw<{ day: Date; value: bigint }[]>`
      SELECT date_trunc('day', "createdAt") AS day, COUNT(*) AS value FROM "Workspace"
      WHERE "createdAt" >= ${d30} GROUP BY 1`,
    prisma.routeViewSession.findMany({
      where: { startedAt: { gte: online } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, name: true, email: true, image: true, createdAt: true },
    }),
    prisma.workspacePayment.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { workspace: { select: { id: true, name: true } } },
    }),
    prisma.platformAuditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 10,
      include: { actor: { select: { name: true, email: true } } },
    }),
    prisma.platformPlan.findMany({ orderBy: { sortOrder: 'asc' }, select: { id: true, key: true, name: true } }),
    prisma.workspace.findMany({ select: { planId: true, planExpiresAt: true } }),
    getDefaultPlan(),
  ]);

  const mrr = liveSubs.reduce(
    (sum, s) => sum + (s.interval === 'YEARLY' ? Math.round(s.plan.priceYearly / 12) : s.plan.priceMonthly),
    0
  );

  const dist = new Map<string, number>();
  for (const w of allWs) {
    const pid = planIsCurrent(w) ? w.planId! : def?.id ?? 'none';
    dist.set(pid, (dist.get(pid) ?? 0) + 1);
  }

  return {
    kpis: {
      users,
      newUsers30,
      newUsers7,
      workspaces,
      suspendedWorkspaces,
      teams,
      suspendedUsers,
      activeSubscriptions: liveSubs.length,
      mrr,
      revenue30: revenue30._sum.amount ?? 0,
      revenueAll: revenueAll._sum.amount ?? 0,
      failedPayments30: failed30,
      onlineNow: onlineRows.length,
    },
    charts: {
      signups: series(30, signupRows.map((r) => ({ day: r.day, value: Number(r.value) }))),
      revenue: series(30, revenueRows.map((r) => ({ day: r.day, value: Number(r.value) }))),
      workspaces: series(30, workspaceRows.map((r) => ({ day: r.day, value: Number(r.value) }))),
    },
    planDistribution: plans.map((p) => ({ key: p.key, name: p.name, count: dist.get(p.id) ?? 0 })),
    moduleUsage: await moduleUsage7d(),
    recentUsers,
    recentPayments,
    recentAudit,
  };
}
