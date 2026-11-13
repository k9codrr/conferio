import { crmRoute, routeId } from '@/lib/crm/http';
import { decideSuggestion } from '@/lib/crm/ai/research';
import { decisionInput } from '@/lib/crm/ai/anchor';

export default crmRoute({
  PATCH: (req, ctx) => decideSuggestion(ctx, routeId(req, 'suggestionId'), decisionInput.parse(req.body).decision),
});
