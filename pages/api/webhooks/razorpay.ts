// POST /api/webhooks/razorpay — Razorpay → workspace plan sync.
// Configure in Razorpay Dashboard → Webhooks with RAZORPAY_WEBHOOK_SECRET and events:
// subscription.authenticated, subscription.activated, subscription.charged,
// subscription.pending, subscription.halted, subscription.cancelled,
// subscription.completed, subscription.paused, subscription.resumed, payment.failed
import type { NextApiRequest, NextApiResponse } from 'next';
import { prisma } from '@/lib/prisma';
import {
  applySubscriptionEntity,
  verifyWebhookSignature,
  type RzpPaymentEntity,
  type RzpSubscriptionEntity,
} from '@/lib/platform/razorpay';

export const config = { api: { bodyParser: false } };

async function readRaw(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).end();
  }

  const raw = await readRaw(req);
  const signature = String(req.headers['x-razorpay-signature'] ?? '');
  if (!verifyWebhookSignature(raw, signature)) {
    return res.status(400).json({ error: 'Invalid signature' });
  }

  let body: {
    event: string;
    payload?: {
      subscription?: { entity: RzpSubscriptionEntity & { notes?: Record<string, string> } };
      payment?: { entity: RzpPaymentEntity & { subscription_id?: string | null; invoice_id?: string | null } };
    };
  };
  try {
    body = JSON.parse(raw);
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  // Idempotency: Razorpay retries deliveries with the same event id.
  const eventId = String(req.headers['x-razorpay-event-id'] ?? '');
  if (eventId) {
    try {
      await prisma.razorpayWebhookEvent.create({ data: { id: eventId, event: body.event } });
    } catch {
      return res.status(200).json({ ok: true, duplicate: true });
    }
  }

  try {
    const sub = body.payload?.subscription?.entity;
    const payment = body.payload?.payment?.entity ?? null;

    if (sub) {
      await applySubscriptionEntity(sub, payment);
    } else if (body.event === 'payment.failed' && payment) {
      // Failed renewal outside a subscription event: record it against the subscription if we know it.
      const subId = payment.subscription_id;
      const local = subId
        ? await prisma.workspaceSubscription.findUnique({ where: { razorpaySubscriptionId: subId } })
        : null;
      if (local) {
        await prisma.workspacePayment.upsert({
          where: { razorpayPaymentId: payment.id },
          create: {
            workspaceId: local.workspaceId,
            subscriptionId: local.id,
            razorpayPaymentId: payment.id,
            razorpayInvoiceId: payment.invoice_id ?? null,
            amount: payment.amount,
            currency: payment.currency,
            status: 'failed',
            method: payment.method ?? null,
            email: payment.email ?? null,
            errorDescription: payment.error_description ?? null,
          },
          update: { status: 'failed', errorDescription: payment.error_description ?? null },
        });
      }
    }
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[webhooks/razorpay]', body.event, error);
    // Let Razorpay retry: forget the event id so the retry is processed.
    if (eventId) await prisma.razorpayWebhookEvent.delete({ where: { id: eventId } }).catch(() => undefined);
    return res.status(500).json({ error: 'Processing failed' });
  }
}
