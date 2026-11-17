import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// POST { sessionId, discard? } — closes a page-view session and rolls it into
// the per-user route aggregate. Also accepts text/plain bodies (sendBeacon).
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  let body: any = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      body = {};
    }
  }
  const { sessionId, discard } = body ?? {};
  if (typeof sessionId !== 'string') return res.status(400).json({ error: 'sessionId required' });

  try {
    const routeSession = await prisma.routeViewSession.findFirst({
      where: { id: sessionId, userId: session.user.id, endedAt: null },
    });
    if (!routeSession) return res.status(404).json({ error: 'Session not found' });

    // Very short visits (redirect hops, quick back-navigation) aren't real views.
    if (discard) {
      await prisma.routeViewSession.delete({ where: { id: sessionId } }).catch(() => {});
      return res.status(200).json({ duration: 0 });
    }

    const endedAt = new Date();
    const duration = Math.max(0, Math.floor((endedAt.getTime() - routeSession.startedAt.getTime()) / 1000));

    await prisma.routeViewSession.update({ where: { id: sessionId }, data: { endedAt, duration } });
    await prisma.routeViewAggregate.upsert({
      where: { route_userId: { route: routeSession.route, userId: session.user.id } },
      create: {
        route: routeSession.route,
        routeLabel: routeSession.routeLabel,
        userId: session.user.id,
        teamId: routeSession.teamId,
        totalDuration: duration,
        viewCount: 1,
        lastViewedAt: endedAt,
      },
      update: { totalDuration: { increment: duration }, viewCount: { increment: 1 }, lastViewedAt: endedAt },
    });

    return res.status(200).json({ duration });
  } catch (error) {
    console.error('Error ending screen time:', error);
    return res.status(500).json({ error: 'Failed to end tracking' });
  }
}
