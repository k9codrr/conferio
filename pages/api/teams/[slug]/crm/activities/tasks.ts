import { crmRoute } from '@/lib/crm/http';
import { myTasks } from '@/lib/crm/activities';
import { myTasksInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => myTasks(ctx, myTasksInput.parse(req.query)),
});
