import React, { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCrmApi, useCrmMutation } from './api';
import { Spinner } from './primitives';

type Entity = 'companies' | 'contacts' | 'deals';

export function ExportButton({ entity }: { entity: Entity }) {
  const { slug } = useCrmApi();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    if (!slug) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/teams/${encodeURIComponent(slug)}/crm/export?entity=${entity}`);
      if (!response.ok) {
        const json = await response.json().catch(() => null);
        throw new Error(json?.error?.message ?? 'Export failed.');
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${slug}-${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" disabled={busy || !slug} onClick={download}>
      {busy ? <Spinner className="text-current" /> : <Download />}
      Export
    </Button>
  );
}

// RFC 4180-style parsing: quoted fields, escaped quotes, commas and newlines inside quotes.
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '');

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  const [header, ...body] = rows.filter((r) => r.some((cell) => cell.trim() !== ''));
  if (!header) return [];
  return body.map((cells) =>
    header.reduce<Record<string, string>>((acc, name, index) => {
      acc[name.trim()] = (cells[index] ?? '').trim();
      return acc;
    }, {})
  );
}

const COLUMNS: Record<'companies' | 'contacts', string> = {
  companies: 'Name (required), Domain, Industry, Phone, Email, City, State, Country, LinkedIn, Description, Owner email',
  contacts: 'First name and Last name (or Name), Email, Phone, Title, Company (name or domain), Owner email',
};

type ImportResult = { created: number; skipped: number; failed: number; errors: { row: number; message: string }[] };

export function ImportButton({ entity }: { entity: 'companies' | 'contacts' }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  const run = useCrmMutation<Record<string, string>[], ImportResult>((call, data) => call('/import', 'POST', { entity, rows: data }), {
    success: (r) => `Imported ${r.created} ${entity}.`,
    onSuccess: setResult,
  });

  const reset = () => {
    setRows([]);
    setFileName('');
    setResult(null);
  };

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { reset(); setOpen(true); }}>
        <Upload />
        Import
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import {entity} from CSV</DialogTitle>
            <DialogDescription>Columns are matched by header name: {COLUMNS[entity]}. Up to 1,000 rows at a time.</DialogDescription>
          </DialogHeader>

          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-sm text-muted-foreground hover:bg-accent/40 dark:border-[#333]">
            <Upload className="size-5" />
            {fileName ? `${fileName}: ${rows.length} rows` : 'Choose a .csv file'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={async (event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setResult(null);
                setFileName(file.name);
                setRows(parseCsv(await file.text()));
              }}
            />
          </label>

          {rows.length > 0 && !result ? (
            <div className="max-h-40 overflow-auto rounded border text-xs dark:border-[#333]">
              <table className="w-full">
                <thead className="bg-neutral-50 dark:bg-[#151515]">
                  <tr>{Object.keys(rows[0]).map((key) => <th key={key} className="px-2 py-1 text-left font-medium">{key}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 5).map((row, i) => (
                    <tr key={i} className="border-t dark:border-[#222]">
                      {Object.keys(rows[0]).map((key) => <td key={key} className="truncate px-2 py-1">{row[key]}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {result ? (
            <div className="space-y-1 text-sm">
              <p>
                Created {result.created}, skipped {result.skipped} (blank or already in the CRM), failed {result.failed}.
              </p>
              {result.errors.length ? (
                <ul className="max-h-32 overflow-auto text-xs text-red-600">
                  {result.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{result ? 'Close' : 'Cancel'}</Button>
            {!result ? (
              <Button disabled={rows.length === 0 || rows.length > 1000 || run.isPending} onClick={() => run.mutate(rows)}>
                {run.isPending ? <Spinner className="text-current" /> : null}
                Import {rows.length || ''} rows
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
