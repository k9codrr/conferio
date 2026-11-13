import React from 'react';
import { format } from 'date-fns';
import type { FieldValueJson } from '@/lib/crm/constants';
import { useCrmMembers, type RecordField } from './api';
import { Empty, InlineField, InlineSelect, UNASSIGNED } from './primitives';

const NONE = '__none__';

function display(field: RecordField, memberName: (id: string) => string | undefined): React.ReactNode {
  const { value } = field;
  if (value === null || value === '') return null;
  switch (field.type) {
    case 'CHECKBOX':
      return value ? 'Yes' : 'No';
    case 'DATE':
      return typeof value === 'string' ? format(new Date(value), 'MMM d, yyyy') : String(value);
    case 'SELECT':
      return field.options.find((option) => option.id === value)?.label ?? <Empty>Retired option</Empty>;
    case 'USER':
      return memberName(String(value)) ?? <Empty>Former member</Empty>;
    case 'URL':
      return (
        <a href={String(value)} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} className="text-blue-600 hover:underline dark:text-blue-400">
          {String(value)}
        </a>
      );
    default:
      return String(value);
  }
}

export function RecordFields({ fields, onSave }: { fields: RecordField[]; onSave: (values: Record<string, FieldValueJson>) => void }) {
  const members = useCrmMembers();
  const memberName = (id: string) => members.data?.members.find((member) => member.id === id)?.name;

  const visible = fields.filter((field) => field.showOnSheet);
  if (visible.length === 0) return null;

  return (
    <>
      {visible.map((field) => {
        const label = field.required ? `${field.label} *` : field.label;
        const save = (value: FieldValueJson) => onSave({ [field.key]: value });

        if (field.type === 'CHECKBOX') {
          return (
            <InlineSelect
              key={field.id}
              label={label}
              value={field.value === null ? NONE : field.value ? 'true' : 'false'}
              options={[
                { value: NONE, label: 'Not set' },
                { value: 'true', label: 'Yes' },
                { value: 'false', label: 'No' },
              ]}
              onSave={(next) => save(next === NONE ? null : next === 'true')}
            />
          );
        }

        if (field.type === 'SELECT') {
          return (
            <InlineSelect
              key={field.id}
              label={label}
              value={typeof field.value === 'string' ? field.value : NONE}
              options={[{ value: NONE, label: 'Not set' }, ...field.options.map((option) => ({ value: option.id, label: option.label }))]}
              onSave={(next) => save(next === NONE ? null : next)}
            />
          );
        }

        if (field.type === 'USER') {
          return (
            <InlineSelect
              key={field.id}
              label={label}
              value={typeof field.value === 'string' ? field.value : UNASSIGNED}
              options={[
                { value: UNASSIGNED, label: 'Nobody' },
                ...(members.data?.members ?? []).map((member) => ({ value: member.id, label: member.name })),
              ]}
              onSave={(next) => save(next === UNASSIGNED ? null : next)}
            />
          );
        }

        const inputType =
          field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : field.type === 'EMAIL' ? 'email' : field.type === 'PHONE' ? 'tel' : field.type === 'URL' ? 'url' : 'text';
        const raw =
          field.value === null ? '' : field.type === 'DATE' && typeof field.value === 'string' ? field.value.slice(0, 10) : String(field.value);

        return (
          <InlineField
            key={field.id}
            label={label}
            value={raw}
            type={inputType}
            multiline={field.type === 'LONG_TEXT'}
            display={display(field, memberName)}
            onSave={(next) => save(next.trim() === '' ? null : field.type === 'NUMBER' ? Number(next) : next)}
          />
        );
      })}
    </>
  );
}
