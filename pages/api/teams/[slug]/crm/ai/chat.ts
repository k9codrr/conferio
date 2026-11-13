import { crmRoute } from '@/lib/crm/http';
import { getConversation, sendMessage, startNewConversation } from '@/lib/crm/ai/assistant';
import { anchorInput, chatInput, toAnchor } from '@/lib/crm/ai/anchor';

export const config = { maxDuration: 300 };

export default crmRoute({
  GET: (req, ctx) => getConversation(ctx, toAnchor(anchorInput.parse(req.query))),
  POST: (req, ctx) => {
    const input = chatInput.parse(req.body);
    return sendMessage(ctx, { anchor: toAnchor(input), conversationId: input.conversationId, message: input.message });
  },
  PUT: (req, ctx) => startNewConversation(ctx, toAnchor(anchorInput.parse(req.body ?? {}))),
});
