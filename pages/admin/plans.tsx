import React, { useState } from 'react';
import useSWR from 'swr';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { MODULES, type ModuleKey } from '@/lib/platform/modules';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { api, Badge, Btn, Card, Empty, Field, Input, limitLabel, money, Spinner } from '@/components/platform/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';

type Plan = {
  id?: string;
  key: string;
  name: string;
  description: string | null;
  currency: string;
  priceMonthly: number;
  priceYearly: number;
  maxTeams: number;
  maxMembers: number;
  maxStorageGb: number;
  modules: ModuleKey[];
  features: string[];
  isActive: boolean;
  isPublic: boolean;
  isDefault: boolean;
  sortOrder: number;
  workspaces?: number;
  activeSubscriptions?: number;
};

const EMPTY: Plan = {
  key: '',
  name: '',
  description: '',
  currency: 'INR',
  priceMonthly: 0,
  priceYearly: 0,
  maxTeams: 1,
  maxMembers: 5,
  maxStorageGb: 5,
  modules: [],
  features: [],
  isActive: true,
  isPublic: true,
  isDefault: false,
  sortOrder: 0,
};

function PlanEditor({ plan, onClose, onSaved }: { plan: Plan; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<Plan>(plan);
  const [monthly, setMonthly] = useState(String(plan.priceMonthly / 100));
  const [yearly, setYearly] = useState(String(plan.priceYearly / 100));
  const [features, setFeatures] = useState(plan.features.join('\n'));
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Plan>(k: K, v: Plan[K]) => setP((x) => ({ ...x, [k]: v }));
  const isNew = !plan.id;

  const save = async () => {
    setBusy(true);
    const body = {
      key: p.key,
      name: p.name,
      description: p.description || null,
      currency: p.currency,
      priceMonthly: Math.round(parseFloat(monthly || '0') * 100),
      priceYearly: Math.round(parseFloat(yearly || '0') * 100),
      maxTeams: p.maxTeams,
      maxMembers: p.maxMembers,
      maxStorageGb: p.maxStorageGb,
      modules: p.modules,
      features: features.split('\n').map((f) => f.trim()).filter(Boolean),
      isActive: p.isActive,
      isPublic: p.isPublic,
      isDefault: p.isDefault,
      sortOrder: p.sortOrder,
    };
    try {
      if (isNew) await api('/api/admin/plans', 'POST', body, 'Plan created');
      else await api(`/api/admin/plans/${plan.id}`, 'PATCH', body, 'Plan saved');
      onSaved();
    } catch {
      setBusy(false);
    }
  };

  const num = (k: 'maxTeams' | 'maxMembers' | 'maxStorageGb' | 'sortOrder') => (
    <Input type="number" min={k === 'sortOrder' ? undefined : -1} value={p[k]} onChange={(e) => set(k, parseInt(e.target.value || '0', 10))} />
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New plan' : `Edit ${plan.name}`}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name">
            <Input value={p.name} onChange={(e) => set('name', e.target.value)} />
          </Field>
          <Field label="Key" hint="Stable id, e.g. pro">
            <Input value={p.key} onChange={(e) => set('key', e.target.value.toLowerCase())} />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Description">
              <Input value={p.description ?? ''} onChange={(e) => set('description', e.target.value)} />
            </Field>
          </div>
          <Field label={`Monthly price (${p.currency})`} hint="0 = free">
            <Input type="number" min={0} step="0.01" value={monthly} onChange={(e) => setMonthly(e.target.value)} />
          </Field>
          <Field label={`Yearly price (${p.currency})`} hint="Changing a price only affects new subscriptions">
            <Input type="number" min={0} step="0.01" value={yearly} onChange={(e) => setYearly(e.target.value)} />
          </Field>
          <Field label="Max teams" hint="-1 = unlimited">
            {num('maxTeams')}
          </Field>
          <Field label="Max seats (members)" hint="-1 = unlimited; client guests are free">
            {num('maxMembers')}
          </Field>
          <Field label="Storage (GB)" hint="-1 = unlimited">
            {num('maxStorageGb')}
          </Field>
          <Field label="Sort order">{num('sortOrder')}</Field>
        </div>

        <div>
          <p className="mb-2 text-xs font-medium text-gray-600 dark:text-neutral-400">Included modules</p>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {MODULES.map((m) => {
              const on = p.modules.includes(m.key);
              return (
                <label key={m.key} className="flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm dark:border-[#222]">
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => set('modules', on ? p.modules.filter((x) => x !== m.key) : [...p.modules, m.key])}
                  />
                  {m.label}
                </label>
              );
            })}
          </div>
        </div>

        <Field label="Feature bullets (one per line, shown on the pricing cards)">
          <textarea
            value={features}
            onChange={(e) => setFeatures(e.target.value)}
            rows={4}
            className="w-full rounded-lg border bg-white px-3 py-2 text-sm outline-none dark:border-[#2a2a2a] dark:bg-[#0d0d0d]"
          />
        </Field>

        <div className="flex flex-wrap gap-5">
          {(
            [
              ['isActive', 'Active (can be chosen)'],
              ['isPublic', 'Shown on pricing'],
              ['isDefault', 'Default (free fallback)'],
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <Switch checked={p[k]} onCheckedChange={(v) => set(k, v)} />
              {label}
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Btn onClick={onClose}>Cancel</Btn>
          <Btn variant="primary" loading={busy} onClick={save} disabled={!p.name || !p.key}>
            {isNew ? 'Create plan' : 'Save changes'}
          </Btn>
        </div>
      </DialogContent>
    </Dialog>
  );
}

const PlansPage: NextPageWithLayout = () => {
  const { data, error, mutate } = useSWR('/api/admin/plans', fetcher);
  const [editing, setEditing] = useState<Plan | null>(null);

  return (
    <>
      <PageHeader
        title="Plans"
        description="Plans set each workspace's limits and modules. Paid plans are billed with Razorpay subscriptions."
        actions={
          <Btn variant="primary" onClick={() => setEditing(EMPTY)}>
            <Plus className="size-4" /> New plan
          </Btn>
        }
      />
      <div className="p-6">
        {error ? (
          <Empty title="Couldn't load plans">{error.message}</Empty>
        ) : !data ? (
          <Spinner />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {data.data.map((p: Plan) => (
              <Card key={p.id} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 font-semibold">
                      {p.name}
                      {p.isDefault ? <Star className="size-3.5 fill-yellow-400 text-yellow-400" /> : null}
                    </p>
                    <p className="text-xs text-gray-500">{p.key}</p>
                  </div>
                  <div className="flex flex-wrap justify-end gap-1">
                    {!p.isActive ? <Badge tone="red">inactive</Badge> : null}
                    {!p.isPublic ? <Badge>hidden</Badge> : null}
                  </div>
                </div>
                <p className="mt-3 text-2xl font-semibold">
                  {p.priceMonthly ? money(p.priceMonthly, p.currency) : 'Free'}
                  {p.priceMonthly ? <span className="text-sm font-normal text-gray-500"> /mo</span> : null}
                </p>
                {p.priceYearly ? <p className="text-xs text-gray-500">{money(p.priceYearly, p.currency)} / year</p> : null}
                <div className="mt-3 space-y-0.5 text-xs text-gray-600 dark:text-neutral-400">
                  <p>Teams: {limitLabel(p.maxTeams)}</p>
                  <p>Seats: {limitLabel(p.maxMembers)}</p>
                  <p>Storage: {p.maxStorageGb < 0 ? 'Unlimited' : `${p.maxStorageGb} GB`}</p>
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  {p.modules.map((m) => (
                    <Badge key={m} tone="blue">
                      {MODULES.find((x) => x.key === m)?.label ?? m}
                    </Badge>
                  ))}
                </div>
                <div className="mt-auto pt-4">
                  <p className="mb-3 text-xs text-gray-500">
                    {p.workspaces} workspace{p.workspaces === 1 ? '' : 's'} assigned · {p.activeSubscriptions} paying
                  </p>
                  <div className="flex gap-2">
                    <Btn size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="size-3" /> Edit
                    </Btn>
                    {!p.isDefault ? (
                      <Btn
                        size="sm"
                        variant="ghost"
                        onClick={async () => {
                          if (!window.confirm(`Delete plan ${p.name}?`)) return;
                          try {
                            await api(`/api/admin/plans/${p.id}`, 'DELETE', undefined, 'Plan deleted');
                            void mutate();
                          } catch {
                            /* toast */
                          }
                        }}
                      >
                        <Trash2 className="size-3" />
                      </Btn>
                    ) : null}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {editing ? (
        <PlanEditor
          plan={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            void mutate();
          }}
        />
      ) : null}
    </>
  );
};

PlansPage.getLayout = adminLayout;
export default PlansPage;
