import { crmRoute } from '@/lib/crm/http';
import { createCompany, listCompanies } from '@/lib/crm/companies';
import { companyCreateInput, companyListInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => listCompanies(ctx, companyListInput.parse(req.query)),
  POST: (req, ctx) => createCompany(ctx, companyCreateInput.parse(req.body)),
});
