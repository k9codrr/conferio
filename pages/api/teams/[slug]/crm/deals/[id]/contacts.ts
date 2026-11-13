import { crmRoute, routeId } from '@/lib/crm/http';
import { attachDealContact, dealContactOptions, detachDealContact, setDealContactRole } from '@/lib/crm/deals';
import { dealAttachContactInput, dealContactRoleInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => dealContactOptions(ctx, routeId(req)),
  POST: (req, ctx) => attachDealContact(ctx, routeId(req), dealAttachContactInput.parse(req.body)),
  PATCH: (req, ctx) => setDealContactRole(ctx, routeId(req), dealContactRoleInput.parse(req.body)),
  DELETE: (req, ctx) => detachDealContact(ctx, routeId(req), routeId(req, 'contactId')),
});
