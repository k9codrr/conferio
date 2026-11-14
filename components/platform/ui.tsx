// Shared building blocks for the platform admin console and workspace pages.
import React from 'react';
import toast from 'react-hot-toast';
import { ChevronLeft, ChevronRight, Loader2, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Formatting ───────────────────────────────────────────────────────────────
export function money(paise: number | null | undefined, currency = 'INR', compact = false) {
  const v = (paise ?? 0) / 100;
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency,
      maximumFractionDigits: compact || Number.isInteger(v) ? 0 : 2,
      notation: compact && v >= 100000 ? 'compact' : 'standard',
    }).format(v);
  } catch {
    return `${currency} ${v.toFixed(2)}`;
  }
}

export function fmtDate(d: string | Date | null | undefined, withTime = false) {
  if (!d) return '—';
  const date = new Date(d);
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  });
}

export function ago(d: string | Date | null | undefined) {
  if (!d) return '—';
  const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return fmtDate(d);
}

export const limitLabel = (n: number | null | undefined) => (n == null ? '—' : n < 0 ? 'Unlimited' : n.toLocaleString('en-IN'));

export function bytes(n: number) {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

// ── Fetch helper ─────────────────────────────────────────────────────────────
export async function api<T = any>(url: string, method = 'GET', body?: unknown, success?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error?.message || `Request failed (${res.status})`;
    toast.error(message);
    throw new Error(message);
  }
  if (success) toast.success(success);
  return json as T;
}

// ── Primitives ───────────────────────────────────────────────────────────────
export function Card({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('rounded-[14px] border bg-white shadow-sm dark:border-[#222] dark:bg-[#111111]', className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export function CardHeader({ title, description, actions }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-3.5 dark:border-[#222]">
      <div className="min-w-0">
        <h3 className="text-sm font-semibold">{title}</h3>
        {description ? <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">{description}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'default',
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 dark:text-neutral-400">{label}</p>
        {Icon ? <Icon className="size-4 text-gray-400 dark:text-neutral-500" /> : null}
      </div>
      <p
        className={cn(
          'mt-2 text-2xl font-semibold tabular-nums tracking-tight',
          tone === 'good' && 'text-emerald-600 dark:text-emerald-400',
          tone === 'warn' && 'text-amber-600 dark:text-amber-400',
          tone === 'bad' && 'text-red-600 dark:text-red-400'
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-gray-500 dark:text-neutral-400">{hint}</p> : null}
    </Card>
  );
}

const BADGE_TONES = {
  gray: 'bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-neutral-300',
  green: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400',
  red: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
  amber: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-500/15 dark:text-blue-400',
  violet: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400',
} as const;

export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof BADGE_TONES; children: React.ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium', BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export function statusTone(status: string): keyof typeof BADGE_TONES {
  switch (status) {
    case 'active':
    case 'captured':
    case 'ACTIVE':
      return 'green';
    case 'authenticated':
    case 'created':
      return 'blue';
    case 'pending':
    case 'authorized':
      return 'amber';
    case 'halted':
    case 'failed':
    case 'SUSPENDED':
      return 'red';
    default:
      return 'gray';
  }
}

export function Btn({
  variant = 'default',
  size = 'md',
  loading,
  className,
  children,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'default' | 'primary' | 'danger' | 'ghost';
  size?: 'sm' | 'md';
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || loading}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-9 px-3.5 text-sm',
        variant === 'default' && 'border bg-white hover:bg-gray-50 dark:border-[#2a2a2a] dark:bg-[#161616] dark:hover:bg-[#1d1d1d]',
        variant === 'primary' && 'bg-yellow-400 text-black hover:bg-yellow-300 dark:bg-[#2647eb] dark:text-white dark:hover:bg-[#3557f5]',
        variant === 'danger' && 'bg-red-600 text-white hover:bg-red-500',
        variant === 'ghost' && 'hover:bg-gray-100 dark:hover:bg-[#1a1a1a]',
        className
      )}
    >
      {loading ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {children as React.ReactNode}
    </button>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'h-9 w-full rounded-lg border bg-white px-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 dark:border-[#2a2a2a] dark:bg-[#0d0d0d] dark:focus:border-[#444]',
        props.className
      )}
    />
  );
}

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...rest}
      className={cn(
        'h-9 rounded-lg border bg-white px-2.5 text-sm outline-none dark:border-[#2a2a2a] dark:bg-[#0d0d0d]',
        className
      )}
    >
      {children}
    </select>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-600 dark:text-neutral-400">{label}</span>
      {children}
      {hint ? <span className="block text-[11px] text-gray-400 dark:text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="relative w-full max-w-xs">
      <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder ?? 'Search…'} className="pl-8" />
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t px-5 py-2.5 text-xs text-gray-500 dark:border-[#222] dark:text-neutral-400">
      <span>
        {total === 0 ? 'No results' : `${(page - 1) * pageSize + 1}–${Math.min(page * pageSize, total)} of ${total.toLocaleString('en-IN')}`}
      </span>
      <div className="flex items-center gap-1">
        <Btn size="sm" variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="size-4" />
        </Btn>
        <span className="px-1 tabular-nums">
          {page} / {pages}
        </span>
        <Btn size="sm" variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="size-4" />
        </Btn>
      </div>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-6 py-12 text-center">
      <p className="text-sm font-semibold">{title}</p>
      {children ? <div className="text-xs text-gray-500 dark:text-neutral-400">{children}</div> : null}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center justify-center py-16', className)}>
      <Loader2 className="size-5 animate-spin text-gray-400" />
    </div>
  );
}

export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return (
    <th className={cn('whitespace-nowrap px-5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-neutral-500', className)}>
      {children}
    </th>
  );
}

export function Td({ children, className, ...rest }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={cn('px-5 py-3 align-middle text-sm', className)} {...rest}>
      {children}
    </td>
  );
}

export function Table({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px]">
        <thead className="border-b bg-gray-50/60 dark:border-[#222] dark:bg-[#0d0d0d]">
          <tr>{head}</tr>
        </thead>
        <tbody className="divide-y dark:divide-[#1e1e1e]">{children}</tbody>
      </table>
    </div>
  );
}

export function UserCell({ user }: { user: { name?: string | null; email?: string | null; image?: string | null } | null | undefined }) {
  if (!user) return <span className="text-gray-400">—</span>;
  const initials = (user.name || user.email || '?')
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {user.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={user.image} alt="" className="size-7 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <div className="flex size-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-200 text-[10px] font-semibold text-gray-600 dark:bg-neutral-800 dark:text-neutral-300">
          {initials}
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{user.name || '—'}</p>
        {user.email ? <p className="truncate text-xs text-gray-500 dark:text-neutral-400">{user.email}</p> : null}
      </div>
    </div>
  );
}

export function Meter({ used, limit, label, format = (n: number) => n.toLocaleString('en-IN') }: { used: number; limit: number; label: string; format?: (n: number) => string }) {
  const unlimited = limit < 0;
  const pct = unlimited || limit === 0 ? 0 : Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="font-medium text-gray-600 dark:text-neutral-400">{label}</span>
        <span className="tabular-nums">
          <span className="font-semibold">{format(used)}</span>
          <span className="text-gray-400"> / {unlimited ? 'Unlimited' : format(limit)}</span>
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-gray-100 dark:bg-neutral-800">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500',
            unlimited && 'w-full bg-emerald-500/30'
          )}
          style={unlimited ? undefined : { width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
