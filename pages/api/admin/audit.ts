// GET /api/admin/audit?action=&page= — platform audit log
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { adminHandler } from '@/lib/platform/admin';
import { pageParams } from '@/lib/platform/admin-queries';
import { q } from '@/lib/platform/http';

export default adminHandler({
  GET: async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query);
    const action = q(req.query.action).trim();
    const where: Prisma.PlatformAuditLogWhereInput = action ? { action: { startsWith: action } } : {};
    const [total, rows] = await Promise.all([
      prisma.platformAuditLog.count({ where }),
      prisma.platformAuditLog.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        include: { actor: { select: { id: true, name: true, email: true } } },
      }),
    ]);
    res.status(200).json({ data: rows, total, page, pageSize });
  },
});
