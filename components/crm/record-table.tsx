import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { FieldValueJson } from '@/lib/crm/constants';
import type { ColumnDef } from './api';
import { Spinner } from './primitives';

// List state lives in the URL, as it does in the CRM, so views can be shared and survive a refresh.
export function useListParams<T extends Record<string, string>>(defaults: T) {
  const router = useRouter();

  const read = (key: string, fallback: string) => {
    const value = router.query[key];
    return (Array.isArray(value) ? value[0] : value) ?? fallback;
  };

  const values = Object.keys(defaults).reduce((acc, key) => {
    acc[key] = read(key, defaults[key]);
    return acc;
  }, {} as Record<string, string>) as T;

  const page = Math.max(1, Number(read('page', '1')) || 1);
  const sort = read('sort', '');
  const dir = read('dir', 'asc') === 'desc' ? 'desc' : 'asc';
  const q = read('q', '');

  const set = (patch: Record<string, string | number | null>, resetPage = true) => {
    const query: Record<string, string | string[] | undefined> = { ...router.query };
    delete query.team;
    Object.keys(patch).forEach((key) => {
      const value = patch[key];
      const fallback = key in defaults ? defaults[key] : key === 'page' ? '1' : '';
      if (value === null || value === '' || String(value) === fallback) delete query[key];
      else query[key] = String(value);
    });
    if (resetPage && !('page' in patch)) delete query.page;
    void router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false });
  };

  return { values, page, sort, dir: dir as 'asc' | 'desc', q, set };
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);
  useEffect(() => {
    if (draft === value) return;
    const timer = setTimeout(() => onChange(draft), 300);
    return () => clearTimeout(timer);
  }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-8 w-64 items-center gap-1.5 rounded-md border bg-white px-2 dark:border-[#262626] dark:bg-[#111]">
      <Search className="size-3.5 text-muted-foreground" />
      <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder={placeholder} className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
      {draft ? (
        <button type="button" aria-label="Clear" onClick={() => setDraft('')}>
          <X className="size-3.5 text-muted-foreground" />
        </button>
      ) : null}
    </div>
  );
}

export type FacetOption = { value: string; label: string; count?: number };

export function FacetSelect({ label, value, options, onChange }: { label: string; value: string; options: FacetOption[]; onChange: (value: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className={cn('h-8 w-auto min-w-[130px] gap-1 bg-white text-sm dark:bg-[#111]', value !== 'all' && 'border-neutral-900 dark:border-white')}>
        <span className="text-muted-foreground">{label}:</span>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
            {option.count !== undefined ? <span className="ml-1.5 text-xs text-muted-foreground">{option.count}</span> : null}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export type TableColumn<Row> = {
  id: string;
  header: string;
  sortKey?: string;
  className?: string;
  render: (row: Row) => React.ReactNode;
};

export function fieldColumns<Row extends { fields: Record<string, FieldValueJson> }>(columns: ColumnDef[] | undefined): TableColumn<Row>[] {
  return (columns ?? []).map((column) => ({
    id: `field:${column.key}`,
    header: column.label,
    className: 'w-36',
    render: (row: Row) => {
      const value = row.fields[column.key];
      if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
      if (column.type === 'CHECKBOX') return value ? 'Yes' : 'No';
      if (column.type === 'DATE' && typeof value === 'string') return format(new Date(value), 'MMM d, yyyy');
      return <span className="truncate">{String(value)}</span>;
    },
  }));
}

export function RecordTable<Row extends { id: string }>({
  rows,
  columns,
  loading,
  total,
  page,
  pageSize,
  sort,
  dir,
  onSort,
  onPage,
  onRowClick,
  selected,
  onSelectedChange,
  empty,
}: {
  rows: Row[] | undefined;
  columns: TableColumn<Row>[];
  loading: boolean;
  total: number;
  page: number;
  pageSize: number;
  sort: string;
  dir: 'asc' | 'desc';
  onSort: (sort: string, dir: 'asc' | 'desc') => void;
  onPage: (page: number) => void;
  onRowClick: (row: Row) => void;
  selected: string[];
  onSelectedChange: (ids: string[]) => void;
  empty: React.ReactNode;
}) {
  const list = rows ?? [];
  const pageIds = list.map((row) => row.id);
  const allSelected = pageIds.length > 0 && pageIds.every((id) => selected.indexOf(id) !== -1);
  const someSelected = pageIds.some((id) => selected.indexOf(id) !== -1);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="overflow-hidden rounded-lg border bg-white dark:border-[#222] dark:bg-[#111]">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] table-fixed text-sm">
          <thead className="border-b bg-neutral-50 text-left text-xs text-muted-foreground dark:border-[#222] dark:bg-[#151515]">
            <tr>
              <th className="w-10 px-3 py-2">
                <Checkbox
                  aria-label="Select page"
                  checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                  onCheckedChange={(checked) =>
                    onSelectedChange(checked ? Array.from(new Set([...selected, ...pageIds])) : selected.filter((id) => pageIds.indexOf(id) === -1))
                  }
                />
              </th>
              {columns.map((column) => (
                <th key={column.id} className={cn('px-3 py-2 font-medium', column.className)}>
                  {column.sortKey ? (
                    <button
                      type="button"
                      className="flex items-center gap-1 hover:text-foreground"
                      onClick={() => onSort(column.sortKey!, sort === column.sortKey && dir === 'asc' ? 'desc' : 'asc')}
                    >
                      {column.header}
                      {sort === column.sortKey ? dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" /> : null}
                    </button>
                  ) : (
                    column.header
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y dark:divide-[#1f1f1f]">
            {loading && list.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="py-12 text-center"><Spinner className="mx-auto" /></td>
              </tr>
            ) : list.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="p-6">{empty}</td>
              </tr>
            ) : (
              list.map((row) => {
                const checked = selected.indexOf(row.id) !== -1;
                return (
                  <tr key={row.id} className={cn('cursor-pointer hover:bg-neutral-50 dark:hover:bg-[#161616]', checked && 'bg-blue-50/60 dark:bg-blue-950/20')} onClick={() => onRowClick(row)}>
                    <td className="px-3 py-2" onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        aria-label="Select row"
                        checked={checked}
                        onCheckedChange={(next) => onSelectedChange(next ? [...selected, row.id] : selected.filter((id) => id !== row.id))}
                      />
                    </td>
                    {columns.map((column) => (
                      <td key={column.id} className={cn('truncate px-3 py-2', column.className)}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground dark:border-[#222]">
        <span>
          {from}–{to} of {total}
          {loading && list.length > 0 ? <Spinner className="ml-2 inline size-3" /> : null}
        </span>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="size-7" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
            <ChevronLeft />
          </Button>
          <span>
            Page {page} of {pages}
          </span>
          <Button variant="ghost" size="icon" className="size-7" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page">
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

export function BulkBar({ count, onClear, children }: { count: number; onClear: () => void; children: React.ReactNode }) {
  if (count === 0) return null;
  return (
    <div className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 items-center gap-2 rounded-lg border bg-white px-3 py-2 shadow-lg dark:border-[#2a2a2a] dark:bg-[#151515]">
      <span className="text-sm font-medium">{count} selected</span>
      <span className="h-5 w-px bg-border" />
      {children}
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
