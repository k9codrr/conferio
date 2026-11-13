import { crmRoute, queryString } from '@/lib/crm/http';
import { companyOptions } from '@/lib/crm/companies';

export default crmRoute({
  GET: (req, ctx) => companyOptions(ctx, queryString(req, 'q')),
});
