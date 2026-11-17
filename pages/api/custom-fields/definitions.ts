// /api/custom-fields/definitions?entity=task[&teamSlug=][&recordId= (docs: use the doc's team)]
// GET → { fields, canManage, members }    POST {field}    PATCH {id, ...field} | {order: id[]}    DELETE ?id=
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publish } from '@/lib/sse';
import {
  canManageFields, createDef, deleteDef, getDefs, isEntity, recordAccess, reorderDefs, resolveTeam, updateDef,
} from '@/lib/custom-fields/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const entity = req.query.entity;
    if (!isEntity(entity)) return res.status(400).json({ error: 'Unknown entity' });

    // Docs belong to a specific team; everything else uses the current team.
    let team = await resolveTeam(userId, req.query.teamSlug as string, req.cookies);
    if (entity === 'doc' && typeof req.query.recordId === 'string') {
      const a = await recordAccess(userId, 'doc', req.query.recordId);
      if (a.teamId) {
        const m = await prisma.teamMember.findFirst({ where: { userId, teamId: a.teamId }, select: { role: true } });
        team = { teamId: a.teamId, role: (m?.role as string) ?? 'MEMBER' };
      }
    }
    if (!team) return res.status(400).json({ error: 'Join a team to use custom fields' });
    const canManage = canManageFields(team.role);

    if (req.method === 'GET') {
      const [fields, members] = await Promise.all([
        getDefs(team.teamId, entity),
        prisma.teamMember.findMany({ where: { teamId: team.teamId }, select: { user: { select: { id: true, name: true, image: true } } } }),
      ]);
      return res.status(200).json({ fields, canManage, teamId: team.teamId, members: members.map((m) => m.user) });
    }

    if (!canManage) return res.status(403).json({ error: 'Only owners, admins and managers can change fields' });

    let result: unknown;
    if (req.method === 'POST') result = await createDef(team.teamId, entity, req.body);
    else if (req.method === 'PATCH') {
      result = Array.isArray(req.body?.order)
        ? await reorderDefs(team.teamId, entity, req.body.order)
        : await updateDef(team.teamId, entity, String(req.body?.id), req.body);
    } else if (req.method === 'DELETE') {
      await deleteDef(team.teamId, entity, String(req.query.id));
      result = { ok: true };
    } else {
      res.setHeader('Allow', 'GET, POST, PATCH, DELETE');
      return res.status(405).end();
    }
    publish('custom-fields:changed', { teamId: team.teamId, entity, scope: 'definitions' }).catch(() => {});
    return res.status(200).json({ field: result });
  } catch (e: any) {
    return res.status(e.status || 500).json({ error: e.message || 'Failed' });
  }
}
