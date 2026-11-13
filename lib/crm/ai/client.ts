import Anthropic from '@anthropic-ai/sdk';
import { CrmError } from '../http';

export const CRM_AI_MODEL = 'claude-opus-5-5';

let client: Anthropic | null = null;

// The AI is an optional capability: without a key the CRM works exactly as before, minus the AI features.
export function aiConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function anthropic(): Anthropic {
  if (!aiConfigured()) {
    throw new CrmError(503, 'The CRM assistant is not set up. Add ANTHROPIC_API_KEY to the server environment.');
  }
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return client;
}

export function translateAiError(error: unknown): never {
  if (error instanceof CrmError) throw error;
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    throw new CrmError(503, 'The AI key was rejected. Check ANTHROPIC_API_KEY in the server environment.');
  }
  if (error instanceof Anthropic.RateLimitError) {
    throw new CrmError(429, 'The AI is busy right now. Try again in a minute.');
  }
  if (error instanceof Anthropic.BadRequestError) {
    console.error('[crm-ai] bad request', error.message);
    throw new CrmError(502, 'The AI could not process that request.');
  }
  if (error instanceof Anthropic.APIConnectionError) {
    throw new CrmError(502, 'Could not reach the AI service. Check the server network.');
  }
  if (error instanceof Anthropic.APIError) {
    console.error('[crm-ai] api error', error.status, error.message);
    throw new CrmError(502, 'The AI service returned an error. Try again shortly.');
  }
  throw error;
}

export function textOf(message: Anthropic.Message): string {
  return message.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('')
    .trim();
}
