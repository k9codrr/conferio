// Small API helpers for signed-in user routes.
import type { NextApiRequest, NextApiResponse } from 'next';
import { z, ZodError } from 'zod';
import { getSession } from '@/lib/session';
import { ApiError } from '@/lib/errors';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Handler = (req: NextApiRequest, res: NextApiResponse, user: SessionUser) => Promise<unknown>;

export function userHandler(handlers: Partial<Record<Method, Handler>>) {
  return async (req: NextApiRequest, res: NextApiResponse) => {
    const fn = handlers[req.method as Method];
    if (!fn) {
      res.setHeader('Allow', Object.keys(handlers).join(', '));
      return res.status(405).json({ error: { message: 'Method not allowed' } });
    }
    try {
      const session = await getSession(req, res);
      if (!session?.user?.id) throw new ApiError(401, 'Unauthorized');
      res.setHeader('Cache-Control', 'private, no-store');
      await fn(req, res, { id: session.user.id, email: session.user.email ?? '', name: session.user.name ?? '' });
    } catch (error: any) {
      sendError(req, res, error);
    }
  };
}

export function sendError(req: NextApiRequest, res: NextApiResponse, error: any) {
  if (error instanceof ZodError) {
    return res.status(400).json({ error: { message: error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') } });
  }
  // Razorpay SDK errors carry { statusCode, error: { description } }
  if (error?.error?.description) {
    console.error('[razorpay]', req.url, error.error);
    return res.status(502).json({ error: { message: `Payment provider: ${error.error.description}` } });
  }
  const status = error?.status || 500;
  if (status >= 500) console.error('[api]', req.url, error);
  return res.status(status).json({ error: { message: status >= 500 ? 'Something went wrong' : error.message } });
}

export const q = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}
