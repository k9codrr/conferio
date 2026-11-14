// GET /api/platform/access?teamSlug=… — which modules the signed-in user may use in the
// workspace of that team (or their default team). Called by the middleware gate and by
// the sidebar. Returns 200 with { signedIn: false } when there is no session.
import type { NextApiRequest, NextApiResponse } from 'next';
import { getSession } from '@/lib/session';
import { getAccessForUser } from '@/lib/platform/workspace';
import { MODULE_COOKIE } from '@/lib/platform/modules';
import { q } from '@/lib/platform/http';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: { message: 'Method not allowed' } });
  }
  res.setHeader('Cache-Control', 'private, no-store');
  try {
    const session = await getSession(req, res);
    if (!session?.user?.id) return res.status(200).json({ signedIn: false });
    const slug = q(req.query.teamSlug) || req.cookies[MODULE_COOKIE] || null;
    const access = await getAccessForUser(session.user.id, slug ? decodeURIComponent(slug) : null);
    return res.status(200).json({ signedIn: true, ...access });
  } catch (error) {
    console.error('[platform/access]', error);
    return res.status(500).json({ error: { message: 'Failed to resolve access' } });
  }
}
