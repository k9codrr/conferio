// GET /api/admin/workspaces?search=&status=&plan=&page= — all workspaces on the platform
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminHandler } from '@/lib/platform/admin';
import { pageParams, seatCounts } from '@/lib/platform/admin-queries';
import { getDefaultPlan, planIsCurrent } from '@/lib/platform/workspace';
import { q } from '@/lib/platform/http';

export default adminHandler({
  GET: async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query);
    const search = q(req.query.search).trim();
    const status = q(req.query.status);
    const plan = q(req.query.plan);

    const where: Prisma.WorkspaceWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { owner: { email: { contains: search, mode: 'insensitive' } } },
              { teams: { some: { name: { contains: search, mode: 'insensitive' } } } },
            ],
          }
        : {}),
      ...(status === 'ACTIVE' || status === 'SUSPENDED' ? { status } : {}),
      ...(plan ? { plan: { key: plan } } : {}),
    };

    const [total, rows, def] = await Promise.all([
      prisma.workspace.count({ where }),
      prisma.workspace.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true, image: true } },
          plan: { select: { id: true, key: true, name: true } },
          _count: { select: { teams: true } },
          subscriptions: {
            where: { status: { in: ['active', 'authenticated', 'pending', 'halted'] } },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { status: true, interval: true, currentEnd: true, cancelAtPeriodEnd: true },
          },
        },
      }),
      getDefaultPlan(),
    ]);
    const seats = await seatCounts(rows.map((r) => r.id));

    res.status(200).json({
      data: rows.map((w) => ({
        id: w.id,
        name: w.name,
        slug: w.slug,
        status: w.status,
        owner: w.owner,
        teams: w._count.teams,
        seats: seats.get(w.id) ?? 0,
        plan: planIsCurrent(w) && w.plan ? w.plan : def ? { id: def.id, key: def.key, name: def.name } : null,
        assignedPlan: w.plan,
        planExpiresAt: w.planExpiresAt,
        planSource: w.planSource,
        subscription: w.subscriptions[0] ?? null,
        createdAt: w.createdAt,
      })),
      total,
      page,
      pageSize,
    });
  },
});
