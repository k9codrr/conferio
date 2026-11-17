// GET /api/admin/activity — who is online now, recent page views, module usage today.
// "Online" = an open page-view session that heart-beat in the last 2 minutes.
import { prisma } from '@/lib/prisma';
import { adminHandler } from '@/lib/platform/admin';
import { matchPath, MODULE_KEYS, type ModuleKey } from '@/lib/platform/modules';

const USER = { select: { id: true, name: true, email: true, image: true, imageUrl: true } } as const;
const TEAM = { select: { id: true, name: true, workspace: { select: { id: true, name: true } } } } as const;

export default adminHandler({
  GET: async (_req, res) => {
    const now = Date.now();
    const onlineSince = new Date(now - 2 * 60_000);
    const hourAgo = new Date(now - 60 * 60_000);
    const dayStart = new Date(new Date().setHours(0, 0, 0, 0));

    const [open, recent, today, recentTeams] = await Promise.all([
      prisma.routeViewSession.findMany({
        where: { endedAt: null, OR: [{ updatedAt: { gte: onlineSince } }, { startedAt: { gte: onlineSince } }] },
        orderBy: { startedAt: 'desc' },
        take: 300,
        select: { id: true, route: true, routeLabel: true, startedAt: true, user: USER, team: TEAM },
      }),
      prisma.routeViewSession.findMany({
        where: { startedAt: { gte: hourAgo } },
        orderBy: { startedAt: 'desc' },
        take: 120,
        select: { id: true, route: true, routeLabel: true, startedAt: true, duration: true, endedAt: true, user: USER, team: TEAM },
      }),
      prisma.routeViewSession.groupBy({
        by: ['route'],
        where: { startedAt: { gte: dayStart } },
        _count: { _all: true },
        _sum: { duration: true },
      }),
      prisma.team.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { id: true, name: true, slug: true, createdAt: true, workspace: { select: { id: true, name: true } } },
      }),
    ]);

    const moduleOf = (route: string) => matchPath(route.split('?')[0], 'pages')?.module ?? null;
    const online = new Map<string, (typeof open)[number]>();
    for (const s of open) if (!online.has(s.user.id)) online.set(s.user.id, s);

    const modulesToday = Object.fromEntries(MODULE_KEYS.map((k) => [k, { views: 0, seconds: 0 }])) as Record<ModuleKey, { views: number; seconds: number }>;
    let pageViewsToday = 0;
    for (const r of today) {
      pageViewsToday += r._count._all;
      const m = moduleOf(r.route);
      if (m) {
        modulesToday[m].views += r._count._all;
        modulesToday[m].seconds += r._sum.duration ?? 0;
      }
    }

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
        feed: recent.map((s) => ({
          id: s.id,
          user: { id: s.user.id, name: s.user.name },
          team: s.team?.name ?? null,
          workspace: s.team?.workspace?.name ?? null,
          route: s.route,
          routeLabel: s.routeLabel,
          module: moduleOf(s.route),
          at: s.startedAt,
          duration: s.duration,
          open: !s.endedAt,
        })),
        pageViewsToday,
        modulesToday,
        recentTeams,
      },
    });
  },
});
