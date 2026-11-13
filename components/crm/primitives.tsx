import React, { useEffect, useRef, useState } from 'react';
import { formatDistanceToNowStrict, format } from 'date-fns';
import { Check, Loader2, Pencil, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  STAGE_COLORS,
  STAGE_PRESENTATION,
  type DealStage,
} from '@/lib/crm/constants';
import type { Person, TeamMemberOption } from './api';

export const UNASSIGNED = '__unassigned__';

export function initials(name: string | null | undefined): string {
  const parts = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

export function PersonAvatar({ person, size = 'sm', className }: { person: { name: string; image?: string | null } | null; size?: 'xs' | 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { xs: 'size-5 text-[9px]', sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-11 text-sm' }[size];
  return (
    <Avatar className={cn(dims, 'shrink-0', className)}>
      {person?.image ? <AvatarImage src={person.image} alt={person.name} /> : null}
      <AvatarFallback className="bg-neutral-200 dark:bg-[#2a2a2a] font-medium">{initials(person?.name)}</AvatarFallback>
    </Avatar>
  );
}

export function CompanyMark({ name, domain, size = 'sm' }: { name: string; domain?: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const dims = { sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-11 text-base' }[size];
  if (domain && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`}
        alt=""
        onError={() => setFailed(true)}
        className={cn(dims, 'shrink-0 rounded-md border bg-white object-contain p-0.5 dark:border-[#333]')}
      />
    );
  }
  return (
    <span className={cn(dims, 'flex shrink-0 items-center justify-center rounded-md border bg-neutral-100 font-semibold text-neutral-600 dark:border-[#333] dark:bg-[#1f1f1f] dark:text-neutral-300')}>
      {initials(name).slice(0, 1)}
    </span>
  );
}

export function OwnerCell({ owner, empty = 'Unassigned' }: { owner: Person | null | undefined; empty?: string }) {
  if (!owner) return <span className="text-muted-foreground">{empty}</span>;
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <PersonAvatar person={owner} size="xs" />
      <span className="truncate">{owner.name}</span>
    </span>
  );
}

export function MemberStack({ members, max = 4 }: { members: (Person & { role?: string | null })[]; max?: number }) {
  if (members.length === 0) return <span className="text-muted-foreground">None</span>;
  const shown = members.slice(0, max);
  return (
    <span className="flex items-center">
      {shown.map((member) => (
        <span key={member.id} title={member.role ? `${member.name} (${member.role})` : member.name} className="-ml-1.5 first:ml-0 rounded-full ring-2 ring-white dark:ring-[#111]">
          <PersonAvatar person={member} size="xs" />
        </span>
      ))}
      {members.length > max ? <span className="ml-1 text-xs text-muted-foreground">+{members.length - max}</span> : null}
    </span>
  );
}

export function StageBadge({ stage, className }: { stage: DealStage; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap text-sm', className)}>
      <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
      {STAGE_PRESENTATION[stage]?.label ?? stage}
    </span>
  );
}

export function Empty({ children = '—' }: { children?: React.ReactNode }) {
  return <span className="text-muted-foreground">{children}</span>;
}

export function RelativeTime({ date, empty = '—' }: { date: string | null | undefined; empty?: string }) {
  if (!date) return <Empty>{empty}</Empty>;
  const value = new Date(date);
  return (
    <time dateTime={date} title={format(value, 'PPpp')}>
      {formatDistanceToNowStrict(value, { addSuffix: true })}
    </time>
  );
}

export function LocalDay({ date, empty = '—' }: { date: string | null | undefined; empty?: string }) {
  if (!date) return <Empty>{empty}</Empty>;
  return <time dateTime={date}>{format(new Date(date), 'MMM d, yyyy')}</time>;
}

export function Section({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: React.ComponentType<{ className?: string }>; title: string; description: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed px-6 py-10 text-center dark:border-[#2a2a2a]">
      <Icon className="size-6 text-muted-foreground" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{description}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

export function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg border px-3 py-2 dark:border-[#262626]">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 truncate text-sm font-medium">{children}</div>
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('size-4 animate-spin text-muted-foreground', className)} />;
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-2 py-1">
      <div className="pt-1.5 text-xs text-muted-foreground">{label}</div>
      <div className="min-w-0 text-sm">{children}</div>
    </div>
  );
}

type InlineFieldProps = {
  label: string;
  value: string | null | undefined;
  type?: 'text' | 'email' | 'tel' | 'url' | 'number' | 'date';
  multiline?: boolean;
  placeholder?: string;
  saving?: boolean;
  display?: React.ReactNode;
  onSave: (value: string) => void;
};

export function InlineField({ label, value, type = 'text', multiline, placeholder, saving, display, onSave }: InlineFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? '');
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) setDraft(value ?? '');
  }, [value, editing]);

  useEffect(() => {
    if (editing) ref.current?.focus();
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if ((value ?? '') !== draft) onSave(draft);
  };

  const cancel = () => {
    setDraft(value ?? '');
    setEditing(false);
  };

  const keys = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') cancel();
    if (event.key === 'Enter' && (!multiline || event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      commit();
    }
  };

  return (
    <PropertyRow label={label}>
      {editing ? (
        <div className="flex items-start gap-1">
          {multiline ? (
            <Textarea ref={ref} value={draft} rows={3} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} className="min-h-[60px] text-sm" />
          ) : (
            <Input ref={ref} type={type} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} className="h-8 text-sm" />
          )}
          <button type="button" onClick={commit} className="rounded p-1.5 hover:bg-accent" aria-label="Save"><Check className="size-3.5" /></button>
          <button type="button" onClick={cancel} className="rounded p-1.5 hover:bg-accent" aria-label="Cancel"><X className="size-3.5" /></button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="group flex w-full min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-accent"
        >
          <span className={cn('min-w-0 flex-1', multiline ? 'whitespace-pre-wrap break-words' : 'truncate')}>
            {display ?? (value ? value : <Empty>{placeholder ?? 'Add'}</Empty>)}
          </span>
          {saving ? <Spinner className="size-3" /> : <Pencil className="size-3 shrink-0 opacity-0 group-hover:opacity-60" />}
        </button>
      )}
    </PropertyRow>
  );
}

export function InlineSelect({
  label,
  value,
  options,
  placeholder = 'Choose',
  onSave,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  onSave: (value: string) => void;
}) {
  return (
    <PropertyRow label={label}>
      <Select value={value} onValueChange={(next) => next !== value && onSave(next)}>
        <SelectTrigger className="h-8 border-transparent px-1.5 text-sm shadow-none hover:bg-accent focus:ring-0">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </PropertyRow>
  );
}

export function memberOptions(members: TeamMemberOption[] | undefined, withUnassigned = true) {
  return [
    ...(withUnassigned ? [{ value: UNASSIGNED, label: 'Unassigned' }] : []),
    ...(members ?? []).map((member) => ({ value: member.id, label: member.name })),
  ];
}

export function MemberSelect({
  value,
  members,
  onChange,
  allowUnassigned = true,
  placeholder = 'Choose a team member',
  className,
}: {
  value: string | null;
  members: TeamMemberOption[] | undefined;
  onChange: (value: string | null) => void;
  allowUnassigned?: boolean;
  placeholder?: string;
  className?: string;
}) {
  return (
    <Select value={value ?? (allowUnassigned ? UNASSIGNED : undefined)} onValueChange={(next) => onChange(next === UNASSIGNED ? null : next)}>
      <SelectTrigger className={cn('h-9', className)}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {memberOptions(members, allowUnassigned).map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function FieldLabel({ children, htmlFor }: { children: React.ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}
