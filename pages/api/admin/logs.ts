// GET /api/admin/logs?before=ISO&sources=audit,task&q=&limit= — platform-wide activity log
import { adminHandler } from '@/lib/platform/admin';
import { getAdminLogs, LOG_SOURCES, type LogSource } from '@/lib/platform/admin-logs';
import { q } from '@/lib/platform/http';

export default adminHandler({
  GET: async (req, res) => {
    const beforeRaw = q(req.query.before);
    const before = beforeRaw ? new Date(beforeRaw) : undefined;
    const sources = q(req.query.sources)
      .split(',')
      .filter((s): s is LogSource => (LOG_SOURCES as readonly string[]).includes(s));
    const data = await getAdminLogs({
      before: before && !isNaN(+before) ? before : undefined,
      sources,
      q: q(req.query.q),
      limit: Number(q(req.query.limit)) || 50,
    });
    res.status(200).json({ data });
  },
});
