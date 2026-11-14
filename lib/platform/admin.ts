// Platform-admin identity, request guard and audit log.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { ApiError } from '@/lib/errors';
import { invalidateAccess } from '@/lib/request-cache';
import { isPlatformAdminUser } from '@/lib/platform/identity';

// Re-exported for existing callers; they live in identity.ts so that low-level modules
// (workspace, razorpay, nextAuth) can use them without importing the session code.
export { isPlatformAdminRecord, isPlatformAdminUser, audit } from '@/lib/platform/identity';

export interface AdminActor {
  id: string;
  email: string;
  name: string;
}

export async function requirePlatformAdmin(req: NextApiRequest, res: NextApiResponse): Promise<AdminActor> {
  const session = await getSession(req, res);
  const userId = session?.user?.id;
  if (!userId) throw new ApiError(401, 'Unauthorized');
  // session.user.isPlatformAdmin is computed from the user row the session lookup already loaded.
  const isAdmin = session.user.isPlatformAdmin ?? (await isPlatformAdminUser(userId));
  if (!isAdmin) throw new ApiError(403, 'Platform admin access required');
  return { id: userId, email: session.user.email ?? '', name: session.user.name ?? '' };
}

// Wraps an admin API handler: guard + uniform error JSON.
export function adminHandler(
  handlers: Partial<Record<'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', (req: NextApiRequest, res: NextApiResponse, actor: AdminActor) => Promise<unknown>>>
) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const fn = handlers[req.method as keyof typeof handlers];
    if (!fn) {
      res.setHeader('Allow', Object.keys(handlers).join(', '));
      return res.status(405).json({ error: { message: 'Method not allowed' } });
    }
    try {
      const actor = await requirePlatformAdmin(req, res);
      res.setHeader('Cache-Control', 'private, no-store');
      await fn(req, res, actor);
      // Any admin write may change plans, modules, suspensions or memberships.
      if (req.method !== 'GET') invalidateAccess();
    } catch (error: any) {
      const status = error?.status || 500;
      if (status >= 500) console.error('[admin-api]', req.url, error);
      res.status(status).json({ error: { message: status >= 500 ? 'Something went wrong' : error.message } });
    }
  };
}
