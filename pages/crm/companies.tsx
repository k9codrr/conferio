import React, { useMemo, useState } from 'react';
import { Building2, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CrmShell } from '@/components/crm/crm-shell';
import { ExportButton, ImportButton } from '@/components/crm/transfer';
import { CreateCompanyDialog } from '@/components/crm/create-dialogs';
import { useOpenRecord } from '@/components/crm/navigation';
import {
  CompanyMark,
  EmptyState,
  MemberStack,
  OwnerCell,
  RelativeTime,
  UNASSIGNED,
} from '@/components/crm/primitives';
import {
  BulkBar,
  FacetSelect,
  RecordTable,
  SearchBox,
  fieldColumns,
  useListParams,
  type TableColumn,
} from '@/components/crm/record-table';
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
import type { FieldValueJson } from '@/lib/crm/constants';

type CompanyRow = {
  id: string;
  name: string;
  domain: string | null;
  industry: string | null;
  source: string;
  owner: Person | null;
  members: (Person & { role: string | null })[];
  contactCount: number;
  openDealCount: number;
  lastActivityAt: string | null;
  createdAt: string;
  fields: Record<string, FieldValueJson>;
};

type CompanyList = {
  rows: CompanyRow[];
  total: number;
  columns: ColumnDef[];
  facetCounts: {
    owner: Record<string, number>;
    industry: Record<string, number>;
    source: Record<string, number>;
    member: { me: number };
  };
};

const PAGE_SIZE = 25;

export default function CompaniesPage() {
  const openRecord = useOpenRecord();
  const members = useCrmMembers();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const list = useListParams({ owner: 'all', member: 'all', industry: 'all' });

  const query = useCrmQuery<CompanyList>(
    ['companies', list.values, list.q, list.page, list.sort, list.dir],
    `/companies${toQuery({ ...list.values, q: list.q, page: list.page, pageSize: PAGE_SIZE, sort: list.sort, dir: list.dir })}`,
    { keepPrevious: true }
  );

  const bulk = useCrmMutation<Record<string, unknown>, BulkResult>((call, input) => call('/companies/bulk', 'POST', input), {
    success: bulkMessage,
    onSuccess: () => setSelected([]),
  });

  const facets = query.data?.facetCounts;
  const memberName = (id: string) => members.data?.members.find((member) => member.id === id)?.name ?? 'Former member';

  const columns = useMemo<TableColumn<CompanyRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Company',
        sortKey: 'name',
        className: 'w-64',
        render: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <CompanyMark name={row.name} domain={row.domain} />
            <span className="min-w-0">
              <span className="block truncate font-medium">{row.name}</span>
              {row.domain ? <span className="block truncate text-xs text-muted-foreground">{row.domain}</span> : null}
            </span>
          </span>
        ),
      },
      { id: 'owner', header: 'Owner', sortKey: 'owner', className: 'w-40', render: (row) => <OwnerCell owner={row.owner} /> },
      { id: 'team', header: 'Team', className: 'w-32', render: (row) => <MemberStack members={row.members} /> },
      { id: 'industry', header: 'Industry', sortKey: 'industry', className: 'w-36', render: (row) => row.industry ?? <span className="text-muted-foreground">—</span> },
      { id: 'contacts', header: 'Contacts', sortKey: 'contacts', className: 'w-24 text-right', render: (row) => <span className="tabular-nums">{row.contactCount}</span> },
      { id: 'deals', header: 'Open deals', sortKey: 'deals', className: 'w-24 text-right', render: (row) => <span className="tabular-nums">{row.openDealCount}</span> },
      ...fieldColumns<CompanyRow>(query.data?.columns),
      { id: 'activity', header: 'Last activity', sortKey: 'lastActivity', className: 'w-32 text-muted-foreground', render: (row) => <RelativeTime date={row.lastActivityAt} empty="Never" /> },
    ],
    [query.data?.columns]
  );

  const ownerOptions = [
    { value: 'all', label: 'Anyone' },
    { value: 'me', label: 'Me', count: members.data ? facets?.owner[members.data.me.id] : undefined },
    { value: 'unassigned', label: 'Unassigned', count: facets?.owner.unassigned },
    ...Object.keys(facets?.owner ?? {})
      .filter((id) => id !== 'unassigned' && id !== members.data?.me.id)
      .map((id) => ({ value: id, label: memberName(id), count: facets?.owner[id] })),
  ];

  const industryOptions = [
    { value: 'all', label: 'Any' },
    ...Object.keys(facets?.industry ?? {}).sort().map((industry) => ({ value: industry, label: industry, count: facets?.industry[industry] })),
  ];

  const filtered = list.q || list.values.owner !== 'all' || list.values.member !== 'all' || list.values.industry !== 'all';

  return (
    <CrmShell
      title="Companies"
      actions={
        <>
          <ImportButton entity="companies" />
          <ExportButton entity="companies" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New company
          </Button>
        </>
      }
    >
      <CreateCompanyDialog open={creating} onOpenChange={setCreating} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={list.q} onChange={(q) => list.set({ q })} placeholder="Search by name or domain" />
        <FacetSelect label="Owner" value={list.values.owner} options={ownerOptions} onChange={(owner) => list.set({ owner })} />
        <FacetSelect
          label="Assigned"
          value={list.values.member}
          options={[{ value: 'all', label: 'Anyone' }, { value: 'me', label: 'To me', count: facets?.member.me }]}
          onChange={(member) => list.set({ member })}
        />
        {industryOptions.length > 1 ? <FacetSelect label="Industry" value={list.values.industry} options={industryOptions} onChange={(industry) => list.set({ industry })} /> : null}
      </div>

      <RecordTable
        rows={query.data?.rows}
        columns={columns}
        loading={query.isFetching}
        total={query.data?.total ?? 0}
        page={list.page}
        pageSize={PAGE_SIZE}
        sort={list.sort}
        dir={list.dir}
        onSort={(sort, dir) => list.set({ sort, dir })}
        onPage={(page) => list.set({ page }, false)}
        onRowClick={(row) => openRecord({ kind: 'company', id: row.id })}
        selected={selected}
        onSelectedChange={setSelected}
        empty={
          filtered ? (
            <p className="text-center text-sm text-muted-foreground">No companies match those filters.</p>
          ) : (
            <EmptyState
              icon={Building2}
              title="No companies yet"
              description="Add your first client. Assign team members to it, then log contacts, deals and activity against it."
              action={<Button size="sm" onClick={() => setCreating(true)}><Plus />New company</Button>}
            />
          )
        }
      />

      <BulkBar count={selected.length} onClear={() => setSelected([])}>
        <Select value="" onValueChange={(ownerId) => bulk.mutate({ action: 'owner', ids: selected, ownerId: ownerId === UNASSIGNED ? null : ownerId })}>
          <SelectTrigger className="h-8 w-40 text-sm"><SelectValue placeholder="Set owner" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
            {(members.data?.members ?? []).map((member) => <SelectItem key={member.id} value={member.id}>{member.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value="" onValueChange={(userId) => bulk.mutate({ action: 'assign', ids: selected, userId })}>
          <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder="Assign team member" /></SelectTrigger>
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
            if (window.confirm(`Delete ${selected.length} companies? Their deals and timelines go too.`)) bulk.mutate({ action: 'delete', ids: selected });
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </BulkBar>
    </CrmShell>
  );
}
