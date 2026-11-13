// Shared between API routes and the CRM UI. Keep this file free of server-only imports.

export type DealStage =
  | 'DEMO_BOOKED'
  | 'QUALIFIED_TO_BUY'
  | 'UNQUALIFIED_TO_BUY'
  | 'DECISION_MAKER_BOUGHT_IN'
  | 'CONTRACT_SENT'
  | 'CLOSED_WON'
  | 'CLOSED_LOST';

export type ActivityType =
  | 'NOTE'
  | 'CALL'
  | 'EMAIL'
  | 'MEETING'
  | 'TASK'
  | 'STAGE_CHANGE'
  | 'ENRICHMENT';

export type FieldEntity = 'COMPANY' | 'CONTACT' | 'DEAL';

export type FieldType =
  | 'TEXT'
  | 'LONG_TEXT'
  | 'NUMBER'
  | 'DATE'
  | 'CHECKBOX'
  | 'SELECT'
  | 'URL'
  | 'EMAIL'
  | 'PHONE'
  | 'USER';

export type FieldValueJson = string | number | boolean | null;

export const STAGE_ORDER: DealStage[] = [
  'DEMO_BOOKED',
  'QUALIFIED_TO_BUY',
  'DECISION_MAKER_BOUGHT_IN',
  'CONTRACT_SENT',
  'CLOSED_WON',
  'CLOSED_LOST',
  'UNQUALIFIED_TO_BUY',
];

export const OPEN_DEAL_STAGES: DealStage[] = [
  'DEMO_BOOKED',
  'QUALIFIED_TO_BUY',
  'DECISION_MAKER_BOUGHT_IN',
  'CONTRACT_SENT',
];

export const CLOSED_DEAL_STAGES: DealStage[] = [
  'CLOSED_WON',
  'CLOSED_LOST',
  'UNQUALIFIED_TO_BUY',
];

export const LOSING_DEAL_STAGES: DealStage[] = ['CLOSED_LOST', 'UNQUALIFIED_TO_BUY'];

export function isClosedStage(stage: DealStage): boolean {
  return CLOSED_DEAL_STAGES.indexOf(stage) !== -1;
}

export function isLosingStage(stage: DealStage): boolean {
  return LOSING_DEAL_STAGES.indexOf(stage) !== -1;
}

export type StageTone = 'neutral' | 'info' | 'warning' | 'success' | 'error';

export const STAGE_PRESENTATION: Record<DealStage, { label: string; tone: StageTone }> = {
  DEMO_BOOKED: { label: 'Demo booked', tone: 'neutral' },
  QUALIFIED_TO_BUY: { label: 'Qualified to buy', tone: 'info' },
  DECISION_MAKER_BOUGHT_IN: { label: 'Decision maker in', tone: 'info' },
  CONTRACT_SENT: { label: 'Contract sent', tone: 'warning' },
  CLOSED_WON: { label: 'Closed won', tone: 'success' },
  CLOSED_LOST: { label: 'Closed lost', tone: 'error' },
  UNQUALIFIED_TO_BUY: { label: 'Unqualified', tone: 'neutral' },
};

export const STAGE_COLORS: Record<DealStage, string> = {
  DEMO_BOOKED: '#94a3b8',
  QUALIFIED_TO_BUY: '#3b82f6',
  DECISION_MAKER_BOUGHT_IN: '#8b5cf6',
  CONTRACT_SENT: '#f59e0b',
  CLOSED_WON: '#22c55e',
  CLOSED_LOST: '#ef4444',
  UNQUALIFIED_TO_BUY: '#71717a',
};

export function dealStageLabel(stage: DealStage): string {
  return STAGE_PRESENTATION[stage]?.label ?? stage;
}

export const DEAL_STAGE_OPTIONS = STAGE_ORDER.map((value) => ({
  value,
  label: STAGE_PRESENTATION[value].label,
}));

export const CLOSING_WINDOWS = ['overdue', 'this-month', 'next-month', 'later', 'none'] as const;
export type ClosingWindow = (typeof CLOSING_WINDOWS)[number];

export const CLOSING_LABELS: Record<ClosingWindow, string> = {
  overdue: 'Overdue',
  'this-month': 'This month',
  'next-month': 'Next month',
  later: 'Later',
  none: 'No date',
};

export const COMPOSABLE_ACTIVITY_TYPES: ActivityType[] = ['NOTE', 'CALL', 'EMAIL', 'MEETING', 'TASK'];

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  NOTE: 'Note',
  CALL: 'Call',
  EMAIL: 'Email',
  MEETING: 'Meeting',
  TASK: 'Task',
  STAGE_CHANGE: 'Stage change',
  ENRICHMENT: 'AI research',
};

export const TIMELINE_FILTERS = ['all', 'history', 'notes', 'upcoming', 'done', 'email', 'meetings'] as const;
export type TimelineFilter = (typeof TIMELINE_FILTERS)[number];

export const FIELD_ENTITIES: FieldEntity[] = ['COMPANY', 'CONTACT', 'DEAL'];

export const FIELD_TYPES: FieldType[] = [
  'TEXT',
  'LONG_TEXT',
  'NUMBER',
  'DATE',
  'CHECKBOX',
  'SELECT',
  'URL',
  'EMAIL',
  'PHONE',
  'USER',
];

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  TEXT: 'Text',
  LONG_TEXT: 'Long text',
  NUMBER: 'Number',
  DATE: 'Date',
  CHECKBOX: 'Checkbox',
  SELECT: 'Select',
  URL: 'URL',
  EMAIL: 'Email',
  PHONE: 'Phone',
  USER: 'Team member',
};

export const CURRENCIES = [
  'USD', 'EUR', 'GBP', 'INR', 'JPY', 'CNY', 'AUD', 'CAD', 'CHF', 'SGD',
  'AED', 'SAR', 'HKD', 'NZD', 'SEK', 'NOK', 'DKK', 'ZAR', 'BRL', 'MXN',
];

export const FACET_ALL = 'all';
export const FACET_UNASSIGNED = 'unassigned';
export const NO_COMPANY = 'none';

export const MAX_AMOUNT_CENTS = 99_999_999_999_999;
export const MAX_BULK_IDS = 100;

export type RecordKind = 'company' | 'contact' | 'deal';

export function contactName(contact: { firstName: string; lastName?: string | null }): string {
  return [contact.firstName, contact.lastName].filter(Boolean).join(' ');
}

export function formatMoney(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

export function formatMoneyCompact(cents: number | null | undefined, currency: string): string {
  if (cents === null || cents === undefined) return '—';
  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(0)} ${currency}`;
  }
}
