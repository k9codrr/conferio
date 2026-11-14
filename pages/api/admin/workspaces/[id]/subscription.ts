// POST /api/admin/workspaces/:id/subscription { action: 'cancel' | 'sync', immediate? }
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { adminHandler, audit } from '@/lib/platform/admin';
import { razorpay, syncSubscriptionFromRazorpay } from '@/lib/platform/razorpay';
import { parse, q } from '@/lib/platform/http';

export default adminHandler({
  POST: async (req, res, actor) => {
    const id = q(req.query.id);
    const { action, immediate } = parse(
      z.object({ action: z.enum(['cancel', 'sync']), immediate: z.boolean().optional() }),
      req.body
    );
    const subs = await prisma.workspaceSubscription.findMany({
      where: { workspaceId: id, status: { in: ['created', 'authenticated', 'active', 'pending', 'halted'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (!subs.length) throw new ApiError(400, 'No open subscription for this workspace');

    if (action === 'sync') {
      for (const s of subs) await syncSubscriptionFromRazorpay(s.razorpaySubscriptionId);
      await audit(actor.id, 'billing.admin_sync', { type: 'workspace', id });
      return res.status(200).json({ data: { synced: subs.length } });
    }

    const live = subs[0];
    await razorpay().subscriptions.cancel(live.razorpaySubscriptionId, !immediate);
    if (immediate) {
      await syncSubscriptionFromRazorpay(live.razorpaySubscriptionId);
      await prisma.workspace.update({ where: { id }, data: { planExpiresAt: new Date() } });
    } else {
      await prisma.workspaceSubscription.update({ where: { id: live.id }, data: { cancelAtPeriodEnd: true } });
    }
    await audit(actor.id, immediate ? 'billing.admin_cancel_now' : 'billing.admin_cancel_period_end', { type: 'workspace', id }, {
      subscription: live.razorpaySubscriptionId,
    });
    res.status(200).json({ data: { ok: true } });
  },
});
