import { crmRoute, routeId } from '@/lib/crm/http';
import { assignCompanyMember, listCompanyMembers, unassignCompanyMember } from '@/lib/crm/companies';
import { companyMemberInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => listCompanyMembers(ctx, routeId(req)),
  POST: (req, ctx) => assignCompanyMember(ctx, routeId(req), companyMemberInput.parse(req.body)),
  PATCH: (req, ctx) => assignCompanyMember(ctx, routeId(req), companyMemberInput.parse(req.body)),
  DELETE: (req, ctx) => unassignCompanyMember(ctx, routeId(req), routeId(req, 'userId')),
});
