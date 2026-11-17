// /api/custom-fields/values
// GET ?entity=task&ids=a,b,c      → { values: { [id]: { [fieldId]: value } } }  (only records you can access)
// PUT { entity, id, values: { [fieldId]: value|null } }   (null clears)
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { broadcastClipEvent, publish, SSE_EVENTS } from '@/lib/sse';
import { getDefs, getValues, isEntity, recordAccess, resolveTeam, setValues } from '@/lib/custom-fields/store';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const session = await getServerSession(req, res, authOptions);
    const userId = (session?.user as any)?.id as string | undefined;
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const entity = req.query.entity;
      if (!isEntity(entity)) return res.status(400).json({ error: 'Unknown entity' });
      const ids = String(req.query.ids || '').split(',').filter(Boolean).slice(0, 200);
      const access = await Promise.all(ids.map((id) => recordAccess(userId, entity, id)));
      const allowed = ids.filter((_, i) => access[i].ok);
      return res.status(200).json({ values: await getValues(entity, allowed) });
    }

    if (req.method === 'PUT') {
      const { entity, id, values } = req.body ?? {};
      if (!isEntity(entity) || typeof id !== 'string' || !values || typeof values !== 'object') {
        return res.status(400).json({ error: 'entity, id and values are required' });
      }
      const access = await recordAccess(userId, entity, id);
      if (!access.ok) return res.status(403).json({ error: 'No access to this record' });

      let teamId = access.teamId;
      if (!teamId) teamId = (await resolveTeam(userId, req.query.teamSlug as string, req.cookies))?.teamId;
      if (!teamId) return res.status(400).json({ error: 'No team' });
      if (access.teamId) {
        const member = await prisma.teamMember.findFirst({ where: { userId, teamId }, select: { role: true } });
        if (member?.role === 'CLIENT') return res.status(403).json({ error: 'Clients cannot edit fields' });
      }

      const next = await setValues(entity, id, await getDefs(teamId, entity), values);

      // Realtime: task modals/boards refresh; everyone else viewing the record too.
      if (entity === 'task' && access.boardId) {
        broadcastClipEvent(SSE_EVENTS.TASK_UPDATED, { type: 'task:updated', boardId: access.boardId, taskId: id }).catch(() => {});
      }
      publish('custom-fields:changed', {
        entity, id, scope: 'values',
        ...(entity === 'doc' ? { teamId } : entity === 'task' && access.boardId ? { boardId: access.boardId } : { userIds: [userId] }),
      }).catch(() => {});
      return res.status(200).json({ values: next });
    }

    res.setHeader('Allow', 'GET, PUT');
    return res.status(405).end();
  } catch (e: any) {
    return res.status(e.status || 500).json({ error: e.message || 'Failed' });
  }
}
