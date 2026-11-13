import { crmRoute } from '@/lib/crm/http';
import { crmTeamMembers } from '@/lib/crm/search';

export default crmRoute({
  GET: (_req, ctx) => crmTeamMembers(ctx),
});
