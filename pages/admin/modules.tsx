import React, { useState } from 'react';
import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import type { NextPageWithLayout } from 'types/next';
import { adminLayout, PageHeader } from '@/components/platform/AdminLayout';
import { api, Badge, Card, Empty, Spinner } from '@/components/platform/ui';
import { Switch } from '@/components/ui/switch';

const ModulesPage: NextPageWithLayout = () => {
  const { data, error, mutate } = useSWR('/api/admin/modules', fetcher);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (key: string, label: string, enabled: boolean) => {
    if (!enabled && !window.confirm(`Turn ${label} off for every workspace on the platform?`)) return;
    setBusy(key);
    try {
      await api('/api/admin/modules', 'PUT', { modules: { [key]: enabled } }, `${label} ${enabled ? 'enabled' : 'disabled'} platform-wide`);
      await mutate();
    } catch {
      /* toast */
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Modules"
        description="Platform-wide switches. A module that is off here is off for every workspace, regardless of plan. Per-workspace overrides live on each workspace page; plan inclusion is set on Plans."
      />
      <div className="p-6">
        {error ? (
          <Empty title="Couldn't load modules">{error.message}</Empty>
        ) : !data ? (
          <Spinner />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.data.modules.map((m: any) => (
              <Card key={m.key} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold">
                      {m.label}
                      {m.enabled ? <Badge tone="green">on</Badge> : <Badge tone="red">off</Badge>}
                    </p>
                    <p className="text-xs text-gray-500">{m.description}</p>
                  </div>
                  <Switch
                    checked={m.enabled}
                    disabled={busy === m.key}
                    onCheckedChange={(v) => toggle(m.key, m.label, v)}
                    aria-label={`Toggle ${m.label}`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-[#0d0d0d]">
                    <p className="text-gray-500">Workspaces with access</p>
                    <p className="text-base font-semibold tabular-nums">{m.workspaces}</p>
                  </div>
                  <div className="rounded-lg bg-gray-50 px-3 py-2 dark:bg-[#0d0d0d]">
                    <p className="text-gray-500">Page views (7d)</p>
                    <p className="text-base font-semibold tabular-nums">{m.views7d.toLocaleString('en-IN')}</p>
                  </div>
                </div>
                <div className="text-[11px] text-gray-500">
                  <p>In plans: {m.plans.length ? m.plans.join(', ') : 'none'}</p>
                  <p className="mt-0.5 truncate" title={[...m.pages, ...m.apis].join(', ')}>
                    Routes: {[...m.pages, ...m.apis].join(', ') || '—'}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

ModulesPage.getLayout = adminLayout;
export default ModulesPage;
