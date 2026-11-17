// GET   /api/me/preferences          → the signed-in user's UI preferences
// PATCH /api/me/preferences { key: value, … }   (shallow-merged per top-level key)
//
// Stored in PlatformSetting under `user-prefs:<userId>` (no schema change).
// Keys: theme, dashboard, sidebar — each validated loosely and size-capped.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const ALLOWED_KEYS = new Set(['theme', 'dashboard', 'sidebar', 'meeting']);
const MAX_BYTES = 64 * 1024;

const keyFor = (userId: string) => `user-prefs:${userId}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });
  res.setHeader('Cache-Control', 'private, no-store');

  const row = await prisma.platformSetting.findUnique({ where: { key: keyFor(userId) } });
  const current = (row?.value && typeof row.value === 'object' ? row.value : {}) as Record<string, unknown>;

  if (req.method === 'GET') return res.status(200).json({ preferences: current });

  if (req.method === 'PATCH') {
    const body = req.body && typeof req.body === 'object' ? (req.body as Record<string, unknown>) : {};
    const next = { ...current };
    for (const [k, v] of Object.entries(body)) {
      if (!ALLOWED_KEYS.has(k)) continue;
      if (v === null) delete next[k];
      else next[k] = v;
    }
    if (JSON.stringify(next).length > MAX_BYTES) return res.status(413).json({ error: 'Preferences too large' });
    await prisma.platformSetting.upsert({
      where: { key: keyFor(userId) },
      create: { key: keyFor(userId), value: next as any },
      update: { value: next as any },
    });
    return res.status(200).json({ preferences: next });
  }

  res.setHeader('Allow', 'GET, PATCH');
  return res.status(405).end();
}
