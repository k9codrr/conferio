import { crmRoute, routeId } from '@/lib/crm/http';
import { deleteCompany, getCompany, updateCompany } from '@/lib/crm/companies';
import { companyUpdateInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => getCompany(ctx, routeId(req)),
  PATCH: (req, ctx) => updateCompany(ctx, routeId(req), companyUpdateInput.parse(req.body)),
  DELETE: (req, ctx) => deleteCompany(ctx, routeId(req)),
});
