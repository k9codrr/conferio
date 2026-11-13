import React from 'react';
import { MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Spinner } from './primitives';

export type SheetTab = { value: string; label: string; count?: number; content: React.ReactNode };

export function RecordSheetFrame({
  loading,
  error,
  title,
  description,
  media,
  actions,
  stats,
  tabs,
  tab,
  onTabChange,
}: {
  loading: boolean;
  error: string | null;
  title: string;
  description?: React.ReactNode;
  media?: React.ReactNode;
  actions?: React.ReactNode;
  stats?: React.ReactNode;
  tabs: SheetTab[];
  tab: string;
  onTabChange: (tab: string) => void;
}) {
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (error) {
    return <div className="flex h-full items-center justify-center p-6 text-sm text-muted-foreground">{error}</div>;
  }

  const active = tabs.find((entry) => entry.value === tab) ?? tabs[0];

  return (
    <div className="flex h-full flex-col">
      <div className="space-y-4 border-b px-6 pb-0 pt-6 dark:border-[#222]">
        <div className="flex items-start gap-3 pr-8">
          {media}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg font-semibold">{title}</h2>
            {description ? <div className="truncate text-sm text-muted-foreground">{description}</div> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">{actions}</div>
        </div>
        {stats}
        <div className="-mb-px flex gap-4 overflow-x-auto">
          {tabs.map((entry) => (
            <button
              key={entry.value}
              type="button"
              onClick={() => onTabChange(entry.value)}
              className={cn(
                'whitespace-nowrap border-b-2 pb-2 text-sm',
                entry.value === active?.value
                  ? 'border-neutral-900 font-medium text-foreground dark:border-white'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {entry.label}
              {entry.count !== undefined ? <span className="ml-1 text-xs opacity-60">{entry.count}</span> : null}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-5">{active?.content}</div>
    </div>
  );
}

export function StatsRow({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-2 gap-2 md:grid-cols-4">{children}</div>;
}

export function SplitBody({ main, rail }: { main: React.ReactNode; rail: React.ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 space-y-6">{main}</div>
      <div className="min-w-0 space-y-6">{rail}</div>
    </div>
  );
}

export function RecordActions({ name, consequence, onDelete, pending }: { name: string; consequence: string; onDelete: () => void; pending: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="icon" className="size-8" disabled={pending} aria-label="More actions">
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          className="text-red-600 focus:text-red-600"
          onSelect={() => {
            if (window.confirm(`Delete ${name}? ${consequence}`)) onDelete();
          }}
        >
          <Trash2 className="size-4" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function MiniTable({ headers, children }: { headers: { label: string; className?: string }[]; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-lg border dark:border-[#262626]">
      <table className="w-full table-fixed text-sm">
        <thead className="bg-neutral-50 text-left text-xs text-muted-foreground dark:bg-[#151515]">
          <tr>
            {headers.map((header) => (
              <th key={header.label} className={cn('px-3 py-2 font-medium', header.className)}>
                {header.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y dark:divide-[#222]">{children}</tbody>
      </table>
    </div>
  );
}
