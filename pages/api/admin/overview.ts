// GET /api/admin/overview — platform KPIs, charts and recent activity
import { adminHandler } from '@/lib/platform/admin';
import { getOverview } from '@/lib/platform/admin-queries';

export default adminHandler({
  GET: async (_req, res) => {
    res.status(200).json({ data: await getOverview() });
  },
});
