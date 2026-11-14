// POST /api/workspace/:id/billing/subscribe { planId, interval } — create a Razorpay
// subscription for the plan and return what Razorpay Checkout needs.
// Choosing a free plan cancels the paid subscription at the end of the paid period.
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import env from '@/lib/env';
import { userHandler, parse, q } from '@/lib/platform/http';
import { requireWorkspaceManager } from '@/lib/platform/workspace';
import { createWorkspaceSubscription, priceFor, razorpay } from '@/lib/platform/razorpay';
import { audit } from '@/lib/platform/admin';

export default userHandler({
  POST: async (req, res, user) => {
    const id = q(req.query.id);
    await requireWorkspaceManager(user.id, id);
    const { planId, interval } = parse(
      z.object({ planId: z.string().min(1), interval: z.enum(['MONTHLY', 'YEARLY']) }),
      req.body
    );

    const [ws, plan] = await Promise.all([
      prisma.workspace.findUnique({ where: { id } }),
      prisma.platformPlan.findUnique({ where: { id: planId } }),
    ]);
    if (!ws) throw new ApiError(404, 'Workspace not found');
    if (ws.status === 'SUSPENDED') throw new ApiError(403, 'This workspace is suspended. Contact support.');
    if (!plan || !plan.isActive || !plan.isPublic) throw new ApiError(404, 'Plan not available');

    const live = await prisma.workspaceSubscription.findFirst({
      where: { workspaceId: id, status: { in: ['authenticated', 'active', 'pending'] } },
      orderBy: { createdAt: 'desc' },
    });

    // Downgrade to a free plan: stop renewing; plan stays until the paid period ends.
    if (priceFor(plan, interval) <= 0) {
      if (live) {
        await razorpay().subscriptions.cancel(live.razorpaySubscriptionId, true);
        await prisma.workspaceSubscription.update({
          where: { id: live.id },
          data: { cancelAtPeriodEnd: true },
        });
      } else {
        await prisma.workspace.update({
          where: { id },
          data: { planId: plan.id, planSource: 'MANUAL', planExpiresAt: null },
        });
      }
      await audit(user.id, 'billing.downgrade_requested', { type: 'workspace', id }, { plan: plan.key });
      return res.status(200).json({ data: { free: true, endsAt: live?.currentEnd ?? null } });
    }

    if (live && live.planId === plan.id && live.interval === interval && !live.cancelAtPeriodEnd) {
      throw new ApiError(400, 'The workspace is already on this plan');
    }

    // Reuse an unpaid checkout for the same plan instead of piling up subscriptions.
    const pending = await prisma.workspaceSubscription.findFirst({
      where: { workspaceId: id, planId: plan.id, interval, status: 'created' },
      orderBy: { createdAt: 'desc' },
    });
    const fresh = pending && Date.now() - pending.createdAt.getTime() < 6 * 3600_000;
    const sub = fresh ? pending : await createWorkspaceSubscription({ workspaceId: id, plan, interval, userId: user.id, email: user.email });

    await audit(user.id, 'billing.checkout_started', { type: 'workspace', id }, { plan: plan.key, interval });
    res.status(200).json({
      data: {
        free: false,
        keyId: env.razorpay.keyId,
        subscriptionId: sub.razorpaySubscriptionId,
        shortUrl: sub.shortUrl,
        plan: { name: plan.name, amount: priceFor(plan, interval), currency: plan.currency, interval },
        prefill: { name: user.name, email: ws.billingEmail || user.email },
        workspaceName: ws.name,
      },
    });
  },
});
