import React, { useState } from 'react';
import { Plus, UserPlus, Users, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CURRENCIES,
  contactName,
  formatMoney,
  isClosedStage,
  type DealStage,
  type FieldValueJson,
} from '@/lib/crm/constants';
import { useCrmMembers, useCrmMutation, useCrmQuery, type Person, type RecordField } from './api';
import { centsFromInput, useCompanyOptions } from './create-dialogs';
import { useOpenRecord } from './navigation';
import {
  CompanyMark,
  EmptyState,
  InlineField,
  InlineSelect,
  LocalDay,
  MemberStack,
  OwnerCell,
  PersonAvatar,
  RelativeTime,
  Section,
  Stat,
  memberOptions,
} from './primitives';
import { RecordFields } from './record-fields';
import { MiniTable, RecordActions, RecordSheetFrame, SplitBody, StatsRow } from './sheet-frame';
import { DealStageMenu, StageStepper } from './stage-menu';
import { Timeline } from './timeline';
import { AssistantChat, ResearchCard } from './ai-panel';

type DealContact = { id: string; firstName: string; lastName: string | null; email: string | null; title: string | null; imageUrl: string | null; role: string | null };

type Deal = {
  id: string;
  name: string;
  description: string | null;
  stage: DealStage;
  stageChangedAt: string;
  currency: string;
  amountCents: number | null;
  baseAmountCents: number | null;
  reportingCurrency: string;
  expectedCloseDate: string | null;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  company: { id: string; name: string; domain: string | null; industry: string | null; members: (Person & { role: string | null })[] };
  owner: Person;
  fields: RecordField[];
  contacts: DealContact[];
};

export function DealSheet({ dealId }: { dealId: string }) {
  const [tab, setTab] = useState('overview');
  const openRecord = useOpenRecord();
  const query = useCrmQuery<Deal>(['deal', dealId], `/deals/${dealId}`);
  const deal = query.data;

  const remove = useCrmMutation<void>((call) => call(`/deals/${dealId}`, 'DELETE'), {
    success: 'Deal deleted.',
    onSuccess: () => openRecord(null),
  });

  return (
    <RecordSheetFrame
      loading={query.isPending}
      error={query.error?.message ?? null}
      title={deal?.name ?? 'Deal'}
      description={
        deal ? (
          <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => openRecord({ kind: 'company', id: deal.company.id })}>
            {deal.company.name}
          </button>
        ) : undefined
      }
      media={deal ? <CompanyMark name={deal.company.name} domain={deal.company.domain} size="lg" /> : null}
      actions={
        deal ? (
          <>
            <DealStageMenu dealId={deal.id} stage={deal.stage} variant="control" />
            <RecordActions name={deal.name} consequence="Its timeline goes with it." pending={remove.isPending} onDelete={() => remove.mutate()} />
          </>
        ) : null
      }
      stats={
        deal ? (
          <div className="space-y-3">
            <StatsRow>
              <Stat label="Amount">
                {formatMoney(deal.amountCents, deal.currency)}
                {deal.amountCents !== null && deal.currency !== deal.reportingCurrency ? (
                  <span className="text-muted-foreground">
                    {' '}
                    {deal.baseAmountCents !== null ? `≈ ${formatMoney(deal.baseAmountCents, deal.reportingCurrency)}` : '(no rate)'}
                  </span>
                ) : null}
              </Stat>
              <Stat label="Expected close"><LocalDay date={deal.expectedCloseDate} /></Stat>
              <Stat label="In stage since"><RelativeTime date={deal.stageChangedAt} /></Stat>
              <Stat label="Owner"><OwnerCell owner={deal.owner} /></Stat>
            </StatsRow>
            {isClosedStage(deal.stage) ? (
              <p className="text-sm text-muted-foreground">
                Closed <LocalDay date={deal.closedAt} />
                {deal.closedReason ? <>: <span className="text-foreground">{deal.closedReason}</span></> : null}
              </p>
            ) : (
              <StageStepper dealId={deal.id} stage={deal.stage} />
            )}
          </div>
        ) : null
      }
      tab={tab}
      onTabChange={setTab}
      tabs={
        deal
          ? [
              { value: 'overview', label: 'Overview', content: <DealOverview deal={deal} /> },
              { value: 'people', label: 'People', count: deal.contacts.length, content: <DealPeople deal={deal} /> },
              { value: 'activity', label: 'Activity', content: <Timeline anchor={{ dealId: deal.id }} /> },
              {
                value: 'ai',
                label: 'AI',
                count: undefined,
                content: (
                  <div className="space-y-6">
                    <ResearchCard kind="deal" id={deal.id} />
                    
                    <AssistantChat kind="deal" id={deal.id} />
                  </div>
                ),
              },
            ]
          : []
      }
    />
  );
}

function DealOverview({ deal }: { deal: Deal }) {
  const members = useCrmMembers();
  const companies = useCompanyOptions();
  const update = useCrmMutation<Record<string, unknown>>((call, data) => call(`/deals/${deal.id}`, 'PATCH', data));
  const save = (data: Record<string, unknown>) => update.mutate(data);
  const saveFields = (fields: Record<string, FieldValueJson>) => update.mutate({ fields });

  return (
    <SplitBody
      main={
        <>
          <Section title="Description">
            <InlineField label="Notes" value={deal.description} multiline placeholder="What they are buying and why" onSave={(description) => save({ description })} />
          </Section>
          <Section title="Client team">
            <div className="flex items-center gap-2 text-sm">
              <MemberStack members={deal.company.members} max={6} />
              <span className="text-muted-foreground">
                {deal.company.members.length > 0 ? `assigned to ${deal.company.name}` : `Nobody is assigned to ${deal.company.name} yet.`}
              </span>
            </div>
          </Section>
        </>
      }
      rail={
        <Section title="Details">
          <div>
            <InlineField label="Name" value={deal.name} onSave={(name) => name.trim() && save({ name })} />
            <InlineField
              label="Amount"
              value={deal.amountCents === null ? '' : String(deal.amountCents / 100)}
              type="number"
              display={deal.amountCents === null ? undefined : formatMoney(deal.amountCents, deal.currency)}
              onSave={(value) => {
                const cents = centsFromInput(value);
                if (value.trim() === '' || cents !== null) save({ amountCents: cents });
              }}
            />
            <InlineSelect
              label="Currency"
              value={deal.currency}
              options={Array.from(new Set([deal.currency, deal.reportingCurrency, ...CURRENCIES])).map((code) => ({ value: code, label: code }))}
              onSave={(currency) => save({ currency })}
            />
            <InlineField
              label="Close date"
              value={deal.expectedCloseDate ? deal.expectedCloseDate.slice(0, 10) : ''}
              type="date"
              display={deal.expectedCloseDate ? <LocalDay date={deal.expectedCloseDate} /> : undefined}
              onSave={(value) => save({ expectedCloseDate: value ? new Date(`${value}T12:00:00`).toISOString() : null })}
            />
            <InlineSelect
              label="Company"
              value={deal.company.id}
              options={(companies.data ?? [{ id: deal.company.id, name: deal.company.name, domain: null }]).map((company) => ({ value: company.id, label: company.name }))}
              onSave={(companyId) => save({ companyId })}
            />
            <InlineSelect label="Owner" value={deal.owner.id} options={memberOptions(members.data?.members, false)} onSave={(ownerId) => save({ ownerId })} />
            <RecordFields fields={deal.fields} onSave={saveFields} />
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Opened <RelativeTime date={deal.createdAt} /> · last activity <RelativeTime date={deal.lastActivityAt} empty="never" />
          </p>
        </Section>
      }
    />
  );
}

function DealPeople({ deal }: { deal: Deal }) {
  const openRecord = useOpenRecord();
  const options = useCrmQuery<DealContact[]>(['deal-contact-options', deal.id], `/deals/${deal.id}/contacts`);
  const [contactId, setContactId] = useState('');
  const [role, setRole] = useState('');

  const attach = useCrmMutation<{ contactId: string; role: string | null }>((call, input) => call(`/deals/${deal.id}/contacts`, 'POST', input), {
    success: 'Added to the deal.',
    onSuccess: () => {
      setContactId('');
      setRole('');
    },
  });
  const detach = useCrmMutation<string>((call, id) => call(`/deals/${deal.id}/contacts?contactId=${encodeURIComponent(id)}`, 'DELETE'));
  const setContactRole = useCrmMutation<{ contactId: string; role: string | null }>((call, input) => call(`/deals/${deal.id}/contacts`, 'PATCH', input));

  return (
    <div className="space-y-3">
      {deal.contacts.length === 0 ? (
        <EmptyState icon={Users} title="Nobody on this deal yet" description={`Bring in the people at ${deal.company.name} who are involved: the champion, the buyer, the person who signs.`} />
      ) : (
        <MiniTable headers={[{ label: 'Name' }, { label: 'Role', className: 'w-48' }, { label: 'Email' }, { label: '', className: 'w-10' }]}>
          {deal.contacts.map((contact) => (
            <tr key={contact.id} className="hover:bg-accent/50">
              <td className="px-3 py-2">
                <button type="button" className="flex items-center gap-2 font-medium hover:underline" onClick={() => openRecord({ kind: 'contact', id: contact.id })}>
                  <PersonAvatar person={{ name: contactName(contact), image: contact.imageUrl }} size="xs" />
                  <span className="truncate">{contactName(contact)}</span>
                </button>
              </td>
              <td className="px-3 py-1">
                <Input
                  defaultValue={contact.role ?? ''}
                  placeholder="Champion, buyer…"
                  className="h-7 text-xs"
                  onBlur={(event) => {
                    const next = event.target.value.trim();
                    if (next !== (contact.role ?? '')) setContactRole.mutate({ contactId: contact.id, role: next || null });
                  }}
                />
              </td>
              <td className="truncate px-3 py-2 text-muted-foreground">{contact.email ?? '—'}</td>
              <td className="px-3 py-2">
                <button type="button" aria-label="Remove from deal" onClick={() => detach.mutate(contact.id)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-500">
                  <X className="size-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </MiniTable>
      )}

      {(options.data ?? []).length > 0 ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (contactId) attach.mutate({ contactId, role: role.trim() || null });
          }}
        >
          <Select value={contactId || undefined} onValueChange={setContactId}>
            <SelectTrigger className="h-8 w-56 text-sm">
              <SelectValue placeholder={`Someone at ${deal.company.name}`} />
            </SelectTrigger>
            <SelectContent>
              {(options.data ?? []).map((contact) => (
                <SelectItem key={contact.id} value={contact.id}>
                  {contactName(contact)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role (optional)" className="h-8 w-44 text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={!contactId || attach.isPending}>
            <UserPlus />
            Add to deal
          </Button>
        </form>
      ) : (
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <Plus className="size-3" /> Everyone at {deal.company.name} is already on this deal, or there is nobody there yet. Add contacts from the company sheet.
        </p>
      )}
    </div>
  );
}
