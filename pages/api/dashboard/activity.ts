// GET /api/dashboard/activity — workspace activity feed for the dashboard card.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getActivityFeed } from '@/lib/dashboard/activity-feed';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const feed = await getActivityFeed({ id: session.user.id, email: session.user.email });
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(feed);
  } catch (error) {
    console.error('[dashboard/activity]', error);
    return res.status(500).json({ error: 'Failed to load activity' });
  }
}
