import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { badRequest, notFound, type CrmContext } from '../http';
import { CRM_AI_MODEL, anthropic, textOf, translateAiError } from './client';
import { recordSnapshot, teamRoster, type Anchor } from './context';
import { CRM_TOOLS, runCrmTool, type ToolAction } from './tools';

const MAX_TOOL_ROUNDS = 8;
const MAX_HISTORY_MESSAGES = 80;

export type DisplayEntry = {
  role: 'user' | 'assistant';
  text: string;
  actions?: ToolAction[];
  at: string;
};

const INSTRUCTIONS = `You are the CRM assistant inside Conferio, a team workspace. You help a sales and account team work their clients: companies, the contacts at them, deals in the pipeline, and the activity timeline of notes, calls, emails, meetings and tasks.

Each user turn starts with a <crm_snapshot> of the record the user has open (or the team pipeline when nothing is open), taken just now. Treat it as the current truth; earlier snapshots in the conversation may be stale.

How to work:
- Answer from the CRM data. If the data does not say something, say so plainly; never invent facts about a person or a company, and never guess contact details.
- When the user asks you to do something (create a task, log a call, move a deal, assign someone, update a field, open a deal), do it with the tools, then say briefly what you did. When it is ambiguous who or what they mean, ask one short question instead of guessing.
- Do not take actions the user did not ask for. Suggesting next steps is welcome; performing them needs the user's go-ahead.
- Closing a deal as lost or unqualified needs the reason the user gave; ask for it if they did not.
- To assign work, use the user ids from the team roster. "Me" means the current user.
- Dates: resolve relative dates ("next Friday") against today's date given in the snapshot header.
- Write short, direct answers in plain prose or short lists. Amounts keep their currency.`;

function systemPrompt(roster: string): Anthropic.TextBlockParam[] {
  return [
    {
      type: 'text',
      text: `${INSTRUCTIONS}\n\nTeam roster (people you can assign work to):\n${roster}`,
      cache_control: { type: 'ephemeral' },
    },
  ];
}

function anchorWhere(anchor: Anchor): { companyId: string | null; contactId: string | null; dealId: string | null } {
  return {
    companyId: anchor?.kind === 'company' ? anchor.id : null,
    contactId: anchor?.kind === 'contact' ? anchor.id : null,
    dealId: anchor?.kind === 'deal' ? anchor.id : null,
  };
}

function readDisplay(raw: Prisma.JsonValue): DisplayEntry[] {
  return Array.isArray(raw) ? (raw as unknown as DisplayEntry[]) : [];
}

export async function getConversation(ctx: CrmContext, anchor: Anchor) {
  const conversation = await prisma.crmAiConversation.findFirst({
    where: { teamId: ctx.teamId, userId: ctx.userId, ...anchorWhere(anchor) },
    orderBy: { updatedAt: 'desc' },
    select: { id: true, title: true, display: true, updatedAt: true },
  });

  return conversation
    ? { id: conversation.id, title: conversation.title, entries: readDisplay(conversation.display), updatedAt: conversation.updatedAt.toISOString() }
    : null;
}

export async function startNewConversation(ctx: CrmContext, anchor: Anchor) {
  const conversation = await prisma.crmAiConversation.create({
    data: { teamId: ctx.teamId, userId: ctx.userId, ...anchorWhere(anchor) },
    select: { id: true },
  });
  return { id: conversation.id, title: null, entries: [], updatedAt: new Date().toISOString() };
}

export async function sendMessage(ctx: CrmContext, input: { anchor: Anchor; conversationId?: string | null; message: string }) {
  const message = input.message.trim();
  if (!message) throw badRequest('Say something first.');

  const conversation = input.conversationId
    ? await prisma.crmAiConversation.findFirst({
        where: { id: input.conversationId, teamId: ctx.teamId, userId: ctx.userId },
        select: { id: true, title: true, messages: true, display: true },
      })
    : null;
  if (input.conversationId && !conversation) throw notFound('That conversation no longer exists.');

  const history = (Array.isArray(conversation?.messages) ? conversation!.messages : []) as unknown as Anthropic.MessageParam[];
  if (history.length >= MAX_HISTORY_MESSAGES) {
    throw badRequest('This conversation is long. Start a new chat to keep answers sharp.');
  }

  const [snapshot, roster] = await Promise.all([recordSnapshot(ctx, input.anchor), teamRoster(ctx)]);
  const today = new Date().toISOString().slice(0, 10);

  const messages: Anthropic.MessageParam[] = [
    ...history,
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<crm_snapshot today="${today}" current_user="${ctx.userName} (user id ${ctx.userId})">\n${snapshot}\n</crm_snapshot>`,
        },
        { type: 'text', text: message },
      ],
    },
  ];

  const actions: ToolAction[] = [];
  let reply = '';

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
      const response = await anthropic()
        .messages.stream({
          model: CRM_AI_MODEL,
          max_tokens: 16000,
          thinking: { type: 'adaptive' },
          output_config: { effort: 'medium' },
          system: systemPrompt(roster),
          tools: CRM_TOOLS,
          messages,
        })
        .finalMessage();

      if (response.stop_reason === 'refusal') {
        reply = 'I can\'t help with that request.';
        break;
      }

      if (response.stop_reason === 'max_tokens') {
        reply = textOf(response) || 'That answer ran too long. Try asking for something narrower.';
        messages.push({ role: 'assistant', content: response.content });
        break;
      }

      messages.push({ role: 'assistant', content: response.content });

      const calls = response.content.filter((block): block is Anthropic.ToolUseBlock => block.type === 'tool_use');
      if (response.stop_reason !== 'tool_use' || calls.length === 0) {
        reply = textOf(response);
        break;
      }

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const call of calls) {
        const outcome = await runCrmTool(ctx, call.name, call.input);
        if (outcome.action) actions.push(outcome.action);
        results.push({ type: 'tool_result', tool_use_id: call.id, content: outcome.result, is_error: outcome.isError });
      }
      messages.push({ role: 'user', content: results });

      if (round === MAX_TOOL_ROUNDS - 1) reply = 'I stopped after several steps. Tell me if you want me to continue.';
    }
  } catch (error) {
    translateAiError(error);
  }

  const last = messages[messages.length - 1];
  if (last.role === 'user' && Array.isArray(last.content) && last.content.every((block) => block.type === 'tool_result')) {
    messages.push({ role: 'assistant', content: reply });
  }

  const now = new Date().toISOString();
  const display: DisplayEntry[] = [
    ...readDisplay((conversation?.display ?? []) as Prisma.JsonValue),
    { role: 'user', text: message, at: now },
    { role: 'assistant', text: reply || 'Done.', actions: actions.length ? actions : undefined, at: now },
  ];

  const data = {
    messages: messages as unknown as Prisma.InputJsonValue,
    display: display as unknown as Prisma.InputJsonValue,
    title: conversation?.title ?? message.slice(0, 80),
  };

  const saved = conversation
    ? await prisma.crmAiConversation.update({ where: { id: conversation.id }, data, select: { id: true, title: true, updatedAt: true } })
    : await prisma.crmAiConversation.create({
        data: { teamId: ctx.teamId, userId: ctx.userId, ...anchorWhere(input.anchor), ...data },
        select: { id: true, title: true, updatedAt: true },
      });

  return { id: saved.id, title: saved.title, entries: display, updatedAt: saved.updatedAt.toISOString(), changed: actions.length > 0 };
}
