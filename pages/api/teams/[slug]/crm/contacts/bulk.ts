import { crmRoute } from '@/lib/crm/http';
import { bulkContacts } from '@/lib/crm/contacts';
import { contactBulkInput } from '@/lib/crm/schemas';

export default crmRoute({
  POST: (req, ctx) => bulkContacts(ctx, contactBulkInput.parse(req.body)),
});
