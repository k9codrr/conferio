// GET /api/dashboard/widgets?types=stats,agenda,tasks — data for dashboard cards
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { loadWidgets, SERVER_WIDGETS, type ServerWidget } from '@/lib/dashboard/widgets';
import { MODULE_COOKIE } from '@/lib/platform/modules';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).end();
  }
  const session = await getServerSession(req, res, authOptions);
  const userId = (session?.user as any)?.id as string | undefined;
  if (!userId) return res.status(401).json({ error: 'Unauthorized' });

  const types = String(req.query.types || '')
    .split(',')
    .filter((t): t is ServerWidget => (SERVER_WIDGETS as readonly string[]).includes(t));
  if (!types.length) return res.status(200).json({ data: {}, team: null });

  const teamSlug = (req.query.teamSlug as string) || req.cookies[MODULE_COOKIE] || null;
  const result = await loadWidgets(userId, Array.from(new Set(types)), teamSlug ? decodeURIComponent(teamSlug) : null);
  res.setHeader('Cache-Control', 'private, no-store');
  res.status(200).json(result);
}
