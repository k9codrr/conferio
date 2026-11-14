// POST /api/workspace/:id/teams { name } — create a team inside the workspace (plan team limit enforced)
import { z } from 'zod';
import { ApiError } from '@/lib/errors';
import { slugify } from '@/lib/server-common';
import { createTeam, isTeamExists } from 'models/team';
import { userHandler, parse, q } from '@/lib/platform/http';
import { requireWorkspaceManager } from '@/lib/platform/workspace';
import { recordMetric } from '@/lib/metrics';

export default userHandler({
  POST: async (req, res, user) => {
    const id = q(req.query.id);
    await requireWorkspaceManager(user.id, id);
    const { name } = parse(z.object({ name: z.string().trim().min(1).max(104) }), req.body);
    const slug = slugify(name);
    if (!slug) throw new ApiError(400, 'Team name must contain letters or numbers');
    if (await isTeamExists(slug)) throw new ApiError(400, 'A team with the slug already exists.');
    const team = await createTeam({ userId: user.id, name, slug, workspaceId: id });
    recordMetric('team.created');
    res.status(201).json({ data: team });
  },
});
