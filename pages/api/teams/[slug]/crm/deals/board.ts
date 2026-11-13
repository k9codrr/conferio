import { crmRoute, queryString } from '@/lib/crm/http';
import { dealBoard } from '@/lib/crm/deals';

export default crmRoute({
  GET: (req, ctx) => dealBoard(ctx, { q: queryString(req, 'q'), owner: queryString(req, 'owner', 'all') }),
});
