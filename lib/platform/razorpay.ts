// Razorpay subscriptions for workspace plans.
//
// Flow: subscribe → Razorpay Checkout (mandate + first charge) → /verify checks the
// signature and pulls the subscription from Razorpay → the workspace plan is extended to
// current_end (+ grace). Webhooks (/api/webhooks/razorpay) keep it in sync afterwards:
// renewals extend it, halts/cancellations let it lapse to the free plan.
import crypto from 'crypto';
import Razorpay from 'razorpay';
import type { BillingInterval, PlatformPlan } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import env from '@/lib/env';
import { audit } from '@/lib/platform/identity';
import { invalidateAccess } from '@/lib/request-cache';

export const GRACE_DAYS = 3;
const DAY = 86_400_000;

export function razorpayConfigured() {
  return Boolean(env.razorpay.keyId && env.razorpay.keySecret);
}

let client: Razorpay | null = null;
export function razorpay(): Razorpay {
  if (!razorpayConfigured()) throw new ApiError(503, 'Payments are not configured. Ask the platform admin to add Razorpay keys.');
  if (!client) client = new Razorpay({ key_id: env.razorpay.keyId, key_secret: env.razorpay.keySecret });
  return client;
}

function safeEqualHex(a: string, b: string) {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

export function verifyCheckoutSignature(paymentId: string, subscriptionId: string, signature: string) {
  const expected = crypto
    .createHmac('sha256', env.razorpay.keySecret)
    .update(`${paymentId}|${subscriptionId}`)
    .digest('hex');
  return safeEqualHex(expected, signature);
}

export function verifyWebhookSignature(rawBody: string, signature: string) {
  if (!env.razorpay.webhookSecret || !signature) return false;
  const expected = crypto.createHmac('sha256', env.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

export function priceFor(plan: PlatformPlan, interval: BillingInterval) {
  return interval === 'YEARLY' ? plan.priceYearly : plan.priceMonthly;
}

// Razorpay plans are immutable, so one is created per (plan, interval, price) and the id
// is cleared whenever an admin changes the price.
export async function ensureRazorpayPlan(plan: PlatformPlan, interval: BillingInterval): Promise<string> {
  const existing = interval === 'YEARLY' ? plan.razorpayPlanIdYearly : plan.razorpayPlanIdMonthly;
  if (existing) return existing;
  const amount = priceFor(plan, interval);
  if (amount <= 0) throw new ApiError(400, 'This plan is free and does not need a subscription');
  const created = await razorpay().plans.create({
    period: interval === 'YEARLY' ? 'yearly' : 'monthly',
    interval: 1,
    item: {
      name: `${plan.name} (${interval === 'YEARLY' ? 'Yearly' : 'Monthly'})`,
      amount,
      currency: plan.currency,
      description: plan.description ?? undefined,
    },
    notes: { platformPlanId: plan.id, platformPlanKey: plan.key },
  });
  await prisma.platformPlan.update({
    where: { id: plan.id },
    data: interval === 'YEARLY' ? { razorpayPlanIdYearly: created.id } : { razorpayPlanIdMonthly: created.id },
  });
  return created.id;
}

export async function createWorkspaceSubscription(params: {
  workspaceId: string;
  plan: PlatformPlan;
  interval: BillingInterval;
  userId: string;
  email?: string | null;
}) {
  const { workspaceId, plan, interval, userId } = params;
  const rzpPlanId = await ensureRazorpayPlan(plan, interval);
  const sub = await razorpay().subscriptions.create({
    plan_id: rzpPlanId,
    total_count: interval === 'YEARLY' ? 10 : 120,
    quantity: 1,
    customer_notify: 1,
    notes: { workspaceId, platformPlanId: plan.id, interval, createdBy: userId },
  });
  return prisma.workspaceSubscription.create({
    data: {
      workspaceId,
      planId: plan.id,
      interval,
      status: sub.status,
      razorpaySubscriptionId: sub.id,
      razorpayPlanId: rzpPlanId,
      shortUrl: sub.short_url ?? null,
      createdById: userId,
    },
  });
}

// Minimal shapes of the Razorpay entities we read.
export interface RzpSubscriptionEntity {
  id: string;
  status: string;
  current_start?: number | null;
  current_end?: number | null;
  ended_at?: number | null;
  short_url?: string | null;
}
export interface RzpPaymentEntity {
  id: string;
  amount: number;
  currency: string;
  status: string;
  method?: string | null;
  email?: string | null;
  invoice_id?: string | null;
  error_description?: string | null;
}

const ts = (s?: number | null) => (s ? new Date(s * 1000) : null);
const LIVE = ['authenticated', 'active'];

// Plan changes here alter module access, so the access cache is cleared afterwards.
export async function applySubscriptionEntity(entity: RzpSubscriptionEntity, payment?: RzpPaymentEntity | null) {
  try {
    return await applySubscriptionEntityInner(entity, payment);
  } finally {
    invalidateAccess();
  }
}

async function applySubscriptionEntityInner(entity: RzpSubscriptionEntity, payment?: RzpPaymentEntity | null) {
  const sub = await prisma.workspaceSubscription.findUnique({
    where: { razorpaySubscriptionId: entity.id },
    include: { plan: true },
  });
  if (!sub) return null;

  const currentStart = ts(entity.current_start) ?? sub.currentStart;
  const currentEnd = ts(entity.current_end) ?? sub.currentEnd;
  const updated = await prisma.workspaceSubscription.update({
    where: { id: sub.id },
    data: {
      status: entity.status,
      currentStart,
      currentEnd,
      shortUrl: entity.short_url ?? sub.shortUrl,
      ...(entity.status === 'cancelled' && !sub.cancelledAt ? { cancelledAt: new Date() } : {}),
    },
  });

  if (payment?.id) {
    await prisma.workspacePayment.upsert({
      where: { razorpayPaymentId: payment.id },
      create: {
        workspaceId: sub.workspaceId,
        subscriptionId: sub.id,
        razorpayPaymentId: payment.id,
        razorpayInvoiceId: payment.invoice_id ?? null,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method ?? null,
        email: payment.email ?? null,
        errorDescription: payment.error_description ?? null,
      },
      update: {
        status: payment.status,
        method: payment.method ?? null,
        errorDescription: payment.error_description ?? null,
        razorpayInvoiceId: payment.invoice_id ?? undefined,
      },
    });
  }

  const ws = await prisma.workspace.findUnique({ where: { id: sub.workspaceId } });
  if (!ws) return updated;
  const drivesWorkspace = ws.planSource === 'SUBSCRIPTION' && ws.planId === sub.planId;

  if (LIVE.includes(entity.status)) {
    const fallbackEnd = new Date(Date.now() + (sub.interval === 'YEARLY' ? 366 : 31) * DAY);
    const paidThrough = currentEnd ?? fallbackEnd;
    await prisma.workspace.update({
      where: { id: ws.id },
      data: {
        planId: sub.planId,
        planSource: 'SUBSCRIPTION',
        planExpiresAt: new Date(paidThrough.getTime() + GRACE_DAYS * DAY),
      },
    });
    // A new plan replaces any other live subscription (plan change).
    const others = await prisma.workspaceSubscription.findMany({
      where: { workspaceId: ws.id, id: { not: sub.id }, status: { in: [...LIVE, 'pending', 'created'] } },
    });
    for (const o of others) {
      try {
        if (o.status !== 'created') await razorpay().subscriptions.cancel(o.razorpaySubscriptionId, false);
      } catch (e) {
        console.error('[razorpay] cancel replaced subscription failed', o.razorpaySubscriptionId, e);
      }
      await prisma.workspaceSubscription.update({
        where: { id: o.id },
        data: { status: 'cancelled', cancelledAt: new Date() },
      });
    }
    if (sub.status !== entity.status && entity.status === 'active') {
      await audit(null, 'billing.subscription_active', { type: 'workspace', id: ws.id }, {
        plan: sub.plan.key,
        interval: sub.interval,
        subscription: sub.razorpaySubscriptionId,
      });
    }
  } else if (entity.status === 'halted' && drivesWorkspace) {
    // Retries exhausted: drop to the default plan now.
    await prisma.workspace.update({ where: { id: ws.id }, data: { planExpiresAt: new Date() } });
    await audit(null, 'billing.subscription_halted', { type: 'workspace', id: ws.id }, { subscription: sub.razorpaySubscriptionId });
  } else if (['cancelled', 'completed', 'expired'].includes(entity.status) && drivesWorkspace) {
    // Paid through current_end; let it lapse then.
    const end = currentEnd ?? new Date();
    await prisma.workspace.update({ where: { id: ws.id }, data: { planExpiresAt: end } });
  }
  return updated;
}

export async function syncSubscriptionFromRazorpay(razorpaySubscriptionId: string, payment?: RzpPaymentEntity | null) {
  const entity = (await razorpay().subscriptions.fetch(razorpaySubscriptionId)) as unknown as RzpSubscriptionEntity;
  return applySubscriptionEntity(entity, payment);
}
