import React, { useMemo, useState } from 'react';
import { Briefcase, Columns3, List, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CrmShell } from '@/components/crm/crm-shell';
import { CreateDealDialog } from '@/components/crm/create-dialogs';
import { useOpenRecord } from '@/components/crm/navigation';
import { CompanyMark, EmptyState, LocalDay, OwnerCell, RelativeTime } from '@/components/crm/primitives';
import {
  BulkBar,
  FacetSelect,
  RecordTable,
  SearchBox,
  fieldColumns,
  useListParams,
  type TableColumn,
} from '@/components/crm/record-table';
import { CloseReasonDialog, DealStageMenu } from '@/components/crm/stage-menu';
import { PipelineBoard } from '@/components/crm/pipeline-board';
import { ExportButton } from '@/components/crm/transfer';
import {
  bulkMessage,
  toQuery,
  useCrmMembers,
  useCrmMutation,
  useCrmQuery,
  type BulkResult,
  type ColumnDef,
  type Person,
} from '@/components/crm/api';
import {
  CLOSING_LABELS,
  CLOSING_WINDOWS,
  DEAL_STAGE_OPTIONS,
  formatMoney,
  isLosingStage,
  type DealStage,
  type FieldValueJson,
} from '@/lib/crm/constants';

type DealRow = {
  id: string;
  name: string;
  stage: DealStage;
  currency: string;
  amountCents: number | null;
  expectedCloseDate: string | null;
  closedAt: string | null;
  stageChangedAt: string;
  company: { id: string; name: string; domain: string | null };
  owner: Person;
  lastActivityAt: string | null;
  createdAt: string;
  fields: Record<string, FieldValueJson>;
};

type DealList = {
  rows: DealRow[];
  total: number;
  columns: ColumnDef[];
  openValueCents: number;
  reportingCurrency: string;
  unconverted: { count: number; currencies: string[] };
  facetCounts: {
    status: { open: number; closed: number };
    owner: Record<string, number>;
    stage: Record<string, number>;
    closing: Record<string, number>;
  };
};

const PAGE_SIZE = 25;

export default function DealsPage() {
  const openRecord = useOpenRecord();
  const members = useCrmMembers();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkClosing, setBulkClosing] = useState<DealStage | null>(null);
  const list = useListParams({ status: 'open', owner: 'all', stage: 'all', closing: 'all', view: 'table' });
  const board = list.values.view === 'board';

  const query = useCrmQuery<DealList>(
    ['deals', list.values, list.q, list.page, list.sort, list.dir],
    board ? null : `/deals${toQuery({ ...list.values, view: undefined, q: list.q, page: list.page, pageSize: PAGE_SIZE, sort: list.sort, dir: list.dir })}`,
    { keepPrevious: true }
  );

  const bulk = useCrmMutation<Record<string, unknown>, BulkResult>((call, input) => call('/deals/bulk', 'POST', input), {
    success: bulkMessage,
    onSuccess: () => {
      setSelected([]);
      setBulkClosing(null);
    },
  });

  const data = query.data;
  const facets = data?.facetCounts;
  const memberName = (id: string) => members.data?.members.find((member) => member.id === id)?.name ?? 'Former member';

  const columns = useMemo<TableColumn<DealRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Deal',
        sortKey: 'name',
        className: 'w-64',
        render: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <CompanyMark name={row.company.name} domain={row.company.domain} />
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{row.company.name}</span>
            </span>
          </span>
        ),
      },
      { id: 'stage', header: 'Stage', sortKey: 'stage', className: 'w-48', render: (row) => <DealStageMenu dealId={row.id} stage={row.stage} /> },
      { id: 'amount', header: 'Amount', sortKey: 'amount', className: 'w-32 text-right tabular-nums', render: (row) => formatMoney(row.amountCents, row.currency) },
      { id: 'close', header: 'Close date', sortKey: 'expectedCloseDate', className: 'w-32', render: (row) => <LocalDay date={row.expectedCloseDate} /> },
      { id: 'owner', header: 'Owner', sortKey: 'owner', className: 'w-40', render: (row) => <OwnerCell owner={row.owner} /> },
      ...fieldColumns<DealRow>(data?.columns),
      { id: 'activity', header: 'Last activity', sortKey: 'lastActivity', className: 'w-32 text-muted-foreground', render: (row) => <RelativeTime date={row.lastActivityAt} empty="Never" /> },
    ],
    [data?.columns]
  );

  const ownerOptions = [
    { value: 'all', label: 'Anyone' },
    { value: 'me', label: 'Me', count: members.data ? facets?.owner[members.data.me.id] : undefined },
    ...Object.keys(facets?.owner ?? {})
      .filter((id) => id !== members.data?.me.id)
      .map((id) => ({ value: id, label: memberName(id), count: facets?.owner[id] })),
  ];

  const filtered = list.q || list.values.owner !== 'all' || list.values.stage !== 'all' || list.values.closing !== 'all';

  return (
    <CrmShell
      title="Deals"
      actions={
        <>
          <div className="flex rounded-md border p-0.5 dark:border-[#262626]">
            {[
              { value: 'table', label: 'Table', icon: List },
              { value: 'board', label: 'Board', icon: Columns3 },
            ].map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => list.set({ view: option.value })}
                className={cn(
                  'flex items-center gap-1 rounded px-2 py-1 text-xs',
                  list.values.view === option.value ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <option.icon className="size-3.5" />
                {option.label}
              </button>
            ))}
          </div>
          <ExportButton entity="deals" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New deal
          </Button>
        </>
      }
    >
      <CreateDealDialog open={creating} onOpenChange={setCreating} currency={data?.reportingCurrency} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={list.q} onChange={(q) => list.set({ q })} placeholder="Search deal or company" />
        {board ? (
          <FacetSelect
            label="Owner"
            value={list.values.owner}
            options={[
              { value: 'all', label: 'Anyone' },
              { value: 'me', label: 'Me' },
              ...(members.data?.members ?? []).filter((m) => m.id !== members.data?.me.id).map((m) => ({ value: m.id, label: m.name })),
            ]}
            onChange={(owner) => list.set({ owner })}
          />
        ) : null}
        {board ? null : (
          <>
        <FacetSelect
          label="Status"
          value={list.values.status}
          options={[
            { value: 'all', label: 'All' },
            { value: 'open', label: 'Open', count: facets?.status.open },
            { value: 'closed', label: 'Closed', count: facets?.status.closed },
          ]}
          onChange={(status) => list.set({ status })}
        />
        <FacetSelect
          label="Stage"
          value={list.values.stage}
          options={[{ value: 'all', label: 'Any' }, ...DEAL_STAGE_OPTIONS.map((option) => ({ value: option.value, label: option.label, count: facets?.stage[option.value] ?? 0 }))]}
          onChange={(stage) => list.set({ stage })}
        />
        <FacetSelect label="Owner" value={list.values.owner} options={ownerOptions} onChange={(owner) => list.set({ owner })} />
        <FacetSelect
          label="Closing"
          value={list.values.closing}
          options={[{ value: 'all', label: 'Any time' }, ...CLOSING_WINDOWS.map((window) => ({ value: window, label: CLOSING_LABELS[window], count: facets?.closing[window] }))]}
          onChange={(closing) => list.set({ closing })}
        />
        {data ? (
          <span className="ml-auto text-sm text-muted-foreground">
            Open value <span className="font-medium text-foreground">{formatMoney(data.openValueCents, data.reportingCurrency)}</span>
            {data.unconverted.count > 0 ? ` + ${data.unconverted.count} in ${data.unconverted.currencies.join(', ')} with no rate` : ''}
          </span>
        ) : null}
          </>
        )}
      </div>

      {board ? <PipelineBoard q={list.q} owner={list.values.owner} /> : null}

      {board ? null : (
      <RecordTable
        rows={data?.rows}
        columns={columns}
        loading={query.isFetching}
        total={data?.total ?? 0}
        page={list.page}
        pageSize={PAGE_SIZE}
        sort={list.sort}
        dir={list.dir}
        onSort={(sort, dir) => list.set({ sort, dir })}
        onPage={(page) => list.set({ page }, false)}
        onRowClick={(row) => openRecord({ kind: 'deal', id: row.id })}
        selected={selected}
        onSelectedChange={setSelected}
        empty={
          filtered || list.values.status !== 'open' ? (
            <p className="text-center text-sm text-muted-foreground">No deals match those filters.</p>
          ) : (
            <EmptyState
              icon={Briefcase}
              title="No open deals"
              description="Open a deal against a company and it joins the pipeline, the forecast and the dashboard."
              action={<Button size="sm" onClick={() => setCreating(true)}><Plus />New deal</Button>}
            />
          )
        }
      />
      )}

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <Select
          value=""
          onValueChange={(stage) => {
            if (isLosingStage(stage as DealStage)) setBulkClosing(stage as DealStage);
            else bulk.mutate({ action: 'stage', ids: selected, stage });
          }}
        >
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="Move to stage" /></SelectTrigger>
          <SelectContent>
            {DEAL_STAGE_OPTIONS.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value="" onValueChange={(ownerId) => bulk.mutate({ action: 'owner', ids: selected, ownerId })}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="Set owner" /></SelectTrigger>
          <SelectContent>
            {(members.data?.members ?? []).map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="text-red-600"
          disabled={bulk.isPending}
          onClick={() => {
            if (window.confirm(`Delete ${selected.length} deals?`)) bulk.mutate({ action: 'delete', ids: selected });
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </BulkBar>

      <CloseReasonDialog
        stage={bulkClosing}
        open={bulkClosing !== null}
        pending={bulk.isPending}
        onCancel={() => setBulkClosing(null)}
        onConfirm={(closedReason) => bulkClosing && bulk.mutate({ action: 'stage', ids: selected, stage: bulkClosing, closedReason })}
      />
    </CrmShell>
  );
}
