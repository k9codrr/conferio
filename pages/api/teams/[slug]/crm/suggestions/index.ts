import { crmRoute, queryString } from '@/lib/crm/http';
import { listSuggestions } from '@/lib/crm/ai/research';

export default crmRoute({
  GET: (req, ctx) => {
    const companyId = queryString(req, 'companyId');
    const contactId = queryString(req, 'contactId');
    return listSuggestions(ctx, companyId ? { companyId } : { contactId });
  },
});
