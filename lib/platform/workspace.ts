// Multi-tenant workspace logic: a Workspace is the tenant and billing unit; Teams live
// inside it. The workspace plan decides limits (teams, seats, storage) and modules.
import type { PlatformPlan, Prisma, Workspace } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { slugify } from '@/lib/server-common';
import {
  effectiveModules,
  isModuleKey,
  MODULE_KEYS,
  type ModuleKey,
  type ModuleMap,
} from '@/lib/platform/modules';
import { isPlatformAdminRecord, isPlatformAdminUser } from '@/lib/platform/identity';
import { caches, invalidateAccess } from '@/lib/request-cache';

// ── Global module switches (PlatformSetting "modules"), cached briefly ─────────
let globalCache: { at: number; value: ModuleMap } | null = null;
const GLOBAL_TTL_MS = 10_000;

function toModuleMap(v: unknown): ModuleMap {
  const out: ModuleMap = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (isModuleKey(k) && typeof val === 'boolean') out[k] = val;
    }
  }
  return out;
}

export async function getGlobalModules(): Promise<ModuleMap> {
  if (globalCache && Date.now() - globalCache.at < GLOBAL_TTL_MS) return globalCache.value;
  const row = await prisma.platformSetting.findUnique({ where: { key: 'modules' } });
  const value = toModuleMap(row?.value);
  globalCache = { at: Date.now(), value };
  return value;
}

export async function setGlobalModules(map: ModuleMap) {
  const value = toModuleMap(map);
  await prisma.platformSetting.upsert({
    where: { key: 'modules' },
    create: { key: 'modules', value },
    update: { value },
  });
  globalCache = { at: Date.now(), value };
  invalidateAccess();
  return value;
}

// ── Plans & limits ────────────────────────────────────────────────────────────
export async function getDefaultPlan(): Promise<PlatformPlan | null> {
  return (
    (await prisma.platformPlan.findFirst({ where: { isDefault: true }, orderBy: { sortOrder: 'asc' } })) ??
    (await prisma.platformPlan.findFirst({ where: { priceMonthly: 0, isActive: true }, orderBy: { sortOrder: 'asc' } }))
  );
}

type WorkspaceWithPlan = Workspace & { plan: PlatformPlan | null };

export function planIsCurrent(ws: Pick<Workspace, 'planId' | 'planExpiresAt'>, now = new Date()) {
  return Boolean(ws.planId) && (!ws.planExpiresAt || ws.planExpiresAt > now);
}

export async function effectivePlan(ws: WorkspaceWithPlan): Promise<PlatformPlan | null> {
  if (ws.plan && planIsCurrent(ws)) return ws.plan;
  return getDefaultPlan();
}

export interface WorkspaceLimits {
  maxTeams: number; // -1 = unlimited
  maxMembers: number;
  maxStorageGb: number;
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? Math.trunc(v) : undefined;
}

export function limitsFor(ws: Pick<Workspace, 'limitOverrides'>, plan: PlatformPlan | null): WorkspaceLimits {
  const o = (ws.limitOverrides ?? {}) as Record<string, unknown>;
  return {
    maxTeams: num(o.maxTeams) ?? plan?.maxTeams ?? 1,
    maxMembers: num(o.maxMembers) ?? plan?.maxMembers ?? 5,
    maxStorageGb: num(o.maxStorageGb) ?? plan?.maxStorageGb ?? 5,
  };
}

export const isUnlimited = (n: number) => n < 0;

// ── Usage ─────────────────────────────────────────────────────────────────────
export interface WorkspaceUsage {
  teams: number;
  seats: number; // distinct non-client members across all teams
  clients: number;
  pendingInvites: number;
  storageBytes: number;
}

export async function getWorkspaceUsage(workspaceId: string): Promise<WorkspaceUsage> {
  const [teams, seatRows, clientRows, pendingInvites, storage] = await Promise.all([
    prisma.team.count({ where: { workspaceId } }),
    prisma.teamMember.findMany({
      where: { team: { workspaceId }, role: { not: 'CLIENT' } },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.teamMember.findMany({
      where: { team: { workspaceId }, role: 'CLIENT' },
      distinct: ['userId'],
      select: { userId: true },
    }),
    prisma.invitation.count({
      where: { team: { workspaceId }, sentViaEmail: true, expires: { gt: new Date() }, role: { not: 'CLIENT' } },
    }),
    prisma.teamStorage.aggregate({ where: { team: { workspaceId } }, _sum: { usedStorage: true } }),
  ]);
  return {
    teams,
    seats: seatRows.length,
    clients: clientRows.length,
    pendingInvites,
    storageBytes: Number(storage._sum.usedStorage ?? 0),
  };
}

// ── Summary used by workspace settings, billing and admin ────────────────────
export async function getWorkspaceSummary(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { plan: true, owner: { select: { id: true, name: true, email: true, image: true } } },
  });
  if (!ws) return null;
  const [plan, usage, global, subscription] = await Promise.all([
    effectivePlan(ws),
    getWorkspaceUsage(ws.id),
    getGlobalModules(),
    prisma.workspaceSubscription.findFirst({
      where: { workspaceId: ws.id, status: { in: ['created', 'authenticated', 'active', 'pending', 'halted'] } },
      orderBy: { createdAt: 'desc' },
      include: { plan: { select: { id: true, key: true, name: true } } },
    }),
  ]);
  const overrides = toModuleMap(ws.moduleOverrides);
  const modules =
    ws.status === 'SUSPENDED'
      ? (Object.fromEntries(MODULE_KEYS.map((k) => [k, false])) as Record<ModuleKey, boolean>)
      : effectiveModules({ global, planModules: plan?.modules ?? [], overrides });
  return {
    workspace: ws,
    plan,
    planExpired: Boolean(ws.planId) && !planIsCurrent(ws),
    limits: limitsFor(ws, plan),
    usage,
    globalModules: global,
    overrides,
    modules,
    subscription,
  };
}

// ── Resolving the workspace a user is acting in ───────────────────────────────
export async function resolveUserTeam(userId: string, teamSlug?: string | null) {
  if (teamSlug) {
    const m = await prisma.teamMember.findFirst({
      where: { userId, team: { slug: teamSlug } },
      select: { role: true, team: { select: { id: true, slug: true, name: true, workspaceId: true } } },
    });
    if (m) return m;
  }
  return prisma.teamMember.findFirst({
    where: { userId },
    orderBy: { createdAt: 'asc' },
    select: { role: true, team: { select: { id: true, slug: true, name: true, workspaceId: true } } },
  });
}

export interface AccessResult {
  isPlatformAdmin: boolean;
  suspendedUser: boolean;
  workspace: { id: string; name: string; slug: string; status: string } | null;
  planKey: string | null;
  planName: string | null;
  modules: Record<ModuleKey, boolean>;
}

const ALL_ON = () => Object.fromEntries(MODULE_KEYS.map((k) => [k, true])) as Record<ModuleKey, boolean>;
const ALL_OFF = () => Object.fromEntries(MODULE_KEYS.map((k) => [k, false])) as Record<ModuleKey, boolean>;

// Hot path: called by the module gate on navigations and by the sidebar. Kept to one
// round trip (user + chosen membership + workspace + plan in parallel) and cached per
// user/team for 15s; admin writes and billing changes clear the cache.
export async function getAccessForUser(userId: string, teamSlug?: string | null): Promise<AccessResult> {
  return caches.access.getOrLoad(`${userId}|${teamSlug ?? ''}`, () => loadAccess(userId, teamSlug)) as Promise<AccessResult>;
}

const accessTeamSelect = {
  role: true,
  team: {
    select: {
      id: true,
      slug: true,
      workspace: {
        select: {
          id: true,
          name: true,
          slug: true,
          status: true,
          planId: true,
          planExpiresAt: true,
          moduleOverrides: true,
          plan: { select: { key: true, name: true, modules: true } },
        },
      },
    },
  },
} satisfies Prisma.TeamMemberSelect;

async function loadAccess(userId: string, teamSlug?: string | null): Promise<AccessResult> {
  const [user, bySlug, first, global] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { isPlatformAdmin: true, email: true, suspendedAt: true } }),
    teamSlug
      ? prisma.teamMember.findFirst({ where: { userId, team: { slug: teamSlug } }, select: accessTeamSelect })
      : Promise.resolve(null),
    prisma.teamMember.findFirst({ where: { userId }, orderBy: { createdAt: 'asc' }, select: accessTeamSelect }),
    getGlobalModules(),
  ]);
  const admin = isPlatformAdminRecord(user);
  const ws = (bySlug ?? first)?.team.workspace ?? null;

  let plan: { key: string; name: string; modules: string[] } | null = null;
  if (ws?.plan && planIsCurrent(ws)) plan = ws.plan;
  else plan = await getDefaultPlanCached();

  let modules: Record<ModuleKey, boolean>;
  if (admin) modules = ALL_ON();
  else if (ws?.status === 'SUSPENDED' || user?.suspendedAt) modules = ALL_OFF();
  else modules = effectiveModules({ global, planModules: plan?.modules ?? [], overrides: ws ? toModuleMap(ws.moduleOverrides) : {} });

  return {
    isPlatformAdmin: admin,
    suspendedUser: Boolean(user?.suspendedAt),
    workspace: ws ? { id: ws.id, name: ws.name, slug: ws.slug, status: ws.status } : null,
    planKey: ws ? plan?.key ?? null : null,
    planName: ws ? plan?.name ?? null : null,
    modules,
  };
}

// Lives in the access cache so plan edits (which clear it) take effect immediately.
function getDefaultPlanCached() {
  return caches.access.getOrLoad('__defaultPlan', getDefaultPlan) as Promise<PlatformPlan | null>;
}

// ── Workspace creation / ownership ────────────────────────────────────────────
async function uniqueWorkspaceSlug(base: string) {
  const root = slugify(base).slice(0, 40) || 'workspace';
  for (let i = 0; i < 20; i++) {
    const candidate = i === 0 ? root : `${root}-${Math.random().toString(36).slice(2, 7)}`;
    const exists = await prisma.workspace.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!exists) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function createWorkspace(params: { ownerId: string; name: string; billingEmail?: string | null }) {
  const plan = await getDefaultPlan();
  return prisma.workspace.create({
    data: {
      name: params.name.trim().slice(0, 80) || 'Workspace',
      slug: await uniqueWorkspaceSlug(params.name),
      ownerId: params.ownerId,
      planId: plan?.id ?? null,
      planSource: 'MANUAL',
      billingEmail: params.billingEmail ?? null,
    },
  });
}

// The workspace a new team goes into when none is specified: the user's first owned
// workspace, created on demand.
export async function ensureWorkspaceForUser(userId: string) {
  const owned = await prisma.workspace.findFirst({ where: { ownerId: userId }, orderBy: { createdAt: 'asc' } });
  if (owned) return owned;
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { name: true, email: true } });
  return createWorkspace({ ownerId: userId, name: `${user.name || 'My'}'s Workspace`, billingEmail: user.email });
}

// Workspaces the user can manage: owned, or OWNER/ADMIN of a team inside it.
export async function managedWorkspaceIds(userId: string): Promise<string[]> {
  const [owned, viaTeams] = await Promise.all([
    prisma.workspace.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.teamMember.findMany({
      where: { userId, role: { in: ['OWNER', 'ADMIN'] }, team: { workspaceId: { not: null } } },
      select: { team: { select: { workspaceId: true } } },
    }),
  ]);
  return Array.from(new Set([...owned.map((w) => w.id), ...viaTeams.map((t) => t.team.workspaceId as string)]));
}

export async function canManageWorkspace(userId: string, workspaceId: string) {
  if (await isPlatformAdminUser(userId)) return true;
  return (await managedWorkspaceIds(userId)).includes(workspaceId);
}

export async function isWorkspaceMember(userId: string, workspaceId: string) {
  const [owner, member] = await Promise.all([
    prisma.workspace.count({ where: { id: workspaceId, ownerId: userId } }),
    prisma.teamMember.count({ where: { userId, team: { workspaceId } } }),
  ]);
  return owner + member > 0;
}

export async function requireWorkspaceManager(userId: string, workspaceId: string) {
  if (!(await canManageWorkspace(userId, workspaceId))) {
    throw new ApiError(403, 'Only workspace owners and team admins can manage this workspace');
  }
}

// ── Limit enforcement ────────────────────────────────────────────────────────
async function loadForLimits(workspaceId: string) {
  const ws = await prisma.workspace.findUnique({ where: { id: workspaceId }, include: { plan: true } });
  if (!ws) throw new ApiError(404, 'Workspace not found');
  if (ws.status === 'SUSPENDED') throw new ApiError(403, 'This workspace is suspended. Contact support.');
  const plan = await effectivePlan(ws);
  return { ws, plan, limits: limitsFor(ws, plan) };
}

export async function assertCanCreateTeam(workspaceId: string) {
  const { plan, limits } = await loadForLimits(workspaceId);
  if (isUnlimited(limits.maxTeams)) return;
  const teams = await prisma.team.count({ where: { workspaceId } });
  if (teams >= limits.maxTeams) {
    throw new ApiError(
      402,
      `Your ${plan?.name ?? 'current'} plan allows ${limits.maxTeams} team${limits.maxTeams === 1 ? '' : 's'}. Upgrade the workspace plan to add more.`
    );
  }
}

// Checks a seat is free before inviting/adding someone. Users already in the
// workspace and CLIENT (guest) roles never use a new seat.
export async function assertSeatAvailable(
  teamId: string,
  opts: { email?: string | null; userId?: string | null; role?: string | null; countPending?: boolean }
) {
  if (opts.role === 'CLIENT') return;
  const team = await prisma.team.findUnique({ where: { id: teamId }, select: { workspaceId: true } });
  if (!team?.workspaceId) return;
  const { plan, limits } = await loadForLimits(team.workspaceId);
  if (isUnlimited(limits.maxMembers)) return;

  const alreadyIn = await prisma.teamMember.count({
    where: {
      team: { workspaceId: team.workspaceId },
      role: { not: 'CLIENT' },
      ...(opts.userId ? { userId: opts.userId } : opts.email ? { user: { email: opts.email } } : { userId: '__none__' }),
    },
  });
  if (alreadyIn > 0) return;

  const usage = await getWorkspaceUsage(team.workspaceId);
  const used = usage.seats + (opts.countPending ? usage.pendingInvites : 0);
  if (used >= limits.maxMembers) {
    throw new ApiError(
      402,
      `Your ${plan?.name ?? 'current'} plan includes ${limits.maxMembers} seats and all are in use${
        opts.countPending ? ' (including pending invitations)' : ''
      }. Upgrade the workspace plan to add more members.`
    );
  }
}

export type { WorkspaceWithPlan };
export type WorkspaceSummary = NonNullable<Awaited<ReturnType<typeof getWorkspaceSummary>>>;
export const jsonModuleMap = (m: ModuleMap) => m as Prisma.InputJsonValue;
export { toModuleMap };
