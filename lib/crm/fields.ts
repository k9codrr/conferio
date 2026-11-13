import { Prisma } from '@prisma/client';
import type { CrmFieldDefinition, CrmFieldOption, CrmFieldValue } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  FIELD_TYPE_LABELS,
  type FieldEntity,
  type FieldType,
  type FieldValueJson,
} from './constants';
import { badRequest, conflict, notFound, requireTeamUser, type CrmContext } from './http';
import type { FieldCreateInput, FieldUpdateInput } from './schemas';

type DefinitionWithOptions = CrmFieldDefinition & { options: CrmFieldOption[] };
type ValueColumn = 'text' | 'number' | 'date' | 'bool' | 'optionId' | 'userId';
type RecordColumn = 'companyId' | 'contactId' | 'dealId';

const WITH_OPTIONS = { options: { orderBy: { position: 'asc' as const } } };

const COLUMNS: Record<FieldType, ValueColumn> = {
  TEXT: 'text',
  LONG_TEXT: 'text',
  URL: 'text',
  EMAIL: 'text',
  PHONE: 'text',
  NUMBER: 'number',
  DATE: 'date',
  CHECKBOX: 'bool',
  SELECT: 'optionId',
  USER: 'userId',
};

const RECORD_COLUMNS: Record<FieldEntity, RecordColumn> = {
  COMPANY: 'companyId',
  CONTACT: 'contactId',
  DEAL: 'dealId',
};

const RESERVED_KEYS = new Set(['id', 'createdat', 'updatedat', 'fields', 'owner', 'ownerid', 'new']);

export type SerializedField = {
  id: string;
  entity: FieldEntity;
  key: string;
  label: string;
  type: FieldType;
  typeLabel: string;
  required: boolean;
  showOnSheet: boolean;
  showOnTable: boolean;
  position: number;
  archived: boolean;
  options: { id: string; label: string; position: number }[];
};

export type RecordField = SerializedField & { value: FieldValueJson };

export function fieldKeyFromLabel(label: string): string {
  const key = label
    .trim()
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/^([0-9])/, 'f_$1')
    .slice(0, 60);

  return RESERVED_KEYS.has(key) ? `${key}_field` : key;
}

function usesOptions(type: string): boolean {
  return type === 'SELECT';
}

function serializeField(definition: DefinitionWithOptions, keepOptionId?: FieldValueJson): SerializedField {
  const options = definition.options
    .filter((option) => option.archivedAt === null || option.id === keepOptionId)
    .sort((a, b) => a.position - b.position)
    .map((option) => ({ id: option.id, label: option.label, position: option.position }));

  return {
    id: definition.id,
    entity: definition.entity as FieldEntity,
    key: definition.key,
    label: definition.label,
    type: definition.type as FieldType,
    typeLabel: FIELD_TYPE_LABELS[definition.type as FieldType],
    required: definition.required,
    showOnSheet: definition.showOnSheet,
    showOnTable: definition.showOnTable,
    position: definition.position,
    archived: definition.archivedAt !== null,
    options,
  };
}

function readValue(definition: DefinitionWithOptions, row: CrmFieldValue | undefined): FieldValueJson {
  if (!row) return null;
  switch (definition.type) {
    case 'CHECKBOX':
      return row.bool ?? null;
    case 'NUMBER':
      return row.number === null ? null : Number(row.number);
    case 'DATE':
      return row.date === null ? null : row.date.toISOString();
    case 'SELECT':
      return row.optionId ?? null;
    case 'USER':
      return row.userId ?? null;
    default:
      return row.text ?? null;
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/;

function coerceValue(definition: DefinitionWithOptions, input: unknown): Partial<Record<ValueColumn, unknown>> {
  const column = COLUMNS[definition.type as FieldType];
  const blank = input === null || input === undefined || (typeof input === 'string' && input.trim() === '');

  if (blank) {
    if (definition.required) throw badRequest(`${definition.label} cannot be empty.`);
    return { [column]: null };
  }

  switch (definition.type) {
    case 'CHECKBOX':
      if (typeof input === 'boolean') return { bool: input };
      if (input === 'true' || input === 'false') return { bool: input === 'true' };
      throw badRequest(`${definition.label} takes true or false.`);

    case 'NUMBER': {
      const parsed = typeof input === 'number' ? input : Number(String(input).trim());
      if (!Number.isFinite(parsed)) throw badRequest(`${definition.label} takes a number.`);
      return { number: new Prisma.Decimal(parsed) };
    }

    case 'DATE': {
      const raw = String(input).trim();
      const dateOnly = ISO_DATE.test(raw);
      if (!dateOnly && !ISO_DATE_TIME.test(raw)) {
        throw badRequest(`${definition.label} takes a date like 2027-03-31.`);
      }
      const parsed = new Date(dateOnly ? `${raw}T00:00:00.000Z` : raw);
      if (Number.isNaN(parsed.getTime())) throw badRequest(`${definition.label} takes a date like 2027-03-31.`);
      return { date: parsed };
    }

    case 'SELECT': {
      const raw = String(input).trim();
      const option = definition.options.find(
        (entry) => entry.archivedAt === null && (entry.id === raw || entry.label.toLowerCase() === raw.toLowerCase())
      );
      if (!option) throw badRequest(`${definition.label} has no option "${raw}".`);
      return { optionId: option.id };
    }

    case 'USER':
      return { userId: String(input).trim() };

    default:
      return { text: String(input).trim() };
  }
}

async function definitionsFor(
  teamId: string,
  entity: FieldEntity,
  client: Prisma.TransactionClient = prisma
): Promise<DefinitionWithOptions[]> {
  return client.crmFieldDefinition.findMany({
    where: { teamId, entity, archivedAt: null },
    include: WITH_OPTIONS,
    orderBy: { position: 'asc' },
  });
}

export async function listFields(ctx: CrmContext, entity: FieldEntity, includeArchived: boolean) {
  const definitions = await prisma.crmFieldDefinition.findMany({
    where: { teamId: ctx.teamId, entity, ...(includeArchived ? {} : { archivedAt: null }) },
    include: WITH_OPTIONS,
    orderBy: { position: 'asc' },
  });
  return definitions.map((definition) => serializeField(definition));
}

export async function createField(ctx: CrmContext, input: FieldCreateInput) {
  const key = fieldKeyFromLabel(input.label);
  if (!key) throw badRequest('That label does not make a usable key.');

  const taken = await prisma.crmFieldDefinition.findUnique({
    where: { teamId_entity_key: { teamId: ctx.teamId, entity: input.entity as FieldEntity, key } },
    select: { id: true },
  });
  if (taken) throw conflict(`There is already a field called "${key}".`);

  if (usesOptions(input.type) && input.options.length === 0) {
    throw badRequest('A select needs at least one option.');
  }

  const last = await prisma.crmFieldDefinition.findFirst({
    where: { teamId: ctx.teamId, entity: input.entity as FieldEntity },
    orderBy: { position: 'desc' },
    select: { position: true },
  });

  const definition = await prisma.crmFieldDefinition.create({
    data: {
      teamId: ctx.teamId,
      entity: input.entity as FieldEntity,
      key,
      label: input.label,
      type: input.type as FieldType,
      required: input.required,
      showOnSheet: input.showOnSheet,
      showOnTable: input.showOnTable,
      position: (last?.position ?? -1) + 1,
      options: usesOptions(input.type)
        ? { create: input.options.map((option, index) => ({ label: option.label, position: index })) }
        : undefined,
    },
    include: WITH_OPTIONS,
  });

  return serializeField(definition);
}

async function ownedField(ctx: CrmContext, id: string) {
  const definition = await prisma.crmFieldDefinition.findFirst({
    where: { id, teamId: ctx.teamId },
    include: WITH_OPTIONS,
  });
  if (!definition) throw notFound('That field does not exist.');
  return definition;
}

export async function updateField(ctx: CrmContext, id: string, data: FieldUpdateInput) {
  const existing = await ownedField(ctx, id);
  const type = (data.type ?? existing.type) as FieldType;

  if (data.type && data.type !== existing.type) {
    const values = await prisma.crmFieldValue.count({ where: { fieldId: id } });
    if (values > 0) {
      throw conflict('This field already holds values, so its type cannot change. Archive it and make a new one.');
    }
  }

  const optionCount = data.options
    ? data.options.length
    : existing.options.filter((option) => option.archivedAt === null).length;

  if (usesOptions(type) && optionCount === 0) throw badRequest('A select needs at least one option.');

  const definition = await prisma.$transaction(async (tx) => {
    if (data.options && usesOptions(type)) {
      const keep = data.options.map((option) => option.id).filter((value): value is string => Boolean(value));

      await tx.crmFieldOption.updateMany({
        where: { fieldId: id, id: { notIn: keep }, archivedAt: null },
        data: { archivedAt: new Date() },
      });

      for (let index = 0; index < data.options.length; index += 1) {
        const option = data.options[index];
        if (option.id) {
          await tx.crmFieldOption.updateMany({
            where: { id: option.id, fieldId: id },
            data: { label: option.label, position: index, archivedAt: null },
          });
        } else {
          await tx.crmFieldOption.create({ data: { fieldId: id, label: option.label, position: index } });
        }
      }
    }

    return tx.crmFieldDefinition.update({
      where: { id },
      data: {
        label: data.label,
        type: data.type as FieldType | undefined,
        required: data.required,
        showOnSheet: data.showOnSheet,
        showOnTable: data.showOnTable,
        archivedAt: data.archived === undefined ? undefined : data.archived ? new Date() : null,
      },
      include: WITH_OPTIONS,
    });
  });

  return serializeField(definition);
}

export async function reorderFields(ctx: CrmContext, entity: FieldEntity, ids: string[]) {
  const owned = await prisma.crmFieldDefinition.findMany({
    where: { id: { in: ids }, entity, teamId: ctx.teamId },
    select: { id: true },
  });
  if (owned.length !== ids.length) {
    throw badRequest('That order names a field which is not on this record type.');
  }

  await prisma.$transaction(
    ids.map((id, index) => prisma.crmFieldDefinition.update({ where: { id }, data: { position: index } }))
  );

  return listFields(ctx, entity, false);
}

export async function deleteField(ctx: CrmContext, id: string) {
  await ownedField(ctx, id);
  await prisma.crmFieldDefinition.delete({ where: { id } });
  return { id };
}

export async function fieldCoverage(ctx: CrmContext, id: string) {
  const definition = await ownedField(ctx, id);
  const column = RECORD_COLUMNS[definition.entity as FieldEntity];

  const [filled, total] = await Promise.all([
    prisma.crmFieldValue.count({ where: { fieldId: id, [column]: { not: null } } }),
    definition.entity === 'COMPANY'
      ? prisma.crmCompany.count({ where: { teamId: ctx.teamId } })
      : definition.entity === 'CONTACT'
        ? prisma.crmContact.count({ where: { teamId: ctx.teamId } })
        : prisma.crmDeal.count({ where: { teamId: ctx.teamId } }),
  ]);

  return { filled, total };
}

export async function valuesFor(teamId: string, entity: FieldEntity, recordId: string): Promise<RecordField[]> {
  const column = RECORD_COLUMNS[entity];
  const [definitions, rows] = await Promise.all([
    definitionsFor(teamId, entity),
    prisma.crmFieldValue.findMany({ where: { [column]: recordId } }),
  ]);

  const byField = new Map(rows.map((row) => [row.fieldId, row] as [string, CrmFieldValue]));

  return definitions.map((definition) => {
    const value = readValue(definition, byField.get(definition.id));
    return { ...serializeField(definition, value), value };
  });
}

export async function tableValuesFor(
  teamId: string,
  entity: FieldEntity,
  recordIds: string[]
): Promise<Map<string, Record<string, FieldValueJson>>> {
  const byRecord = new Map<string, Record<string, FieldValueJson>>();
  if (recordIds.length === 0) return byRecord;

  const definitions = await prisma.crmFieldDefinition.findMany({
    where: { teamId, entity, archivedAt: null, showOnTable: true },
    include: WITH_OPTIONS,
    orderBy: { position: 'asc' },
  });
  if (definitions.length === 0) return byRecord;

  const column = RECORD_COLUMNS[entity];
  const rows = await prisma.crmFieldValue.findMany({
    where: { [column]: { in: recordIds }, fieldId: { in: definitions.map((definition) => definition.id) } },
  });

  const byId = new Map(definitions.map((entry) => [entry.id, entry] as [string, DefinitionWithOptions]));

  for (const row of rows) {
    const recordId = row[column];
    if (!recordId) continue;
    const definition = byId.get(row.fieldId);
    if (!definition) continue;

    let value = readValue(definition, row);
    if (definition.type === 'SELECT' && typeof value === 'string') {
      value = definition.options.find((option) => option.id === value)?.label ?? null;
    }

    const current = byRecord.get(recordId) ?? {};
    current[definition.key] = value;
    byRecord.set(recordId, current);
  }

  return byRecord;
}

export async function tableColumnsFor(teamId: string, entity: FieldEntity) {
  const definitions = await prisma.crmFieldDefinition.findMany({
    where: { teamId, entity, archivedAt: null, showOnTable: true },
    orderBy: { position: 'asc' },
    select: { key: true, label: true, type: true },
  });
  return definitions;
}

export async function applyValues(
  tx: Prisma.TransactionClient,
  teamId: string,
  entity: FieldEntity,
  recordId: string,
  values: Record<string, unknown>
): Promise<void> {
  const keys = Object.keys(values);
  if (keys.length === 0) return;

  const definitions = await definitionsFor(teamId, entity, tx);
  const byKey = new Map(definitions.map((definition) => [definition.key, definition] as [string, DefinitionWithOptions]));
  const column = RECORD_COLUMNS[entity];

  const writes = keys.map((key) => {
    const definition = byKey.get(key);
    if (!definition) throw badRequest(`There is no field called "${key}".`);
    const data = coerceValue(definition, values[key]);
    return { definition, data, stored: data[COLUMNS[definition.type as FieldType]] };
  });

  for (const write of writes) {
    if (write.definition.type === 'USER' && typeof write.stored === 'string') {
      await requireTeamUser(teamId, write.stored);
    }
  }

  for (const { definition, data, stored } of writes) {
    if (stored === null || stored === undefined) {
      await tx.crmFieldValue.deleteMany({ where: { fieldId: definition.id, [column]: recordId } });
      continue;
    }

    const existing = await tx.crmFieldValue.findFirst({
      where: { fieldId: definition.id, [column]: recordId },
      select: { id: true },
    });

    if (existing) {
      await tx.crmFieldValue.update({
        where: { id: existing.id },
        data: data as Prisma.CrmFieldValueUncheckedUpdateInput,
      });
    } else {
      await tx.crmFieldValue.create({
        data: { fieldId: definition.id, [column]: recordId, ...data } as Prisma.CrmFieldValueUncheckedCreateInput,
      });
    }
  }
}
