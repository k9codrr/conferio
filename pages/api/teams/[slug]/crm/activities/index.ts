import { crmRoute } from '@/lib/crm/http';
import { createActivity, timeline } from '@/lib/crm/activities';
import { activityCreateInput, timelineInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => timeline(ctx, timelineInput.parse(req.query)),
  POST: (req, ctx) => createActivity(ctx, activityCreateInput.parse(req.body)),
});
