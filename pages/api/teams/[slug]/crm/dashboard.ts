import { crmRoute } from '@/lib/crm/http';
import { dashboardSummary } from '@/lib/crm/dashboard';
import { dashboardInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => dashboardSummary(ctx, dashboardInput.parse(req.query).scope),
});
