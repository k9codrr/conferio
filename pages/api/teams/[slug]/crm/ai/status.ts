import { crmRoute } from '@/lib/crm/http';
import { CRM_AI_MODEL, aiConfigured } from '@/lib/crm/ai/client';

export default crmRoute({
  GET: async () => ({ available: aiConfigured(), model: CRM_AI_MODEL }),
});
