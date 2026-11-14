// GET  /api/admin/plans — all plans with usage
// POST /api/admin/plans — create a plan
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { adminHandler, audit } from '@/lib/platform/admin';
import { parse } from '@/lib/platform/http';
import { planSchema } from '@/lib/platform/plan-schema';

export default adminHandler({
  GET: async (_req, res) => {
    const plans = await prisma.platformPlan.findMany({
      orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
      include: { _count: { select: { workspaces: true } } },
    });
    const live = await prisma.workspaceSubscription.groupBy({
      by: ['planId'],
      where: { status: { in: ['active', 'authenticated'] } },
      _count: { _all: true },
    });
    const liveBy = new Map(live.map((l) => [l.planId, l._count._all]));
    res.status(200).json({
      data: plans.map(({ _count, ...p }) => ({ ...p, workspaces: _count.workspaces, activeSubscriptions: liveBy.get(p.id) ?? 0 })),
    });
  },

  POST: async (req, res, actor) => {
    const body = parse(planSchema, req.body);
    if (await prisma.platformPlan.findUnique({ where: { key: body.key } })) {
      throw new ApiError(400, 'A plan with this key already exists');
    }
    const plan = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.platformPlan.updateMany({ data: { isDefault: false } });
      return tx.platformPlan.create({ data: body });
    });
    await audit(actor.id, 'plan.created', { type: 'plan', id: plan.id }, { key: plan.key });
    res.status(201).json({ data: plan });
  },
});
