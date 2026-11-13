import { crmRoute, routeId } from '@/lib/crm/http';
import { deleteActivity, updateActivity } from '@/lib/crm/activities';
import { activityUpdateInput } from '@/lib/crm/schemas';

export default crmRoute({
  PATCH: (req, ctx) => updateActivity(ctx, routeId(req, 'activityId'), activityUpdateInput.parse(req.body)),
  DELETE: (req, ctx) => deleteActivity(ctx, routeId(req, 'activityId')),
});
