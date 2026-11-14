// GET  /api/workspace?teamSlug=…  — workspaces the user belongs to + which one is current
// POST /api/workspace { name }    — create a new workspace (starts on the default plan)
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { userHandler, parse, q } from '@/lib/platform/http';
import {
  createWorkspace,
  effectivePlan,
  managedWorkspaceIds,
  resolveUserTeam,
} from '@/lib/platform/workspace';
import { MODULE_COOKIE } from '@/lib/platform/modules';

export default userHandler({
  GET: async (req, res, user) => {
    const [workspaces, managed, current] = await Promise.all([
      prisma.workspace.findMany({
        where: { OR: [{ ownerId: user.id }, { teams: { some: { members: { some: { userId: user.id } } } } }] },
        include: { plan: true, _count: { select: { teams: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      managedWorkspaceIds(user.id),
      resolveUserTeam(user.id, q(req.query.teamSlug) || req.cookies[MODULE_COOKIE] || null),
    ]);
    const data = await Promise.all(
      workspaces.map(async (w) => {
        const plan = await effectivePlan(w);
        return {
          id: w.id,
          name: w.name,
          slug: w.slug,
          status: w.status,
          teams: w._count.teams,
          isOwner: w.ownerId === user.id,
          canManage: managed.includes(w.id),
          plan: plan ? { key: plan.key, name: plan.name } : null,
        };
      })
    );
    res.status(200).json({ data, currentWorkspaceId: current?.team.workspaceId ?? data[0]?.id ?? null });
  },

  POST: async (req, res, user) => {
    const { name } = parse(z.object({ name: z.string().trim().min(2).max(80) }), req.body);
    const ws = await createWorkspace({ ownerId: user.id, name, billingEmail: user.email });
    res.status(201).json({ data: ws });
  },
});
