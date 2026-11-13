import { crmRoute } from '@/lib/crm/http';
import { getBrief, researchCompany, researchContact, reviewDeal } from '@/lib/crm/ai/research';
import { anchorInput, researchInput } from '@/lib/crm/ai/anchor';

export const config = { maxDuration: 300 };

export default crmRoute({
  GET: (req, ctx) => {
    const { kind, id } = anchorInput.parse(req.query);
    if (!kind || !id) return Promise.resolve(null);
    return getBrief(ctx, kind === 'company' ? { companyId: id } : kind === 'contact' ? { contactId: id } : { dealId: id });
  },
  POST: (req, ctx) => {
    const { kind, id } = researchInput.parse(req.body);
    if (kind === 'company') return researchCompany(ctx, id);
    if (kind === 'contact') return researchContact(ctx, id);
    return reviewDeal(ctx, id);
  },
});
