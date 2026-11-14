// GET /api/dashboard/activity — workspace activity feed for the dashboard card.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '@/lib/auth';
import { getActivityFeed, type FeedKind } from '@/lib/dashboard/activity-feed';
import { getAccessForUser } from '@/lib/platform/workspace';
import { MODULE_COOKIE, type ModuleKey } from '@/lib/platform/modules';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const [feed, access] = await Promise.all([
      getActivityFeed({ id: session.user.id, email: session.user.email }),
      getAccessForUser(session.user.id, req.cookies[MODULE_COOKIE] ?? null),
    ]);
    // Drop items from modules that are switched off for the user's workspace.
    const moduleOf: Partial<Record<FeedKind, ModuleKey>> = {
      mail: 'mail',
      crm: 'crm',
      file: 'drive',
      notetaker: 'meetings',
      doc: 'docs',
      task: 'scrumboard',
      workload: 'workload',
      clip: 'clips',
      whiteboard: 'whiteboard',
    };
    feed.items = feed.items.filter((i) => {
      const m = moduleOf[i.kind];
      return !m || access.modules[m] !== false;
    });
    if (access.modules.mail === false) feed.mail = 'restricted';
    res.setHeader('Cache-Control', 'private, no-store');
    return res.status(200).json(feed);
  } catch (error) {
    console.error('[dashboard/activity]', error);
    return res.status(500).json({ error: 'Failed to load activity' });
  }
}
