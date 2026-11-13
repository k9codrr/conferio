import { crmRoute, routeId } from '@/lib/crm/http';
import { setDealStage } from '@/lib/crm/deals';
import { setStageInput } from '@/lib/crm/schemas';

export default crmRoute({
  PUT: (req, ctx) => setDealStage(ctx, routeId(req), setStageInput.parse(req.body)),
});
