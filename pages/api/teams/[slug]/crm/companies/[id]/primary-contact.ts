import { crmRoute, routeId } from '@/lib/crm/http';
import { setPrimaryContact } from '@/lib/crm/companies';
import { setPrimaryContactInput } from '@/lib/crm/schemas';

export default crmRoute({
  PUT: (req, ctx) => setPrimaryContact(ctx, routeId(req), setPrimaryContactInput.parse(req.body).contactId),
});
