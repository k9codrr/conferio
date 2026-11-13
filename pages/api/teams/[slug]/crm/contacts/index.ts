import { crmRoute } from '@/lib/crm/http';
import { createContact, listContacts } from '@/lib/crm/contacts';
import { contactCreateInput, contactListInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => listContacts(ctx, contactListInput.parse(req.query)),
  POST: (req, ctx) => createContact(ctx, contactCreateInput.parse(req.body)),
});
