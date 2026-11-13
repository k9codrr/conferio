import { crmRoute } from '@/lib/crm/http';
import { bulkCompanies } from '@/lib/crm/companies';
import { companyBulkInput } from '@/lib/crm/schemas';

export default crmRoute({
  POST: (req, ctx) => bulkCompanies(ctx, companyBulkInput.parse(req.body)),
});
