// PATCH  /api/admin/plans/:id — edit a plan (price changes create new Razorpay plans lazily;
//                                existing subscribers keep their current price)
// DELETE /api/admin/plans/:id — delete if unused, otherwise refuse (deactivate instead)
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { adminHandler, audit } from '@/lib/platform/admin';
import { parse, q } from '@/lib/platform/http';
import { planPatchSchema } from '@/lib/platform/plan-schema';

export default adminHandler({
  PATCH: async (req, res, actor) => {
    const id = q(req.query.id);
    const body = parse(planPatchSchema, req.body);
    const before = await prisma.platformPlan.findUnique({ where: { id } });
    if (!before) throw new ApiError(404, 'Plan not found');
    if (body.key && body.key !== before.key && (await prisma.platformPlan.findUnique({ where: { key: body.key } }))) {
      throw new ApiError(400, 'A plan with this key already exists');
    }
    if (body.isDefault === false && before.isDefault) {
      throw new ApiError(400, 'Make another plan the default instead');
    }
    if (before.isDefault && body.isActive === false) {
      throw new ApiError(400, 'The default plan cannot be deactivated');
    }

    const priceChanged =
      (body.priceMonthly !== undefined && body.priceMonthly !== before.priceMonthly) ||
      (body.priceYearly !== undefined && body.priceYearly !== before.priceYearly) ||
      (body.currency !== undefined && body.currency !== before.currency);

    const plan = await prisma.$transaction(async (tx) => {
      if (body.isDefault) await tx.platformPlan.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      return tx.platformPlan.update({
        where: { id },
        data: {
          ...body,
          ...(priceChanged ? { razorpayPlanIdMonthly: null, razorpayPlanIdYearly: null } : {}),
        },
      });
    });
    await audit(actor.id, 'plan.updated', { type: 'plan', id }, { key: plan.key, changes: Object.keys(body) });
    res.status(200).json({ data: plan });
  },

  DELETE: async (req, res, actor) => {
    const id = q(req.query.id);
    const plan = await prisma.platformPlan.findUnique({
      where: { id },
      include: { _count: { select: { workspaces: true, subscriptions: true } } },
    });
    if (!plan) throw new ApiError(404, 'Plan not found');
    if (plan.isDefault) throw new ApiError(400, 'The default plan cannot be deleted');
    if (plan._count.workspaces || plan._count.subscriptions) {
      throw new ApiError(400, 'This plan is in use. Deactivate it instead so no new workspaces can choose it.');
    }
    await prisma.platformPlan.delete({ where: { id } });
    await audit(actor.id, 'plan.deleted', { type: 'plan', id }, { key: plan.key });
    res.status(200).json({ data: { id } });
  },
});
