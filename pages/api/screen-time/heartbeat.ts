import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST { sessionId } — keeps a page-view session "online" (bumps updatedAt).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const { sessionId } = req.body ?? {};
  if (typeof sessionId !== 'string') return res.status(400).json({ error: 'sessionId required' });

  try {
    const { count } = await prisma.routeViewSession.updateMany({
      where: { id: sessionId, userId: session.user.id, endedAt: null },
      data: { updatedAt: new Date() },
    });
    if (!count) return res.status(404).json({ error: 'Session not found' });
    return res.status(200).json({ active: true });
  } catch {
    return res.status(500).json({ error: 'Failed to heartbeat' });
  }
}
