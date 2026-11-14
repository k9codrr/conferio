// GET   /api/admin/teams?search=&workspaceId=&page= — all teams
// PATCH /api/admin/teams?id=… { workspaceId } — move a team to another workspace
import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { adminHandler, audit } from '@/lib/platform/admin';
import { pageParams } from '@/lib/platform/admin-queries';
import { parse, q } from '@/lib/platform/http';

export default adminHandler({
  GET: async (req, res) => {
    const { page, pageSize, skip, take } = pageParams(req.query);
    const search = q(req.query.search).trim();
    const workspaceId = q(req.query.workspaceId);
    const where: Prisma.TeamWhereInput = {
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { slug: { contains: search, mode: 'insensitive' } },
              { workspace: { name: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
      ...(workspaceId ? { workspaceId } : {}),
    };
    const [total, rows] = await Promise.all([
      prisma.team.count({ where }),
      prisma.team.findMany({
        where,
        skip,
        take,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          slug: true,
          createdAt: true,
          workspace: { select: { id: true, name: true, status: true } },
          _count: { select: { members: true, channels: true, pages: true, files: true, crmDeals: true } },
          members: {
            where: { role: 'OWNER' },
            take: 1,
            select: { user: { select: { id: true, name: true, email: true } } },
          },
        },
      }),
    ]);
    res.status(200).json({
      data: rows.map(({ members, _count, ...t }) => ({
        ...t,
        owner: members[0]?.user ?? null,
        counts: _count,
      })),
      total,
      page,
      pageSize,
    });
  },

  PATCH: async (req, res, actor) => {
    const id = q(req.query.id);
    const { workspaceId } = parse(z.object({ workspaceId: z.string().min(1) }), req.body);
    const [team, ws] = await Promise.all([
      prisma.team.findUnique({ where: { id }, select: { id: true, name: true, workspaceId: true } }),
      prisma.workspace.findUnique({ where: { id: workspaceId }, select: { id: true } }),
    ]);
    if (!team) throw new ApiError(404, 'Team not found');
    if (!ws) throw new ApiError(400, 'Unknown workspace');
    await prisma.team.update({ where: { id }, data: { workspaceId } });
    await audit(actor.id, 'team.moved', { type: 'team', id }, { from: team.workspaceId, to: workspaceId, name: team.name });
    res.status(200).json({ data: { ok: true } });
  },
});
