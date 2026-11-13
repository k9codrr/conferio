import { crmRoute, requireManager, routeId } from '@/lib/crm/http';
import { deleteField, fieldCoverage, updateField } from '@/lib/crm/fields';
import { fieldUpdateInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (req, ctx) => fieldCoverage(ctx, routeId(req, 'fieldId')),
  PATCH: (req, ctx) => {
    requireManager(ctx);
    return updateField(ctx, routeId(req, 'fieldId'), fieldUpdateInput.parse(req.body));
  },
  DELETE: (req, ctx) => {
    requireManager(ctx);
    return deleteField(ctx, routeId(req, 'fieldId'));
  },
});
