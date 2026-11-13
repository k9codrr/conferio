import React, { useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CrmShell } from '@/components/crm/crm-shell';
import { FieldsManager } from '@/components/crm/fields-manager';
import { FieldLabel, Spinner } from '@/components/crm/primitives';
import { useCrmMembers, useCrmMutation, useCrmQuery } from '@/components/crm/api';
import { CURRENCIES, type FieldEntity } from '@/lib/crm/constants';

type Settings = { reportingCurrency: string; exchangeRates: Record<string, number> };

const ENTITIES: { value: FieldEntity; label: string }[] = [
  { value: 'COMPANY', label: 'Companies' },
  { value: 'CONTACT', label: 'Contacts' },
  { value: 'DEAL', label: 'Deals' },
];

export default function CrmSettingsPage() {
  const members = useCrmMembers();
  const canManage = members.data?.me.canManage ?? false;
  const [entity, setEntity] = useState<FieldEntity>('COMPANY');

  return (
    <CrmShell title="CRM settings">
      <div className="max-w-3xl space-y-8">
        {!canManage && members.data ? (
          <p className="rounded-lg border bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
            Only owners, admins and managers can change these settings. You can see them here.
          </p>
        ) : null}

        <section className="space-y-3">
          <div>
            <h2 className="text-base font-semibold">Custom fields</h2>
            <p className="text-sm text-muted-foreground">Track whatever your team needs on each kind of record.</p>
          </div>
          <div className="flex gap-1 rounded-md border p-0.5 text-sm dark:border-[#262626]" style={{ width: 'fit-content' }}>
            {ENTITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setEntity(option.value)}
                className={cn('rounded px-3 py-1', entity === option.value ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'text-muted-foreground hover:text-foreground')}
              >
                {option.label}
              </button>
            ))}
          </div>
          <FieldsManager key={entity} entity={entity} canManage={canManage} />
        </section>

        <CurrencySettings canManage={canManage} />
      </div>
    </CrmShell>
  );
}

function CurrencySettings({ canManage }: { canManage: boolean }) {
  const settings = useCrmQuery<Settings>(['settings'], '/settings');
  const [base, setBase] = useState('USD');
  const [rates, setRates] = useState<{ currency: string; rate: string }[]>([]);

  useEffect(() => {
    if (!settings.data) return;
    setBase(settings.data.reportingCurrency);
    setRates(Object.keys(settings.data.exchangeRates).map((currency) => ({ currency, rate: String(settings.data!.exchangeRates[currency]) })));
  }, [settings.data]);

  const save = useCrmMutation<Settings>((call, input) => call('/settings', 'PUT', input), { success: 'Currency settings saved.' });

  const parsed = rates.filter((row) => row.currency && row.currency !== base);
  const invalid = parsed.some((row) => !(Number(row.rate) > 0));

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">Currency</h2>
        <p className="text-sm text-muted-foreground">
          Totals, the pipeline and the dashboard are reported in one currency. Deals in another currency count only when you give it a rate. Nothing is guessed.
        </p>
      </div>

      {settings.isPending ? (
        <Spinner />
      ) : (
        <form
          className="space-y-4 rounded-lg border bg-white p-4 dark:border-[#222] dark:bg-[#111]"
          onSubmit={(event) => {
            event.preventDefault();
            if (invalid) return;
            const exchangeRates: Record<string, number> = {};
            parsed.forEach((row) => {
              exchangeRates[row.currency] = Number(row.rate);
            });
            save.mutate({ reportingCurrency: base, exchangeRates });
          }}
        >
          <div className="w-48">
            <FieldLabel>Reporting currency</FieldLabel>
            <Select value={base} onValueChange={setBase} disabled={!canManage}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Array.from(new Set([base, ...CURRENCIES])).map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <FieldLabel>Exchange rates</FieldLabel>
            {rates.length === 0 ? <p className="text-sm text-muted-foreground">No rates yet: only {base} deals are counted in totals.</p> : null}
            {rates.map((row, index) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <span>1</span>
                <Select value={row.currency || undefined} onValueChange={(currency) => setRates(rates.map((entry, i) => (i === index ? { ...entry, currency } : entry)))} disabled={!canManage}>
                  <SelectTrigger className="h-8 w-24"><SelectValue placeholder="EUR" /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.filter((code) => code !== base).map((code) => <SelectItem key={code} value={code}>{code}</SelectItem>)}
                  </SelectContent>
                </Select>
                <span>=</span>
                <Input
                  inputMode="decimal"
                  value={row.rate}
                  disabled={!canManage}
                  onChange={(event) => setRates(rates.map((entry, i) => (i === index ? { ...entry, rate: event.target.value } : entry)))}
                  className={cn('h-8 w-32', row.rate && !(Number(row.rate) > 0) && 'border-red-500')}
                />
                <span>{base}</span>
                {canManage ? (
                  <button type="button" aria-label="Remove rate" onClick={() => setRates(rates.filter((_, i) => i !== index))} className="rounded p-1 hover:bg-accent">
                    <X className="size-3.5" />
                  </button>
                ) : null}
              </div>
            ))}
            {canManage ? (
              <Button type="button" variant="ghost" size="sm" onClick={() => setRates([...rates, { currency: '', rate: '' }])}>
                <Plus />
                Add rate
              </Button>
            ) : null}
          </div>

          {canManage ? (
            <Button type="submit" size="sm" disabled={invalid || save.isPending}>
              {save.isPending ? <Spinner className="text-current" /> : null}
              Save
            </Button>
          ) : null}
        </form>
      )}
    </section>
  );
}
