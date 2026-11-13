import { crmRoute, routeId } from '@/lib/crm/http';
import { deleteContact, getContact, updateContact } from '@/lib/crm/contacts';
import { contactUpdateInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => getContact(ctx, routeId(req)),
  PATCH: (req, ctx) => updateContact(ctx, routeId(req), contactUpdateInput.parse(req.body)),
  DELETE: (req, ctx) => deleteContact(ctx, routeId(req)),
});
