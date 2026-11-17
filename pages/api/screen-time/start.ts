import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeRoute, getRouteLabel } from '@/lib/route-labels';
import { MODULE_COOKIE, matchPath } from '@/lib/platform/modules';
import { publish, SSE_EVENTS } from '@/lib/sse';

// POST { route, path?, teamSlug? } → { sessionId }
// `route` is the Next.js route pattern (e.g. /team/[teamSlug]/docs) so stats
// aggregate per page and still map to platform modules.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) return res.status(401).json({ error: 'Unauthorized' });

  const { route, path, teamSlug } = req.body ?? {};
  if (!route || typeof route !== 'string') return res.status(400).json({ error: 'route required' });

  try {
    // Team: the one in the URL, else the team the user last switched to, else their first.
    const slug = (typeof teamSlug === 'string' && teamSlug) || req.cookies[MODULE_COOKIE] || undefined;
    const teamMember =
      (slug
        ? await prisma.teamMember.findFirst({
            where: { userId: session.user.id, team: { slug } },
            select: { teamId: true, team: { select: { name: true, workspace: { select: { name: true } } } } },
          })
        : null) ??
      (await prisma.teamMember.findFirst({
        where: { userId: session.user.id },
        orderBy: { createdAt: 'asc' },
        select: { teamId: true, team: { select: { name: true, workspace: { select: { name: true } } } } },
      }));
    if (!teamMember) return res.status(400).json({ error: 'Not in a team' });

    const routeLabel = getRouteLabel(normalizeRoute(route));
    const now = new Date();

    // Close this user's sessions that stopped heart-beating (crashed tabs etc.)
    await prisma.routeViewSession.updateMany({
      where: { userId: session.user.id, endedAt: null, updatedAt: { lt: new Date(now.getTime() - 2 * 60_000) } },
      data: { endedAt: now },
    });

    const record = await prisma.routeViewSession.create({
      data: { route: route.slice(0, 300), routeLabel, userId: session.user.id, teamId: teamMember.teamId, startedAt: now },
      select: { id: true },
    });

    publish(SSE_EVENTS.ADMIN_ACTIVITY, {
      platformAdmin: true,
      kind: 'pageview',
      at: now.toISOString(),
      user: { id: session.user.id, name: session.user.name, email: session.user.email, image: session.user.image },
      team: teamMember.team.name,
      workspace: teamMember.team.workspace?.name ?? null,
      route,
      path: typeof path === 'string' ? path.slice(0, 300) : route,
      routeLabel,
      module: matchPath(route, 'pages')?.module ?? null,
    }).catch(() => {});

    return res.status(200).json({ sessionId: record.id });
  } catch (error) {
    console.error('Error starting screen time:', error);
    return res.status(500).json({ error: 'Failed to start tracking' });
  }
}
