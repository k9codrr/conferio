import { z } from 'zod';
import type { Anchor } from './context';

export const anchorInput = z.object({
  kind: z.enum(['company', 'contact', 'deal']).optional().nullable(),
  id: z.string().optional().nullable(),
});

export function toAnchor(input: { kind?: string | null; id?: string | null }): Anchor {
  if (!input.kind || !input.id) return null;
  return { kind: input.kind as 'company' | 'contact' | 'deal', id: input.id };
}

export const chatInput = anchorInput.extend({
  conversationId: z.string().optional().nullable(),
  message: z.string().trim().min(1, 'Say something first.').max(8000, 'That message is too long.'),
});

export const researchInput = z.object({
  kind: z.enum(['company', 'contact', 'deal']),
  id: z.string().min(1),
});

export const decisionInput = z.object({ decision: z.enum(['accept', 'dismiss']) });
