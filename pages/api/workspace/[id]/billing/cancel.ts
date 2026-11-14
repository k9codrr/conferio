// POST /api/workspace/:id/billing/cancel { resume?: boolean }
// Cancels auto-renew at the end of the current period. The plan stays until then.
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { userHandler, parse, q } from '@/lib/platform/http';
import { requireWorkspaceManager } from '@/lib/platform/workspace';
import { razorpay } from '@/lib/platform/razorpay';
import { audit } from '@/lib/platform/admin';

export default userHandler({
  POST: async (req, res, user) => {
    const id = q(req.query.id);
    await requireWorkspaceManager(user.id, id);
    parse(z.object({}).passthrough(), req.body ?? {});

    const live = await prisma.workspaceSubscription.findFirst({
      where: { workspaceId: id, status: { in: ['authenticated', 'active', 'pending'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!live) throw new ApiError(400, 'There is no active subscription to cancel');
    if (live.cancelAtPeriodEnd) throw new ApiError(400, 'Auto-renew is already off');

    await razorpay().subscriptions.cancel(live.razorpaySubscriptionId, true);
    const updated = await prisma.workspaceSubscription.update({
      where: { id: live.id },
      data: { cancelAtPeriodEnd: true },
    });
    await audit(user.id, 'billing.cancel_at_period_end', { type: 'workspace', id }, { subscription: live.razorpaySubscriptionId });
    res.status(200).json({ data: { endsAt: updated.currentEnd } });
  },
});
