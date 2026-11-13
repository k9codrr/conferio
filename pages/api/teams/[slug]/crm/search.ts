import { crmRoute, queryString } from '@/lib/crm/http';
import { quickSearch } from '@/lib/crm/search';

export default crmRoute({
  GET: (req, ctx) => quickSearch(ctx, queryString(req, 'q')),
});
