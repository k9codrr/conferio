import { crmRoute } from '@/lib/crm/http';
import { createDeal, listDeals } from '@/lib/crm/deals';
import { dealCreateInput, dealListInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => listDeals(ctx, dealListInput.parse(req.query)),
  POST: (req, ctx) => createDeal(ctx, dealCreateInput.parse(req.body)),
});
