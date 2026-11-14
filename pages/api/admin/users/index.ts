// GET /api/admin/users?search=&filter=all|admins|suspended&page=
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import env from '@/lib/env';
import { adminHandler } from '@/lib/platform/admin';
import { pageParams } from '@/lib/platform/admin-queries';
import { q } from '@/lib/platform/http';

export default adminHandler({
  GET: async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query);
    const search = q(req.query.search).trim();
    const filter = q(req.query.filter);
    const where: Prisma.UserWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { email: { contains: search, mode: 'insensitive' } },
              { username: { contains: search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter === 'admins'
        ? { OR: [{ isPlatformAdmin: true }, { email: { in: env.platformAdminEmails, mode: 'insensitive' } }] }
        : filter === 'suspended'
          ? { suspendedAt: { not: null } }
          : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
          imageUrl: true,
          createdAt: true,
          emailVerified: true,
          isPlatformAdmin: true,
          suspendedAt: true,
          suspendedReason: true,
          _count: { select: { teamMembers: true, ownedWorkspaces: true, sessions: true } },
          routeViewSessions: { orderBy: { startedAt: 'desc' }, take: 1, select: { startedAt: true } },
        },
      }),
    ]);
    res.status(200).json({
      data: rows.map(({ routeViewSessions, _count, ...u }) => ({
        ...u,
        image: u.imageUrl || u.image,
        envAdmin: env.platformAdminEmails.includes(u.email.toLowerCase()),
        teams: _count.teamMembers,
        workspacesOwned: _count.ownedWorkspaces,
        sessions: _count.sessions,
        lastSeenAt: routeViewSessions[0]?.startedAt ?? null,
      })),
      total,
      page,
      pageSize,
    });
  },
});
