// GET /api/admin/activity — who is online and what is being used across the platform
import { prisma } from '@/lib/prisma';
import { adminHandler } from '@/lib/platform/admin';
import { matchPath } from '@/lib/platform/modules';

export default adminHandler({
  GET: async (_req, res) => {
    const since = new Date(Date.now() - 60 * 60_000);
    const [sessions, recentTeams] = await Promise.all([
      prisma.routeViewSession.findMany({
        where: { startedAt: { gte: since } },
        orderBy: { startedAt: 'desc' },
        take: 200,
        select: {
          id: true,
          route: true,
          routeLabel: true,
          startedAt: true,
          duration: true,
          user: { select: { id: true, name: true, email: true, image: true, imageUrl: true } },
          team: { select: { id: true, name: true, workspace: { select: { id: true, name: true } } } },
        },
      }),
      prisma.team.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, slug: true, createdAt: true, workspace: { select: { id: true, name: true } } },
      }),
    ]);
    const moduleOf = (route: string) => matchPath(route.split('?')[0], 'pages')?.module ?? null;
    const online = new Map<string, (typeof sessions)[number]>();
    for (const s of sessions) if (!online.has(s.user.id)) online.set(s.user.id, s);

    res.status(200).json({
      data: {
        online: Array.from(online.values()).map((s) => ({
          user: { id: s.user.id, name: s.user.name, email: s.user.email, image: s.user.imageUrl || s.user.image },
          team: s.team?.name ?? null,
          workspace: s.team?.workspace ?? null,
          route: s.route,
          routeLabel: s.routeLabel,
          module: moduleOf(s.route),
          at: s.startedAt,
        })),
        feed: sessions.slice(0, 80).map((s) => ({
          id: s.id,
          user: { id: s.user.id, name: s.user.name },
          team: s.team?.name ?? null,
          workspace: s.team?.workspace?.name ?? null,
          route: s.route,
          routeLabel: s.routeLabel,
          module: moduleOf(s.route),
          at: s.startedAt,
          duration: s.duration,
        })),
        recentTeams,
      },
    });
  },
});
