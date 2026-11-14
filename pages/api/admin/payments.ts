// GET /api/admin/payments?view=payments|subscriptions&status=&search=&page=
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminHandler } from '@/lib/platform/admin';
import { pageParams } from '@/lib/platform/admin-queries';
import { q } from '@/lib/platform/http';

export default adminHandler({
  GET: async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query);
    const status = q(req.query.status);
    const search = q(req.query.search).trim();
    const wsFilter: Prisma.WorkspaceWhereInput | undefined = search
      ? { OR: [{ name: { contains: search, mode: 'insensitive' } }, { slug: { contains: search, mode: 'insensitive' } }] }
      : undefined;

    if (q(req.query.view) === 'subscriptions') {
      const where: Prisma.WorkspaceSubscriptionWhereInput = {
        ...(status ? { status } : {}),
        ...(wsFilter ? { workspace: wsFilter } : {}),
      };
      const [total, rows] = await Promise.all([
        prisma.workspaceSubscription.count({ where }),
        prisma.workspaceSubscription.findMany({
          where,
          skip,
          take,
          orderBy: { createdAt: 'desc' },
          include: {
            workspace: { select: { id: true, name: true } },
            plan: { select: { key: true, name: true, priceMonthly: true, priceYearly: true, currency: true } },
            _count: { select: { payments: true } },
          },
        }),
      ]);
      return res.status(200).json({ data: rows, total, page, pageSize });
    }

    const where: Prisma.WorkspacePaymentWhereInput = {
      ...(status ? { status } : {}),
      ...(wsFilter ? { workspace: wsFilter } : {}),
    };
    const [total, rows, sums] = await Promise.all([
      prisma.workspacePayment.count({ where }),
      prisma.workspacePayment.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: {
          workspace: { select: { id: true, name: true } },
          subscription: { select: { interval: true, plan: { select: { name: true } } } },
        },
      }),
      prisma.workspacePayment.groupBy({ by: ['status'], _sum: { amount: true }, _count: { _all: true } }),
    ]);
    res.status(200).json({
      data: rows,
      total,
      page,
      pageSize,
      totals: sums.map((s) => ({ status: s.status, amount: s._sum.amount ?? 0, count: s._count._all })),
    });
  },
});
