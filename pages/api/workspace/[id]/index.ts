// GET   /api/workspace/:id — plan, limits, usage, modules, teams (members of the workspace)
// PATCH /api/workspace/:id { name?, billingEmail? } — managers only
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { ApiError } from '@/lib/errors';
import { userHandler, parse, q } from '@/lib/platform/http';
import {
  canManageWorkspace,
  getWorkspaceSummary,
  isWorkspaceMember,
  requireWorkspaceManager,
} from '@/lib/platform/workspace';
import { isPlatformAdminUser } from '@/lib/platform/admin';

export default userHandler({
  GET: async (req, res, user) => {
    const id = q(req.query.id);
    if (!(await isWorkspaceMember(user.id, id)) && !(await isPlatformAdminUser(user.id))) {
      throw new ApiError(404, 'Workspace not found');
    }
    const summary = await getWorkspaceSummary(id);
    if (!summary) throw new ApiError(404, 'Workspace not found');
    const teams = await prisma.team.findMany({
      where: { workspaceId: id },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        createdAt: true,
        _count: { select: { members: true } },
        members: { where: { userId: user.id }, select: { role: true } },
      },
    });
    const { workspace, ...rest } = summary;
    res.status(200).json({
      data: {
        ...rest,
        workspace: {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          status: workspace.status,
          suspendedReason: workspace.suspendedReason,
          billingEmail: workspace.billingEmail,
          planExpiresAt: workspace.planExpiresAt,
          planSource: workspace.planSource,
          createdAt: workspace.createdAt,
          owner: workspace.owner,
        },
        canManage: await canManageWorkspace(user.id, id),
        teams: teams.map((t) => ({
          id: t.id,
          name: t.name,
          slug: t.slug,
          createdAt: t.createdAt,
          members: t._count.members,
          myRole: t.members[0]?.role ?? null,
        })),
      },
    });
  },

  PATCH: async (req, res, user) => {
    const id = q(req.query.id);
    await requireWorkspaceManager(user.id, id);
    const body = parse(
      z.object({
        name: z.string().trim().min(2).max(80).optional(),
        billingEmail: z.string().trim().email().nullable().optional(),
      }),
      req.body
    );
    const ws = await prisma.workspace.update({ where: { id }, data: body });
    res.status(200).json({ data: { id: ws.id, name: ws.name, billingEmail: ws.billingEmail } });
  },
});
