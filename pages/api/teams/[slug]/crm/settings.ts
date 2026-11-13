import { crmRoute, requireManager } from '@/lib/crm/http';
import { currencySettings, updateCurrencySettings } from '@/lib/crm/currency';
import { settingsInput } from '@/lib/crm/schemas';

export default crmRoute({
  GET: (_req, ctx) => currencySettings(ctx.teamId),
  PUT: (req, ctx) => {
    requireManager(ctx);
    return updateCurrencySettings(ctx, settingsInput.parse(req.body));
  },
});
