import { z } from 'zod';
import {
  COMPOSABLE_ACTIVITY_TYPES,
  FIELD_ENTITIES,
  FIELD_TYPES,
  MAX_AMOUNT_CENTS,
  MAX_BULK_IDS,
  STAGE_ORDER,
  TIMELINE_FILTERS,
} from './constants';

const stageEnum = z.enum(STAGE_ORDER as [string, ...string[]]);
const currencyCode = z.string().trim().regex(/^[A-Za-z]{3}$/, 'Use a three-letter currency code like USD.');

export const listInput = z.object({
  q: z.string().default(''),
  sort: z.string().default(''),
  dir: z.enum(['asc', 'desc']).default('asc'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const recordFieldValues = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean(), z.null()])
);

export const bulkIdsInput = z.object({
  ids: z
    .array(z.string())
    .min(1, 'Nothing was selected.')
    .max(MAX_BULK_IDS, 'Too many records at once. Select a page at a time.'),
});

// Companies

export const companyListInput = listInput.extend({
  owner: z.string().default('all'),
  industry: z.string().default('all'),
  source: z.string().default('all'),
  member: z.string().default('all'),
});
export type CompanyListInput = z.infer<typeof companyListInput>;

export const companyCreateInput = z.object({
  name: z.string().trim().min(1, 'A company needs a name.'),
  domain: z.string().trim().optional(),
  industry: z.string().trim().optional(),
  ownerId: z.string().nullable().optional(),
  memberIds: z.array(z.string()).optional(),
});
export type CompanyCreateInput = z.infer<typeof companyCreateInput>;

export const companyUpdateInput = z.object({
  name: z.string().trim().min(1).optional(),
  domain: z.string().optional(),
  website: z.string().optional(),
  description: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  stateCode: z.string().optional(),
  country: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  linkedinUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
  ownerId: z.string().nullable().optional(),
  fields: recordFieldValues.optional(),
});
export type CompanyUpdateInput = z.infer<typeof companyUpdateInput>;

export const companyMemberInput = z.object({
  userId: z.string().min(1, 'Choose a team member.'),
  role: z.string().trim().max(80, 'That role is too long.').nullable().optional(),
});

export const setPrimaryContactInput = z.object({ contactId: z.string().nullable() });

export const companyBulkInput = z.discriminatedUnion('action', [
  bulkIdsInput.extend({ action: z.literal('owner'), ownerId: z.string().nullable() }),
  bulkIdsInput.extend({ action: z.literal('delete') }),
  bulkIdsInput.extend({ action: z.literal('assign'), userId: z.string().min(1) }),
]);

// Contacts

export const contactListInput = listInput.extend({
  owner: z.string().default('all'),
  company: z.string().default('all'),
  source: z.string().default('all'),
});
export type ContactListInput = z.infer<typeof contactListInput>;

export const contactCreateInput = z.object({
  firstName: z.string().trim().min(1, 'A contact needs a first name.'),
  lastName: z.string().trim().optional(),
  email: z.string().trim().email('That is not an email address.').optional().or(z.literal('')),
  phone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  companyId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
});
export type ContactCreateInput = z.infer<typeof contactCreateInput>;

export const contactUpdateInput = z.object({
  firstName: z.string().trim().min(1).optional(),
  lastName: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  title: z.string().optional(),
  linkedinUrl: z.string().optional(),
  twitterUrl: z.string().optional(),
  githubUrl: z.string().optional(),
  companyId: z.string().nullable().optional(),
  ownerId: z.string().nullable().optional(),
  fields: recordFieldValues.optional(),
});
export type ContactUpdateInput = z.infer<typeof contactUpdateInput>;

export const contactBulkInput = z.discriminatedUnion('action', [
  bulkIdsInput.extend({ action: z.literal('owner'), ownerId: z.string().nullable() }),
  bulkIdsInput.extend({ action: z.literal('company'), companyId: z.string().nullable() }),
  bulkIdsInput.extend({ action: z.literal('delete') }),
]);

// Deals

const amountCents = z
  .number()
  .int()
  .min(0)
  .max(MAX_AMOUNT_CENTS, 'That amount is too large to record.')
  .nullable()
  .optional();

export const dealListInput = listInput.extend({
  status: z.string().default('all'),
  owner: z.string().default('all'),
  stage: z.string().default('all'),
  closing: z.string().default('all'),
  company: z.string().default('all'),
});
export type DealListInput = z.infer<typeof dealListInput>;

export const dealCreateInput = z.object({
  name: z.string().trim().min(1, 'A deal needs a name.'),
  companyId: z.string().min(1, 'A deal belongs to a company.'),
  ownerId: z.string().min(1, 'A deal needs an owner.'),
  stage: stageEnum.optional(),
  amountCents,
  currency: currencyCode.optional(),
  expectedCloseDate: z.string().nullable().optional(),
});
export type DealCreateInput = z.infer<typeof dealCreateInput>;

export const dealUpdateInput = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  companyId: z.string().optional(),
  ownerId: z.string().optional(),
  amountCents,
  currency: currencyCode.optional(),
  expectedCloseDate: z.string().nullable().optional(),
  fields: recordFieldValues.optional(),
});
export type DealUpdateInput = z.infer<typeof dealUpdateInput>;

export const setStageInput = z.object({
  stage: stageEnum,
  closedReason: z.string().trim().optional(),
});

const dealContactRole = z.string().trim().max(80, 'That role is too long.').nullable();

export const dealAttachContactInput = z.object({
  contactId: z.string().min(1, 'Choose somebody to bring onto the deal.'),
  role: dealContactRole.optional(),
});

export const dealContactRoleInput = z.object({
  contactId: z.string(),
  role: dealContactRole,
});

export const dealBulkInput = z.discriminatedUnion('action', [
  bulkIdsInput.extend({ action: z.literal('owner'), ownerId: z.string().min(1, 'A deal needs an owner.') }),
  bulkIdsInput.extend({
    action: z.literal('stage'),
    stage: stageEnum,
    closedReason: z.string().trim().optional(),
  }),
  bulkIdsInput.extend({ action: z.literal('delete') }),
]);

// Activities

export const timelineInput = z.object({
  companyId: z.string().optional(),
  contactId: z.string().optional(),
  dealId: z.string().optional(),
  filter: z.enum(TIMELINE_FILTERS).default('all'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});
export type TimelineInput = z.infer<typeof timelineInput>;

export const activityCreateInput = z
  .object({
    type: z.enum(COMPOSABLE_ACTIVITY_TYPES as [string, ...string[]]),
    subject: z.string().trim().optional(),
    body: z.string().trim().optional(),
    occurredAt: z.string().optional(),
    dueAt: z.string().nullable().optional(),
    assigneeId: z.string().nullable().optional(),
    companyId: z.string().optional(),
    contactId: z.string().optional(),
    dealId: z.string().optional(),
  })
  .refine((input) => input.companyId || input.contactId || input.dealId, {
    message: 'An activity has to be about a company, a contact or a deal.',
  })
  .refine((input) => input.type !== 'TASK' || Boolean(input.subject), {
    message: 'A task needs a subject: it is the thing to do.',
    path: ['subject'],
  });
export type ActivityCreateInput = z.infer<typeof activityCreateInput>;

export const activityUpdateInput = z.object({
  completed: z.boolean().optional(),
  subject: z.string().trim().optional(),
  body: z.string().trim().optional(),
  dueAt: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
});

export const myTasksInput = z.object({
  window: z.enum(['overdue', 'upcoming', 'all']).default('all'),
  scope: z.enum(['me', 'everyone']).default('me'),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// Fields

export const fieldEntity = z.enum(FIELD_ENTITIES as [string, ...string[]]);

const fieldOptionInput = z.object({
  id: z.string().optional(),
  label: z.string().trim().min(1, 'An option needs a label.'),
});

export const fieldCreateInput = z.object({
  entity: fieldEntity,
  label: z.string().trim().min(1, 'A field needs a label.'),
  type: z.enum(FIELD_TYPES as [string, ...string[]]),
  options: z.array(fieldOptionInput).default([]),
  required: z.boolean().default(false),
  showOnSheet: z.boolean().default(true),
  showOnTable: z.boolean().default(false),
});
export type FieldCreateInput = z.infer<typeof fieldCreateInput>;

export const fieldUpdateInput = z.object({
  label: z.string().trim().min(1).optional(),
  type: z.enum(FIELD_TYPES as [string, ...string[]]).optional(),
  options: z.array(fieldOptionInput).optional(),
  required: z.boolean().optional(),
  showOnSheet: z.boolean().optional(),
  showOnTable: z.boolean().optional(),
  archived: z.boolean().optional(),
});
export type FieldUpdateInput = z.infer<typeof fieldUpdateInput>;

export const fieldReorderInput = z.object({
  entity: fieldEntity,
  ids: z.array(z.string()).min(1),
});

// Settings

export const settingsInput = z.object({
  reportingCurrency: currencyCode.optional(),
  exchangeRates: z.record(z.string(), z.number().positive('A rate has to be above zero.')).optional(),
});

export const dashboardInput = z.object({
  scope: z.enum(['me', 'everyone']).default('me'),
});
