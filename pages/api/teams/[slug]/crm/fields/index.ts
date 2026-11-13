import { crmRoute, queryString, requireManager } from '@/lib/crm/http';
import { createField, listFields, reorderFields } from '@/lib/crm/fields';
import { fieldCreateInput, fieldEntity, fieldReorderInput } from '@/lib/crm/schemas';
import type { FieldEntity } from '@/lib/crm/constants';

export default crmRoute({
  GET: (req, ctx) =>
    listFields(
      ctx,
      fieldEntity.parse(queryString(req, 'entity')) as FieldEntity,
      queryString(req, 'archived') === 'true'
    ),
  POST: (req, ctx) => {
    requireManager(ctx);
    return createField(ctx, fieldCreateInput.parse(req.body));
  },
  PUT: (req, ctx) => {
    requireManager(ctx);
    const input = fieldReorderInput.parse(req.body);
    return reorderFields(ctx, input.entity as FieldEntity, input.ids);
  },
});
