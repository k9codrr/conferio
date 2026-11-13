import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { STAGE_ORDER, contactName, dealStageLabel, type RecordKind } from '../constants';
import { assignCompanyMember, getCompany, updateCompany } from '../companies';
import { getContact, updateContact } from '../contacts';
import { createDeal, getDeal, setDealStage, updateDeal } from '../deals';
import { createActivity, myTasks, updateActivity } from '../activities';
import { CrmError, type CrmContext } from '../http';
import { quickSearch } from '../search';

export type ToolAction = { kind: RecordKind | 'task'; id: string; label: string };

type ToolOutcome = { result: string; action?: ToolAction; isError?: boolean };

function nullable(type: 'string' | 'number', description?: string) {
  return { anyOf: [{ type }, { type: 'null' }], ...(description ? { description } : {}) };
}

const nullableString = nullable('string');
const recordKind = { type: 'string', enum: ['company', 'contact', 'deal'] } as const;

const COMPANY_FIELDS = ['name', 'domain', 'website', 'description', 'industry', 'city', 'stateCode', 'country', 'phone', 'email', 'linkedinUrl', 'twitterUrl'] as const;
const CONTACT_FIELDS = ['firstName', 'lastName', 'email', 'phone', 'title', 'linkedinUrl', 'twitterUrl', 'githubUrl'] as const;
const DEAL_FIELDS = ['name', 'description', 'expectedCloseDate', 'amount', 'currency'] as const;
const ALL_FIELDS = Array.from(new Set<string>([...COMPANY_FIELDS, ...CONTACT_FIELDS, ...DEAL_FIELDS]));

export const CRM_TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_crm',
    description: 'Find companies, contacts and deals in this team by name, domain or email. Use it to look up ids before acting on a record you were not given.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string', description: 'At least two characters.' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_record',
    description: 'Read the full current details, timeline and AI brief of one company, contact or deal.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { kind: recordKind, id: { type: 'string' } },
      required: ['kind', 'id'],
      additionalProperties: false,
    },
  },
  {
    name: 'list_open_tasks',
    description: 'List open CRM tasks, either the current user\'s or the whole team\'s, soonest due first.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { scope: { type: 'string', enum: ['me', 'everyone'] } },
      required: ['scope'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_task',
    description: 'Create a follow-up task on a record. Assign it to a team member by user id, or pass null to assign it to the current user. The assignee is notified.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        record_kind: recordKind,
        record_id: { type: 'string' },
        subject: { type: 'string', description: 'The thing to do, as a short imperative.' },
        details: nullableString,
        due_date: nullable('string', 'YYYY-MM-DD, or null for no due date.'),
        assignee_user_id: nullableString,
      },
      required: ['record_kind', 'record_id', 'subject', 'details', 'due_date', 'assignee_user_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'complete_task',
    description: 'Mark an open task as done.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { task_id: { type: 'string' } },
      required: ['task_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'log_activity',
    description: 'Log a note, call, email or meeting on a record. Use when_iso for a call or meeting scheduled in the future; null means it happened now.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        record_kind: recordKind,
        record_id: { type: 'string' },
        type: { type: 'string', enum: ['NOTE', 'CALL', 'EMAIL', 'MEETING'] },
        subject: nullableString,
        body: { type: 'string' },
        when_iso: nullable('string', 'ISO 8601 date-time, or null.'),
      },
      required: ['record_kind', 'record_id', 'type', 'subject', 'body', 'when_iso'],
      additionalProperties: false,
    },
  },
  {
    name: 'update_record',
    description: 'Change standard fields on a company, contact or deal. Only change what the user asked for or confirmed. Amount is in major units (e.g. 2500 for 2,500). Dates are YYYY-MM-DD.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        record_kind: recordKind,
        record_id: { type: 'string' },
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: { field: { type: 'string', enum: ALL_FIELDS }, value: nullableString },
            required: ['field', 'value'],
            additionalProperties: false,
          },
        },
      },
      required: ['record_kind', 'record_id', 'changes'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_owner',
    description: 'Make a team member the owner of a company, contact or deal. They are notified.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { record_kind: recordKind, record_id: { type: 'string' }, user_id: { type: 'string' } },
      required: ['record_kind', 'record_id', 'user_id'],
      additionalProperties: false,
    },
  },
  {
    name: 'set_deal_stage',
    description: 'Move a deal to another stage. Closing as lost or unqualified requires a reason the user gave you; never invent one.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        deal_id: { type: 'string' },
        stage: { type: 'string', enum: STAGE_ORDER },
        reason: nullableString,
      },
      required: ['deal_id', 'stage', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'assign_team_member',
    description: 'Assign a team member to work a client company, with an optional role such as Account manager. They are notified.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { company_id: { type: 'string' }, user_id: { type: 'string' }, role: nullableString },
      required: ['company_id', 'user_id', 'role'],
      additionalProperties: false,
    },
  },
  {
    name: 'create_deal',
    description: 'Open a new deal on a company. Amount in major units or null. Owner null means the current user.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        company_id: { type: 'string' },
        name: { type: 'string' },
        amount: nullable('number'),
        currency: nullable('string', 'Three-letter code, or null for the team default.'),
        stage: { type: 'string', enum: STAGE_ORDER },
        expected_close_date: nullable('string', 'YYYY-MM-DD or null.'),
        owner_user_id: nullableString,
      },
      required: ['company_id', 'name', 'amount', 'currency', 'stage', 'expected_close_date', 'owner_user_id'],
      additionalProperties: false,
    },
  },
];

const kindEnum = z.enum(['company', 'contact', 'deal']);
const stageEnum = z.enum(STAGE_ORDER as [string, ...string[]]);
const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const INPUTS = {
  search_crm: z.object({ query: z.string() }),
  get_record: z.object({ kind: kindEnum, id: z.string() }),
  list_open_tasks: z.object({ scope: z.enum(['me', 'everyone']) }),
  create_task: z.object({
    record_kind: kindEnum,
    record_id: z.string(),
    subject: z.string().min(1),
    details: z.string().nullable(),
    due_date: isoDay.nullable(),
    assignee_user_id: z.string().nullable(),
  }),
  complete_task: z.object({ task_id: z.string() }),
  log_activity: z.object({
    record_kind: kindEnum,
    record_id: z.string(),
    type: z.enum(['NOTE', 'CALL', 'EMAIL', 'MEETING']),
    subject: z.string().nullable(),
    body: z.string(),
    when_iso: z.string().nullable(),
  }),
  update_record: z.object({
    record_kind: kindEnum,
    record_id: z.string(),
    changes: z.array(z.object({ field: z.string(), value: z.string().nullable() })).min(1),
  }),
  set_owner: z.object({ record_kind: kindEnum, record_id: z.string(), user_id: z.string() }),
  set_deal_stage: z.object({ deal_id: z.string(), stage: stageEnum, reason: z.string().nullable() }),
  assign_team_member: z.object({ company_id: z.string(), user_id: z.string(), role: z.string().nullable() }),
  create_deal: z.object({
    company_id: z.string(),
    name: z.string().min(1),
    amount: z.number().nonnegative().nullable(),
    currency: z.string().nullable(),
    stage: stageEnum,
    expected_close_date: isoDay.nullable(),
    owner_user_id: z.string().nullable(),
  }),
};

type ToolName = keyof typeof INPUTS;

function anchorFor(kind: RecordKind, id: string) {
  return kind === 'company' ? { companyId: id } : kind === 'contact' ? { contactId: id } : { dealId: id };
}

function compact(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (v === null || (Array.isArray(v) && v.length === 0) ? undefined : v));
}

async function readRecord(ctx: CrmContext, kind: RecordKind, id: string) {
  if (kind === 'company') return getCompany(ctx, id);
  if (kind === 'contact') return getContact(ctx, id);
  return getDeal(ctx, id);
}

async function recordName(ctx: CrmContext, kind: RecordKind, id: string): Promise<string> {
  const record = await readRecord(ctx, kind, id);
  return 'name' in record ? (record.name as string) : contactName(record as { firstName: string; lastName: string | null });
}

export async function runCrmTool(ctx: CrmContext, name: string, input: unknown): Promise<ToolOutcome> {
  const schema = INPUTS[name as ToolName];
  if (!schema) return { result: `Unknown tool ${name}.`, isError: true };

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { result: `Invalid input: ${parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')}`, isError: true };
  }

  try {
    return await execute(ctx, name as ToolName, parsed.data);
  } catch (error) {
    if (error instanceof CrmError) return { result: error.message, isError: true };
    console.error('[crm-ai] tool failed', name, error);
    return { result: 'That action failed on the server.', isError: true };
  }
}

async function execute(ctx: CrmContext, name: ToolName, input: any): Promise<ToolOutcome> {
  switch (name) {
    case 'search_crm': {
      const { hits } = await quickSearch(ctx, input.query);
      return { result: hits.length ? compact(hits) : 'No matches.' };
    }

    case 'get_record': {
      const record = await readRecord(ctx, input.kind, input.id);
      return { result: compact(record).slice(0, 12000) };
    }

    case 'list_open_tasks': {
      const tasks = await myTasks(ctx, { window: 'all', scope: input.scope, limit: 30 });
      return {
        result: tasks.length
          ? compact(tasks.map((t) => ({ id: t.id, subject: t.subject, dueAt: t.dueAt, assignee: t.assignee?.name, company: t.company?.name, deal: t.deal?.name })))
          : 'No open tasks.',
      };
    }

    case 'create_task': {
      const task = await createActivity(ctx, {
        type: 'TASK',
        subject: input.subject,
        body: input.details ?? undefined,
        dueAt: input.due_date ? new Date(`${input.due_date}T09:00:00`).toISOString() : null,
        assigneeId: input.assignee_user_id ?? ctx.userId,
        ...anchorFor(input.record_kind, input.record_id),
      });
      return {
        result: `Created task ${task.id} for ${task.assignee?.name ?? 'the current user'}.`,
        action: { kind: input.record_kind, id: input.record_id, label: `Task: ${input.subject}` },
      };
    }

    case 'complete_task': {
      const task = await updateActivity(ctx, input.task_id, { completed: true });
      return { result: `Marked "${task.subject}" done.`, action: { kind: 'task', id: task.id, label: `Done: ${task.subject}` } };
    }

    case 'log_activity': {
      const entry = await createActivity(ctx, {
        type: input.type,
        subject: input.subject ?? undefined,
        body: input.body,
        occurredAt: input.when_iso ?? undefined,
        ...anchorFor(input.record_kind, input.record_id),
      });
      return {
        result: `Logged ${input.type.toLowerCase()} ${entry.id}.`,
        action: { kind: input.record_kind, id: input.record_id, label: `Logged ${input.type.toLowerCase()}${input.subject ? `: ${input.subject}` : ''}` },
      };
    }

    case 'update_record': {
      const allowed: readonly string[] =
        input.record_kind === 'company' ? COMPANY_FIELDS : input.record_kind === 'contact' ? CONTACT_FIELDS : DEAL_FIELDS;
      const bad = input.changes.filter((change: { field: string }) => allowed.indexOf(change.field) === -1);
      if (bad.length) {
        return { result: `A ${input.record_kind} has no field ${bad.map((b: { field: string }) => b.field).join(', ')}. Allowed: ${allowed.join(', ')}.`, isError: true };
      }

      const data: Record<string, unknown> = {};
      for (const change of input.changes as { field: string; value: string | null }[]) {
        if (input.record_kind === 'deal' && change.field === 'amount') {
          const amount = change.value === null ? null : Number(change.value);
          if (amount !== null && !(amount >= 0)) return { result: 'Amount must be a positive number.', isError: true };
          data.amountCents = amount === null ? null : Math.round(amount * 100);
        } else if (input.record_kind === 'deal' && change.field === 'expectedCloseDate') {
          data.expectedCloseDate = change.value ? new Date(`${change.value.slice(0, 10)}T12:00:00`).toISOString() : null;
        } else {
          data[change.field] = change.value ?? '';
        }
      }

      if (input.record_kind === 'company') await updateCompany(ctx, input.record_id, data);
      else if (input.record_kind === 'contact') await updateContact(ctx, input.record_id, data);
      else await updateDeal(ctx, input.record_id, data);

      const fields = input.changes.map((c: { field: string }) => c.field).join(', ');
      return { result: `Updated ${fields}.`, action: { kind: input.record_kind, id: input.record_id, label: `Updated ${fields}` } };
    }

    case 'set_owner': {
      if (input.record_kind === 'company') await updateCompany(ctx, input.record_id, { ownerId: input.user_id });
      else if (input.record_kind === 'contact') await updateContact(ctx, input.record_id, { ownerId: input.user_id });
      else await updateDeal(ctx, input.record_id, { ownerId: input.user_id });
      const name = await recordName(ctx, input.record_kind, input.record_id);
      return { result: `Owner changed on ${name}.`, action: { kind: input.record_kind, id: input.record_id, label: `New owner on ${name}` } };
    }

    case 'set_deal_stage': {
      const outcome = await setDealStage(ctx, input.deal_id, { stage: input.stage, closedReason: input.reason ?? undefined });
      return {
        result: outcome.changed ? `Deal moved to ${dealStageLabel(input.stage)}.` : 'The deal was already at that stage.',
        action: { kind: 'deal', id: input.deal_id, label: `Stage: ${dealStageLabel(input.stage)}` },
      };
    }

    case 'assign_team_member': {
      const members = await assignCompanyMember(ctx, input.company_id, { userId: input.user_id, role: input.role });
      const member = members.find((m) => m.id === input.user_id);
      return {
        result: `${member?.name ?? 'They'} are now assigned to the client.`,
        action: { kind: 'company', id: input.company_id, label: `Assigned ${member?.name ?? 'team member'}` },
      };
    }

    case 'create_deal': {
      const deal = await createDeal(ctx, {
        name: input.name,
        companyId: input.company_id,
        ownerId: input.owner_user_id ?? ctx.userId,
        stage: input.stage,
        amountCents: input.amount === null ? null : Math.round(input.amount * 100),
        currency: input.currency ?? undefined,
        expectedCloseDate: input.expected_close_date ? new Date(`${input.expected_close_date}T12:00:00`).toISOString() : null,
      });
      return { result: `Opened deal ${deal.id}.`, action: { kind: 'deal', id: deal.id, label: `New deal: ${deal.name}` } };
    }
  }
}
