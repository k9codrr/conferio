// POST /api/workspace/:id/billing/verify — called by Razorpay Checkout's success handler.
// Verifies the signature, then pulls the subscription + payment from Razorpay (the source
// of truth) and activates the plan without waiting for the webhook.
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { userHandler, parse, q } from '@/lib/platform/http';
import { requireWorkspaceManager, getWorkspaceSummary } from '@/lib/platform/workspace';
import {
  razorpay,
  syncSubscriptionFromRazorpay,
  verifyCheckoutSignature,
  type RzpPaymentEntity,
} from '@/lib/platform/razorpay';
import { audit } from '@/lib/platform/admin';

export default userHandler({
  POST: async (req, res, user) => {
    const id = q(req.query.id);
    await requireWorkspaceManager(user.id, id);
    const body = parse(
      z.object({
        razorpay_payment_id: z.string().min(1),
        razorpay_subscription_id: z.string().min(1),
        razorpay_signature: z.string().min(1),
      }),
      req.body
    );

    const sub = await prisma.workspaceSubscription.findUnique({
      where: { razorpaySubscriptionId: body.razorpay_subscription_id },
    });
    if (!sub || sub.workspaceId !== id) throw new ApiError(404, 'Subscription not found');
    if (!verifyCheckoutSignature(body.razorpay_payment_id, body.razorpay_subscription_id, body.razorpay_signature)) {
      await audit(user.id, 'billing.signature_invalid', { type: 'workspace', id }, { subscription: sub.razorpaySubscriptionId });
      throw new ApiError(400, 'Payment signature could not be verified');
    }

    let payment: RzpPaymentEntity | null = null;
    try {
      payment = (await razorpay().payments.fetch(body.razorpay_payment_id)) as unknown as RzpPaymentEntity;
    } catch (e) {
      console.error('[billing/verify] payment fetch failed', e);
    }
    await syncSubscriptionFromRazorpay(sub.razorpaySubscriptionId, payment);
    await audit(user.id, 'billing.checkout_completed', { type: 'workspace', id }, {
      subscription: sub.razorpaySubscriptionId,
      payment: body.razorpay_payment_id,
    });

    const summary = await getWorkspaceSummary(id);
    res.status(200).json({ data: { plan: summary?.plan ?? null, planExpiresAt: summary?.workspace.planExpiresAt ?? null } });
  },
});
