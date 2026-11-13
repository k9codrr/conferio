// GET /api/drive/media?teamId=&source=&type=&keyword=&assigned=&page=&pageSize=
// Read-only, centralized list of every file shared or uploaded in a team.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { CentralMediaError, getCentralMedia } from '@/lib/drive/central-media';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
  const teamId = str(req.query.teamId);
  if (!teamId) return res.status(400).json({ error: 'teamId is required' });

  try {
    const result = await getCentralMedia({
      teamId,
      userId: session.user.id,
      source: str(req.query.source),
      type: str(req.query.type),
      keyword: str(req.query.keyword),
      assigned: str(req.query.assigned),
      page: Number(req.query.page) || 1,
      pageSize: Number(req.query.pageSize) || 60,
    });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(result);
  } catch (err) {
    if (err instanceof CentralMediaError) return res.status(err.status).json({ error: err.message });
    console.error('[api/drive/media]', err);
    return res.status(500).json({ error: 'Failed to load team media' });
  }
}
