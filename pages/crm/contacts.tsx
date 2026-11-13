import React, { useMemo, useState } from 'react';
import { Plus, Trash2, Users } from 'lucide-react';
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
import { CreateContactDialog, useCompanyOptions } from '@/components/crm/create-dialogs';
import { useOpenRecord } from '@/components/crm/navigation';
import { EmptyState, OwnerCell, PersonAvatar, RelativeTime, UNASSIGNED } from '@/components/crm/primitives';
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
import { contactName, type FieldValueJson } from '@/lib/crm/constants';

type ContactRow = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  imageUrl: string | null;
  company: { id: string; name: string; domain: string | null } | null;
  owner: Person | null;
  lastActivityAt: string | null;
  createdAt: string;
  fields: Record<string, FieldValueJson>;
};

type ContactList = {
  rows: ContactRow[];
  total: number;
  columns: ColumnDef[];
  facetCounts: { owner: Record<string, number>; company: Record<string, number>; source: Record<string, number> };
};

const PAGE_SIZE = 25;
const NO_COMPANY = '__none__';

export default function ContactsPage() {
  const openRecord = useOpenRecord();
  const members = useCrmMembers();
  const companies = useCompanyOptions();
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const list = useListParams({ owner: 'all', company: 'all' });

  const query = useCrmQuery<ContactList>(
    ['contacts', list.values, list.q, list.page, list.sort, list.dir],
    `/contacts${toQuery({ ...list.values, q: list.q, page: list.page, pageSize: PAGE_SIZE, sort: list.sort, dir: list.dir })}`,
    { keepPrevious: true }
  );

  const bulk = useCrmMutation<Record<string, unknown>, BulkResult>((call, input) => call('/contacts/bulk', 'POST', input), {
    success: bulkMessage,
    onSuccess: () => setSelected([]),
  });

  const facets = query.data?.facetCounts;
  const memberName = (id: string) => members.data?.members.find((member) => member.id === id)?.name ?? 'Former member';
  const companyName = (id: string) => companies.data?.find((company) => company.id === id)?.name ?? 'Unknown company';

  const columns = useMemo<TableColumn<ContactRow>[]>(
    () => [
      {
        id: 'name',
        header: 'Name',
        sortKey: 'name',
        className: 'w-56',
        render: (row) => (
          <span className="flex min-w-0 items-center gap-2">
            <PersonAvatar person={{ name: contactName(row), image: row.imageUrl }} />
            <span className="truncate font-medium">{contactName(row)}</span>
          </span>
        ),
      },
      { id: 'title', header: 'Title', sortKey: 'title', className: 'w-40', render: (row) => row.title ?? <span className="text-muted-foreground">—</span> },
      { id: 'company', header: 'Company', sortKey: 'company', className: 'w-44', render: (row) => row.company?.name ?? <span className="text-muted-foreground">—</span> },
      { id: 'email', header: 'Email', sortKey: 'email', className: 'w-56 text-muted-foreground', render: (row) => row.email ?? '—' },
      { id: 'owner', header: 'Owner', sortKey: 'owner', className: 'w-40', render: (row) => <OwnerCell owner={row.owner} /> },
      ...fieldColumns<ContactRow>(query.data?.columns),
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

  const companyOptions = [
    { value: 'all', label: 'Any' },
    { value: 'none', label: 'No company', count: facets?.company.none },
    ...Object.keys(facets?.company ?? {})
      .filter((id) => id !== 'none')
      .map((id) => ({ value: id, label: companyName(id), count: facets?.company[id] })),
  ];

  const filtered = list.q || list.values.owner !== 'all' || list.values.company !== 'all';

  return (
    <CrmShell
      title="Contacts"
      actions={
        <>
          <ImportButton entity="contacts" />
          <ExportButton entity="contacts" />
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus />
            New contact
          </Button>
        </>
      }
    >
      <CreateContactDialog open={creating} onOpenChange={setCreating} />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <SearchBox value={list.q} onChange={(q) => list.set({ q })} placeholder="Search name, email or company" />
        <FacetSelect label="Owner" value={list.values.owner} options={ownerOptions} onChange={(owner) => list.set({ owner })} />
        <FacetSelect label="Company" value={list.values.company} options={companyOptions} onChange={(company) => list.set({ company })} />
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
        onRowClick={(row) => openRecord({ kind: 'contact', id: row.id })}
        selected={selected}
        onSelectedChange={setSelected}
        empty={
          filtered ? (
            <p className="text-center text-sm text-muted-foreground">No contacts match those filters.</p>
          ) : (
            <EmptyState
              icon={Users}
              title="No contacts yet"
              description="Add the people you talk to. A work email files them under their company automatically."
              action={<Button size="sm" onClick={() => setCreating(true)}><Plus />New contact</Button>}
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
        <Select value="" onValueChange={(companyId) => bulk.mutate({ action: 'company', ids: selected, companyId: companyId === NO_COMPANY ? null : companyId })}>
          <SelectTrigger className="h-8 w-44 text-sm"><SelectValue placeholder="Move to company" /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NO_COMPANY}>No company</SelectItem>
            {(companies.data ?? []).map((company) => <SelectItem key={company.id} value={company.id}>{company.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button
          variant="outline"
          size="sm"
          className="text-red-600"
          disabled={bulk.isPending}
          onClick={() => {
            if (window.confirm(`Delete ${selected.length} contacts?`)) bulk.mutate({ action: 'delete', ids: selected });
          }}
        >
          <Trash2 />
          Delete
        </Button>
      </BulkBar>
    </CrmShell>
  );
}
