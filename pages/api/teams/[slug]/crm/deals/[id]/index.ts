import { crmRoute, routeId } from '@/lib/crm/http';
import { deleteDeal, getDeal, updateDeal } from '@/lib/crm/deals';
import { dealUpdateInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => getDeal(ctx, routeId(req)),
  PATCH: (req, ctx) => updateDeal(ctx, routeId(req), dealUpdateInput.parse(req.body)),
  DELETE: (req, ctx) => deleteDeal(ctx, routeId(req)),
});
