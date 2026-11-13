import { crmRoute } from '@/lib/crm/http';
import { importInput, importRows } from '@/lib/crm/transfer';

export const config = { api: { bodyParser: { sizeLimit: '5mb' } }, maxDuration: 300 };

export default crmRoute({
  POST: (req, ctx) => importRows(ctx, importInput.parse(req.body)),
});
