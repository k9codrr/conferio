// GET /api/workspace/:id/billing — plans on offer, current subscription and payment history
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import env from '@/lib/env';
import { userHandler, q } from '@/lib/platform/http';
import { canManageWorkspace, getWorkspaceSummary, isWorkspaceMember } from '@/lib/platform/workspace';
import { razorpayConfigured } from '@/lib/platform/razorpay';
import { isPlatformAdminUser } from '@/lib/platform/admin';

export default userHandler({
  GET: async (req, res, user) => {
    const id = q(req.query.id);
    if (!(await isWorkspaceMember(user.id, id)) && !(await isPlatformAdminUser(user.id))) {
      throw new ApiError(404, 'Workspace not found');
    }
    const [summary, plans, subscriptions, payments, canManage] = await Promise.all([
      getWorkspaceSummary(id),
      prisma.platformPlan.findMany({
        where: { isActive: true, isPublic: true },
        orderBy: [{ sortOrder: 'asc' }, { priceMonthly: 'asc' }],
      }),
      prisma.workspaceSubscription.findMany({
        where: { workspaceId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        include: { plan: { select: { key: true, name: true } } },
      }),
      prisma.workspacePayment.findMany({ where: { workspaceId: id }, orderBy: { createdAt: 'desc' }, take: 50 }),
      canManageWorkspace(user.id, id),
    ]);
    if (!summary) throw new ApiError(404, 'Workspace not found');

    res.status(200).json({
      data: {
        canManage,
        configured: razorpayConfigured(),
        keyId: env.razorpay.keyId || null,
        currentPlan: summary.plan,
        planExpiresAt: summary.workspace.planExpiresAt,
        planSource: summary.workspace.planSource,
        planExpired: summary.planExpired,
        limits: summary.limits,
        usage: summary.usage,
        activeSubscription: summary.subscription,
        plans: plans.map((p) => ({
          id: p.id,
          key: p.key,
          name: p.name,
          description: p.description,
          currency: p.currency,
          priceMonthly: p.priceMonthly,
          priceYearly: p.priceYearly,
          maxTeams: p.maxTeams,
          maxMembers: p.maxMembers,
          maxStorageGb: p.maxStorageGb,
          modules: p.modules,
          features: p.features,
          isDefault: p.isDefault,
        })),
        subscriptions: subscriptions.map(({ createdById: _c, ...s }) => s),
        payments,
      },
    });
  },
});
