'use client';

// Custom fields for any record (task, doc, note, reminder, event).
// Inline editors for every field type; owners/admins/managers can add,
// edit, reorder-by-recreate and delete fields. Updates live across users.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  Calendar, CheckSquare, ChevronDown, CircleDot, DollarSign, Hash, Link2, List, Mail, MoreHorizontal, Phone,
  Plus, Star, TextCursor, Trash2, Type, User, Percent, X, Settings2,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useSSE } from 'hooks/useSSE';

type Entity = 'task' | 'doc' | 'note' | 'reminder' | 'event';
type CfType = 'text' | 'long_text' | 'number' | 'currency' | 'date' | 'checkbox' | 'select' | 'multi_select' | 'url' | 'email' | 'phone' | 'rating' | 'progress' | 'person';
interface Option { id: string; label: string; color: string }
interface FieldDef { id: string; name: string; type: CfType; options?: Option[]; currency?: string; required?: boolean; description?: string }
interface Member { id: string; name: string | null; image: string | null }

const TYPE_META: Record<CfType, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  text: { label: 'Text', icon: Type }, long_text: { label: 'Long text', icon: TextCursor }, number: { label: 'Number', icon: Hash },
  currency: { label: 'Money', icon: DollarSign }, date: { label: 'Date', icon: Calendar }, checkbox: { label: 'Checkbox', icon: CheckSquare },
  select: { label: 'Dropdown', icon: CircleDot }, multi_select: { label: 'Labels', icon: List }, url: { label: 'Website', icon: Link2 },
  email: { label: 'Email', icon: Mail }, phone: { label: 'Phone', icon: Phone }, rating: { label: 'Rating', icon: Star },
  progress: { label: 'Progress', icon: Percent }, person: { label: 'People', icon: User },
};
const PALETTE = ['#64748b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];

const json = (r: Response) => r.json().then((d) => { if (!r.ok) throw new Error(d.error || 'Request failed'); return d; });

export default function CustomFieldsPanel({
  entity, recordId, teamSlug, className, title = 'Custom fields',
}: { entity: Entity; recordId: string; teamSlug?: string; className?: string; title?: string }) {
  const q = new URLSearchParams({ entity, ...(teamSlug ? { teamSlug } : {}), ...(entity === 'doc' ? { recordId } : {}) });
  const defsKey = `/api/custom-fields/definitions?${q}`;
  const valsKey = `/api/custom-fields/values?entity=${entity}&ids=${encodeURIComponent(recordId)}`;
  const { data: defsData, mutate: refreshDefs } = useSWR(defsKey, (u: string) => fetch(u).then(json));
  const { data: valsData, mutate: refreshVals } = useSWR(recordId ? valsKey : null, (u: string) => fetch(u).then(json));
  const fields: FieldDef[] = defsData?.fields ?? [];
  const members: Member[] = defsData?.members ?? [];
  const canManage = !!defsData?.canManage;
  const values: Record<string, any> = valsData?.values?.[recordId] ?? {};
  const [error, setError] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<FieldDef | 'new' | null>(null);

  useSSE((evt) => {
    if (evt.type === 'custom-fields:changed' && evt.entity === entity) {
      if (evt.scope === 'definitions') refreshDefs();
      if (evt.scope === 'values' && evt.id === recordId) refreshVals();
    }
    if (entity === 'task' && evt.type === 'task:updated' && (evt.taskId === recordId || evt.task?.id === recordId)) refreshVals();
  });

  const save = useCallback(async (fieldId: string, value: unknown) => {
    setError(null);
    const optimistic = { ...values, [fieldId]: value };
    refreshVals({ values: { [recordId]: optimistic } }, false);
    try {
      const d = await fetch('/api/custom-fields/values' + (teamSlug ? `?teamSlug=${teamSlug}` : ''), {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, id: recordId, values: { [fieldId]: value } }),
      }).then(json);
      refreshVals({ values: { [recordId]: d.values } }, false);
    } catch (e: any) {
      setError(e.message);
      refreshVals();
    }
  }, [values, refreshVals, recordId, entity, teamSlug]);

  if (!defsData) return null;
  if (!fields.length && !canManage) return null;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
        {canManage && (
          <button type="button" onClick={() => setEditingField('new')} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">
            <Plus className="size-3" />Add field
          </button>
        )}
      </div>
      {!fields.length && canManage && (
        <button type="button" onClick={() => setEditingField('new')} className="w-full rounded-md border border-dashed py-3 text-xs text-muted-foreground hover:bg-accent">
          Add fields like Budget, Client, Sprint, Story points…
        </button>
      )}
      <div className="space-y-0.5">
        {fields.map((f) => {
          const Icon = TYPE_META[f.type]?.icon ?? Type;
          return (
            <div key={f.id} className="group grid grid-cols-[minmax(110px,40%)_1fr_auto] items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/50">
              <span className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground" title={f.description}>
                <Icon className="size-3.5 shrink-0" /><span className="truncate">{f.name}{f.required && <span className="text-red-500">*</span>}</span>
              </span>
              <FieldEditor field={f} value={values[f.id]} members={members} onChange={(v) => save(f.id, v)} />
              {canManage ? (
                <button type="button" onClick={() => setEditingField(f)} className="rounded p-0.5 text-muted-foreground opacity-0 hover:bg-accent group-hover:opacity-100" title="Edit field">
                  <MoreHorizontal className="size-3.5" />
                </button>
              ) : <span />}
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      {editingField && (
        <FieldDialog
          field={editingField === 'new' ? null : editingField}
          onClose={() => setEditingField(null)}
          onSave={async (input) => {
            await fetch(defsKey, {
              method: editingField === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(editingField === 'new' ? input : { ...input, id: (editingField as FieldDef).id }),
            }).then(json);
            await refreshDefs();
            setEditingField(null);
          }}
          onDelete={editingField === 'new' ? undefined : async () => {
            await fetch(`${defsKey}&id=${(editingField as FieldDef).id}`, { method: 'DELETE' }).then(json);
            await refreshDefs();
            setEditingField(null);
          }}
        />
      )}
    </div>
  );
}

// ── Value editors ────────────────────────────────────────────────────────────

const inputCls = 'h-7 w-full rounded-md border border-transparent bg-transparent px-1.5 text-sm outline-none hover:border-border focus:border-primary';

function FieldEditor({ field, value, members, onChange }: { field: FieldDef; value: any; members: Member[]; onChange: (v: unknown) => void }) {
  const [draft, setDraft] = useState<string>(value ?? '');
  useEffect(() => setDraft(value ?? ''), [value]);
  const commit = () => { if ((draft ?? '') !== (value ?? '')) onChange(draft === '' ? null : draft); };

  switch (field.type) {
    case 'checkbox':
      return <input type="checkbox" className="size-4 accent-[hsl(var(--primary))]" checked={!!value} onChange={(e) => onChange(e.target.checked)} />;
    case 'date':
      return <input type="date" className={inputCls} value={value ? String(value).slice(0, 10) : ''} onChange={(e) => onChange(e.target.value || null)} />;
    case 'number': case 'currency':
      return (
        <div className="flex items-center gap-1">
          {field.type === 'currency' && <span className="text-xs text-muted-foreground">{field.currency ?? 'USD'}</span>}
          <input type="number" className={inputCls} value={draft} placeholder="—" onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
        </div>
      );
    case 'long_text':
      return <textarea className={cn(inputCls, 'h-auto min-h-[28px] resize-y py-1')} rows={1} value={draft} placeholder="—" onChange={(e) => setDraft(e.target.value)} onBlur={commit} />;
    case 'rating':
      return (
        <div className="flex">
          {[1, 2, 3, 4, 5].map((n) => (
            <button key={n} type="button" onClick={() => onChange(value === n ? null : n)} aria-label={`${n} stars`}>
              <Star className={cn('size-4', n <= (value ?? 0) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/40')} />
            </button>
          ))}
        </div>
      );
    case 'progress':
      return (
        <div className="flex items-center gap-2">
          <input type="range" min={0} max={100} step={5} value={value ?? 0} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[hsl(var(--primary))]" />
          <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{value ?? 0}%</span>
        </div>
      );
    case 'select': {
      const opt = field.options?.find((o) => o.id === value);
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(inputCls, 'flex items-center justify-between text-left')}>
              {opt ? <Chip o={opt} /> : <span className="text-muted-foreground">—</span>}
              <ChevronDown className="size-3 text-muted-foreground" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            {field.options?.map((o) => (
              <button key={o.id} type="button" onClick={() => onChange(o.id)} className="flex w-full items-center rounded px-2 py-1 hover:bg-accent"><Chip o={o} /></button>
            ))}
            {value && <button type="button" onClick={() => onChange(null)} className="w-full rounded px-2 py-1 text-left text-xs text-muted-foreground hover:bg-accent">Clear</button>}
            {!field.options?.length && <p className="p-2 text-xs text-muted-foreground">No options yet</p>}
          </PopoverContent>
        </Popover>
      );
    }
    case 'multi_select': {
      const sel: string[] = Array.isArray(value) ? value : [];
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(inputCls, 'flex h-auto min-h-7 flex-wrap items-center gap-1 py-0.5 text-left')}>
              {sel.length ? field.options?.filter((o) => sel.includes(o.id)).map((o) => <Chip key={o.id} o={o} />) : <span className="text-muted-foreground">—</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start">
            {field.options?.map((o) => (
              <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 hover:bg-accent">
                <input type="checkbox" checked={sel.includes(o.id)} onChange={() => onChange(sel.includes(o.id) ? sel.filter((x) => x !== o.id) : [...sel, o.id])} />
                <Chip o={o} />
              </label>
            ))}
          </PopoverContent>
        </Popover>
      );
    }
    case 'person': {
      const sel: string[] = Array.isArray(value) ? value : [];
      return (
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={cn(inputCls, 'flex items-center gap-1 text-left')}>
              {sel.length ? members.filter((m) => sel.includes(m.id)).map((m) => (
                <span key={m.id} className="rounded-full bg-primary/10 px-1.5 text-xs">{m.name ?? 'Member'}</span>
              )) : <span className="text-muted-foreground">—</span>}
            </button>
          </PopoverTrigger>
          <PopoverContent className="max-h-64 w-56 overflow-y-auto p-1" align="start">
            {members.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-accent">
                <input type="checkbox" checked={sel.includes(m.id)} onChange={() => onChange(sel.includes(m.id) ? sel.filter((x) => x !== m.id) : [...sel, m.id])} />
                {m.name ?? 'Member'}
              </label>
            ))}
          </PopoverContent>
        </Popover>
      );
    }
    case 'url':
      return value && draft === value ? (
        <div className="flex items-center gap-1">
          <a href={value} target="_blank" rel="noreferrer" className="truncate text-sm text-primary hover:underline">{String(value).replace(/^https?:\/\//, '')}</a>
          <button type="button" onClick={() => setDraft(value + ' ')} className="text-muted-foreground"><Settings2 className="size-3" /></button>
        </div>
      ) : (
        <input className={inputCls} value={String(draft).trim()} placeholder="https://" onChange={(e) => setDraft(e.target.value)} onBlur={commit} />
      );
    default:
      return (
        <input className={inputCls} type={field.type === 'email' ? 'email' : field.type === 'phone' ? 'tel' : 'text'} value={draft} placeholder="—"
          onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()} />
      );
  }
}

const Chip = ({ o }: { o: Option }) => (
  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium text-white" style={{ background: o.color }}>{o.label}</span>
);

// ── Field create/edit dialog ─────────────────────────────────────────────────

function FieldDialog({ field, onClose, onSave, onDelete }: {
  field: FieldDef | null; onClose: () => void; onSave: (input: Partial<FieldDef>) => Promise<void>; onDelete?: () => Promise<void>;
}) {
  const [name, setName] = useState(field?.name ?? '');
  const [type, setType] = useState<CfType>(field?.type ?? 'text');
  const [options, setOptions] = useState<Option[]>(field?.options ?? []);
  const [currency, setCurrency] = useState(field?.currency ?? 'USD');
  const [required, setRequired] = useState(!!field?.required);
  const [description, setDescription] = useState(field?.description ?? '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const hasOptions = type === 'select' || type === 'multi_select';
  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setErr(null);
    try { await fn(); } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  };
  const types = useMemo(() => Object.entries(TYPE_META) as [CfType, (typeof TYPE_META)[CfType]][], []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="max-h-[85vh] w-[440px] max-w-full overflow-y-auto rounded-xl border bg-background p-4 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="font-semibold">{field ? 'Edit field' : 'New field'}</p>
          <button type="button" onClick={onClose} className="text-muted-foreground"><X className="size-4" /></button>
        </div>
        <div className="space-y-3">
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Field name (e.g. Budget, Sprint, Client)"
            className="h-9 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-primary" />
          <div className="grid grid-cols-3 gap-1.5">
            {types.map(([k, m]) => (
              <button key={k} type="button" onClick={() => setType(k)}
                className={cn('flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs', type === k ? 'border-primary bg-primary/10' : 'hover:bg-accent')}>
                <m.icon className="size-3.5" />{m.label}
              </button>
            ))}
          </div>
          {hasOptions && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground">Options</p>
              {options.map((o, i) => (
                <div key={o.id || i} className="flex items-center gap-1.5">
                  <input type="color" value={o.color} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} className="size-7 rounded border-0 bg-transparent p-0" />
                  <input value={o.label} onChange={(e) => setOptions(options.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))}
                    className="h-7 flex-1 rounded-md border bg-transparent px-2 text-sm outline-none" />
                  <button type="button" onClick={() => setOptions(options.filter((_, j) => j !== i))} className="text-muted-foreground"><Trash2 className="size-3.5" /></button>
                </div>
              ))}
              <button type="button" onClick={() => setOptions([...options, { id: '', label: '', color: PALETTE[options.length % PALETTE.length] }])}
                className="flex items-center gap-1 text-xs text-primary"><Plus className="size-3" />Add option</button>
            </div>
          )}
          {type === 'currency' && (
            <input value={currency} maxLength={3} onChange={(e) => setCurrency(e.target.value.toUpperCase())} placeholder="Currency (USD, INR…)"
              className="h-8 w-28 rounded-md border bg-transparent px-2 text-sm outline-none" />
          )}
          <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description (optional)"
            className="h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none" />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />Required</label>
          {field && field.type !== type && <p className="text-xs text-amber-600">Changing the type may clear values that don&apos;t fit the new type.</p>}
          {err && <p className="text-xs text-red-500">{err}</p>}
          <div className="flex items-center justify-between pt-1">
            {onDelete ? (
              <button type="button" disabled={busy} onClick={() => confirm(`Delete field "${field?.name}"? Values are hidden everywhere.`) && run(onDelete)}
                className="flex items-center gap-1 text-xs text-red-500"><Trash2 className="size-3.5" />Delete field</button>
            ) : <span />}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="h-8 rounded-md border px-3 text-sm">Cancel</button>
              <button type="button" disabled={busy || !name.trim()} onClick={() => run(() => onSave({ name, type, options, currency, required, description }))}
                className="h-8 rounded-md bg-primary px-3 text-sm text-primary-foreground disabled:opacity-50">{busy ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
