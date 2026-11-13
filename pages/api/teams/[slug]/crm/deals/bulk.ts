import { crmRoute } from '@/lib/crm/http';
import { bulkDeals } from '@/lib/crm/deals';
import { dealBulkInput } from '@/lib/crm/schemas';

export default crmRoute({
  POST: (req, ctx) => bulkDeals(ctx, dealBulkInput.parse(req.body)),
});
