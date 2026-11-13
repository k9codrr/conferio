import React, { useEffect, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Pencil, Plus, RotateCcw, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { FIELD_TYPES, FIELD_TYPE_LABELS, type FieldEntity, type FieldType } from '@/lib/crm/constants';
import { toQuery, useCrmMutation, useCrmQuery, type FieldDefinition } from './api';
import { FieldLabel, Spinner } from './primitives';

const ENTITY_LABEL: Record<FieldEntity, string> = { COMPANY: 'companies', CONTACT: 'contacts', DEAL: 'deals' };

export function FieldsManager({ entity, canManage }: { entity: FieldEntity; canManage: boolean }) {
  const fields = useCrmQuery<FieldDefinition[]>(['fields', entity, 'archived'], `/fields${toQuery({ entity, archived: true })}`);
  const [editing, setEditing] = useState<FieldDefinition | 'new' | null>(null);

  const update = useCrmMutation<{ id: string; data: Record<string, unknown> }>((call, input) => call(`/fields/${input.id}`, 'PATCH', input.data));
  const remove = useCrmMutation<string>((call, id) => call(`/fields/${id}`, 'DELETE'), { success: 'Field deleted.' });
  const reorder = useCrmMutation<string[]>((call, ids) => call('/fields', 'PUT', { entity, ids }));

  const active = (fields.data ?? []).filter((field) => !field.archived);
  const archived = (fields.data ?? []).filter((field) => field.archived);

  const move = (index: number, delta: number) => {
    const ids = active.map((field) => field.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    const swap = ids[index];
    ids[index] = ids[target];
    ids[target] = swap;
    reorder.mutate(ids);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Extra fields on {ENTITY_LABEL[entity]}, beyond the built-in ones.</p>
        {canManage ? (
          <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
            <Plus />
            Add field
          </Button>
        ) : null}
      </div>

      {fields.isPending ? (
        <Spinner />
      ) : active.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground dark:border-[#2a2a2a]">No custom fields yet.</p>
      ) : (
        <ul className="divide-y rounded-lg border bg-white dark:divide-[#1f1f1f] dark:border-[#222] dark:bg-[#111]">
          {active.map((field, index) => (
            <li key={field.id} className="flex items-center gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {field.label}
                  {field.required ? <span className="text-red-500"> *</span> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {field.typeLabel} · key <code>{field.key}</code>
                  {field.showOnTable ? ' · shown in table' : ''}
                  {!field.showOnSheet ? ' · hidden on record' : ''}
                  {field.type === 'SELECT' ? ` · ${field.options.map((option) => option.label).join(', ')}` : ''}
                </div>
              </div>
              {canManage ? (
                <div className="flex items-center gap-0.5">
                  <IconButton label="Move up" disabled={index === 0 || reorder.isPending} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
                  <IconButton label="Move down" disabled={index === active.length - 1 || reorder.isPending} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
                  <IconButton label="Edit" onClick={() => setEditing(field)}><Pencil /></IconButton>
                  <IconButton label="Archive" onClick={() => update.mutate({ id: field.id, data: { archived: true } })}><Archive /></IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 ? (
        <div>
          <p className="mb-1 text-xs font-medium text-muted-foreground">Archived: hidden everywhere, values kept</p>
          <ul className="divide-y rounded-lg border dark:divide-[#1f1f1f] dark:border-[#222]">
            {archived.map((field) => (
              <li key={field.id} className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground">
                <span className="flex-1 truncate">{field.label} · {field.typeLabel}</span>
                {canManage ? (
                  <>
                    <IconButton label="Restore" onClick={() => update.mutate({ id: field.id, data: { archived: false } })}><RotateCcw /></IconButton>
                    <IconButton
                      label="Delete for good"
                      onClick={() => {
                        if (window.confirm(`Delete ${field.label} and every value stored in it?`)) remove.mutate(field.id);
                      }}
                    >
                      <Trash2 />
                    </IconButton>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <FieldDialog entity={entity} field={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function IconButton({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick} className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 [&_svg]:size-3.5">
      {children}
    </button>
  );
}

function FieldDialog({ entity, field, onClose }: { entity: FieldEntity; field: FieldDefinition | 'new' | null; onClose: () => void }) {
  const isNew = field === 'new';
  const existing = field && field !== 'new' ? field : null;
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('TEXT');
  const [options, setOptions] = useState<{ id?: string; label: string }[]>([]);
  const [required, setRequired] = useState(false);
  const [showOnSheet, setShowOnSheet] = useState(true);
  const [showOnTable, setShowOnTable] = useState(false);

  useEffect(() => {
    if (!field) return;
    setLabel(existing?.label ?? '');
    setType(existing?.type ?? 'TEXT');
    setOptions(existing?.options.map((option) => ({ id: option.id, label: option.label })) ?? [{ label: '' }]);
    setRequired(existing?.required ?? false);
    setShowOnSheet(existing?.showOnSheet ?? true);
    setShowOnTable(existing?.showOnTable ?? false);
  }, [field]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCrmMutation<Record<string, unknown>>(
    (call, input) => (existing ? call(`/fields/${existing.id}`, 'PATCH', input) : call('/fields', 'POST', { ...input, entity })),
    { success: existing ? 'Field updated.' : 'Field added.', onSuccess: onClose }
  );

  const cleanOptions = options.map((option) => ({ ...option, label: option.label.trim() })).filter((option) => option.label);
  const canSave = label.trim() !== '' && (type !== 'SELECT' || cleanOptions.length > 0);

  return (
    <Dialog open={field !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New field' : `Edit ${existing?.label}`}</DialogTitle>
          <DialogDescription>Fields show on every record of this type and can be filtered into the table.</DialogDescription>
        </DialogHeader>
        <form
          id="crm-field-form"
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSave) return;
            save.mutate({ label: label.trim(), type, options: type === 'SELECT' ? cleanOptions : [], required, showOnSheet, showOnTable });
          }}
        >
          <div>
            <FieldLabel>Label</FieldLabel>
            <Input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Contract value tier" autoFocus />
          </div>
          <div>
            <FieldLabel>Type</FieldLabel>
            <Select value={type} onValueChange={(value) => setType(value as FieldType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {FIELD_TYPES.map((value) => <SelectItem key={value} value={value}>{FIELD_TYPE_LABELS[value]}</SelectItem>)}
              </SelectContent>
            </Select>
            {existing ? <p className="mt-1 text-xs text-muted-foreground">The type can only change while no record holds a value.</p> : null}
          </div>
          {type === 'SELECT' ? (
            <div className="space-y-1.5">
              <FieldLabel>Options</FieldLabel>
              {options.map((option, index) => (
                <div key={option.id ?? `new-${index}`} className="flex gap-1">
                  <Input
                    value={option.label}
                    onChange={(event) => setOptions(options.map((entry, i) => (i === index ? { ...entry, label: event.target.value } : entry)))}
                    className="h-8"
                  />
                  <button type="button" aria-label="Remove option" onClick={() => setOptions(options.filter((_, i) => i !== index))} className="rounded p-1.5 hover:bg-accent">
                    <X className="size-3.5" />
                  </button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setOptions([...options, { label: '' }])}>
                <Plus />
                Add option
              </Button>
            </div>
          ) : null}
          <div className="space-y-2 pt-1">
            {[
              { label: 'Required', value: required, set: setRequired },
              { label: 'Show on the record sheet', value: showOnSheet, set: setShowOnSheet },
              { label: 'Show as a table column', value: showOnTable, set: setShowOnTable },
            ].map((toggle) => (
              <label key={toggle.label} className="flex items-center gap-2 text-sm">
                <Checkbox checked={toggle.value} onCheckedChange={(checked) => toggle.set(checked === true)} />
                {toggle.label}
              </label>
            ))}
          </div>
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="crm-field-form" disabled={!canSave || save.isPending}>
            {save.isPending ? <Spinner className="text-current" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
