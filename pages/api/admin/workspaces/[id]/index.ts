// GET    /api/admin/workspaces/:id — everything about one workspace
// PATCH  /api/admin/workspaces/:id — name, status, plan, expiry, module & limit overrides, owner
// DELETE /api/admin/workspaces/:id — only when it has no teams
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { adminHandler, audit } from '@/lib/platform/admin';
import { getWorkspaceSummary, toModuleMap } from '@/lib/platform/workspace';
import { MODULE_KEYS } from '@/lib/platform/modules';
import { parse, q } from '@/lib/platform/http';

const moduleOverride = z.record(z.enum(MODULE_KEYS), z.boolean());
const limitOverride = z.object({
  maxTeams: z.number().int().min(-1).optional(),
  maxMembers: z.number().int().min(-1).optional(),
  maxStorageGb: z.number().int().min(-1).optional(),
});

const patchSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  billingEmail: z.string().trim().email().nullable().optional(),
  status: z.enum(['ACTIVE', 'SUSPENDED']).optional(),
  suspendedReason: z.string().trim().max(500).nullable().optional(),
  planId: z.string().nullable().optional(),
  planExpiresAt: z.string().datetime().nullable().optional(),
  moduleOverrides: moduleOverride.optional(),
  limitOverrides: limitOverride.optional(),
  ownerId: z.string().nullable().optional(),
});

export default adminHandler({
  GET: async (req, res) => {
    const id = q(req.query.id);
    const summary = await getWorkspaceSummary(id);
    if (!summary) throw new ApiError(404, 'Workspace not found');

    const [teams, subscriptions, payments, auditLog] = await Promise.all([
      prisma.team.findMany({
        where: { workspaceId: id },
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          members: {
            orderBy: { createdAt: 'asc' },
            select: {
              role: true,
              createdAt: true,
              user: { select: { id: true, name: true, email: true, image: true, suspendedAt: true } },
            },
          },
        },
      }),
      prisma.workspaceSubscription.findMany({
        where: { workspaceId: id },
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { key: true, name: true } } },
      }),
      prisma.workspacePayment.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 100 }),
      prisma.platformAuditLog.findMany({
        where: { targetType: 'workspace', targetId: id },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { actor: { select: { name: true, email: true } } },
      }),
    ]);

    res.status(200).json({ data: { ...summary, teams, subscriptions, payments, auditLog } });
  },

  PATCH: async (req, res, actor) => {
    const id = q(req.query.id);
    const body = parse(patchSchema, req.body);
    const before = await prisma.workspace.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, 'Workspace not found');

    if (body.planId) {
      const plan = await prisma.platformPlan.findUnique({ where: { id: body.planId } });
      if (!plan) throw new ApiError(400, 'Unknown plan');
    }
    if (body.ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: body.ownerId }, select: { id: true } });
      if (!owner) throw new ApiError(400, 'Unknown user');
    }

    const data: Prisma.WorkspaceUpdateInput = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.billingEmail !== undefined) data.billingEmail = body.billingEmail;
    if (body.status !== undefined) {
      data.status = body.status;
      data.suspendedReason = body.status === 'SUSPENDED' ? body.suspendedReason ?? before.suspendedReason ?? null : null;
    } else if (body.suspendedReason !== undefined) {
      data.suspendedReason = body.suspendedReason;
    }
    if (body.planId !== undefined) {
      data.plan = body.planId ? { connect: { id: body.planId } } : { disconnect: true };
      data.planSource = 'MANUAL';
    }
    if (body.planExpiresAt !== undefined) data.planExpiresAt = body.planExpiresAt ? new Date(body.planExpiresAt) : null;
    if (body.moduleOverrides !== undefined) data.moduleOverrides = toModuleMap(body.moduleOverrides);
    if (body.limitOverrides !== undefined) {
      const clean = Object.fromEntries(Object.entries(body.limitOverrides).filter(([, v]) => v !== undefined));
      data.limitOverrides = clean;
    }
    if (body.ownerId !== undefined) data.owner = body.ownerId ? { connect: { id: body.ownerId } } : { disconnect: true };

    const ws = await prisma.workspace.update({ where: { id }, data });

    const action =
      body.status === 'SUSPENDED' && before.status !== 'SUSPENDED'
        ? 'workspace.suspended'
        : body.status === 'ACTIVE' && before.status === 'SUSPENDED'
          ? 'workspace.reactivated'
          : body.planId !== undefined
            ? 'workspace.plan_changed'
            : body.moduleOverrides !== undefined
              ? 'workspace.modules_changed'
              : 'workspace.updated';
    await audit(actor.id, action, { type: 'workspace', id }, body as Prisma.InputJsonValue);
    res.status(200).json({ data: ws });
  },

  DELETE: async (req, res, actor) => {
    const id = q(req.query.id);
    const teams = await prisma.team.count({ where: { workspaceId: id } });
    if (teams > 0) throw new ApiError(400, 'Move or delete the teams in this workspace first');
    const live = await prisma.workspaceSubscription.count({
      where: { workspaceId: id, status: { in: ['active', 'authenticated', 'pending'] } },
    });
    if (live > 0) throw new ApiError(400, 'Cancel the active subscription first');
    const ws = await prisma.workspace.delete({ where: { id } });
    await audit(actor.id, 'workspace.deleted', { type: 'workspace', id }, { name: ws.name });
    res.status(200).json({ data: { id } });
  },
});
