// GET /api/admin/settings — integration status for the admin console
import env from '@/lib/env';
import { prisma } from '@/lib/prisma';
import { adminHandler } from '@/lib/platform/admin';
import { razorpayConfigured } from '@/lib/platform/razorpay';

export default adminHandler({
  GET: async (req, res) => {
    const base = env.appUrl && env.appUrl !== 'undefined' ? env.appUrl : `http://${req.headers.host}`;
    const [webhookEvents, lastEvent] = await Promise.all([
      prisma.razorpayWebhookEvent.count(),
      prisma.razorpayWebhookEvent.findFirst({ orderBy: { createdAt: 'desc' } }),
    ]);
    const keyId = env.razorpay.keyId;
    res.status(200).json({
      data: {
        razorpay: {
          configured: razorpayConfigured(),
          keyId: keyId ? `${keyId.slice(0, 12)}…` : null,
          mode: keyId.startsWith('rzp_live_') ? 'live' : keyId ? 'test' : null,
          webhookSecretSet: Boolean(env.razorpay.webhookSecret),
          webhookUrl: `${base.replace(/\/$/, '')}/api/webhooks/razorpay`,
          webhookEvents,
          lastWebhookAt: lastEvent?.createdAt ?? null,
          lastWebhookEvent: lastEvent?.event ?? null,
        },
        stripeConfigured: Boolean(env.stripe.secretKey),
        envAdminCount: env.platformAdminEmails.length,
      },
    });
  },
});
