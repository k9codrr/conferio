// Platform-admin identity and audit log. Deliberately imports nothing but prisma/env so
// that workspace.ts, razorpay.ts and nextAuth.ts can use it without an import cycle
// (admin.ts pulls in the session code, which imports models/team -> workspace.ts).
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import env from '@/lib/env';

export function isPlatformAdminRecord(
  u: { isPlatformAdmin?: boolean; email?: string | null; suspendedAt?: Date | null } | null | undefined
): boolean {
  if (!u || u.suspendedAt) return false;
  return Boolean(u.isPlatformAdmin) || (!!u.email && env.platformAdminEmails.includes(u.email.toLowerCase()));
}

export async function isPlatformAdminUser(userId: string): Promise<boolean> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { isPlatformAdmin: true, email: true, suspendedAt: true },
  });
  return isPlatformAdminRecord(u);
}

export async function audit(
  actorId: string | null,
  action: string,
  target?: { type: string; id: string } | null,
  meta: Prisma.InputJsonValue = {}
) {
  try {
    await prisma.platformAuditLog.create({
      data: { actorId, action, targetType: target?.type ?? null, targetId: target?.id ?? null, meta },
    });
  } catch (e) {
    console.error('[platform-audit]', e);
  }
}
