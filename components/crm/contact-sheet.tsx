import React, { useState } from 'react';
import { Briefcase } from 'lucide-react';
import {
  contactName,
  formatMoney,
  type DealStage,
  type FieldValueJson,
} from '@/lib/crm/constants';
import { useCrmMembers, useCrmMutation, useCrmQuery, type Person, type RecordField } from './api';
import { useCompanyOptions } from './create-dialogs';
import { useOpenRecord } from './navigation';
import {
  EmptyState,
  InlineField,
  InlineSelect,
  LocalDay,
  OwnerCell,
  PersonAvatar,
  RelativeTime,
  Section,
  Stat,
  UNASSIGNED,
  memberOptions,
} from './primitives';
import { RecordFields } from './record-fields';
import { MiniTable, RecordActions, RecordSheetFrame, SplitBody, StatsRow } from './sheet-frame';
import { DealStageMenu } from './stage-menu';
import { Timeline } from './timeline';
import { AssistantChat, ResearchCard, SuggestionsList } from './ai-panel';

const NO_COMPANY = '__none__';

type Contact = {
  id: string;
  firstName: string;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  githubUrl: string | null;
  imageUrl: string | null;
  createdAt: string;
  lastActivityAt: string | null;
  isPrimaryContact: boolean;
  enrichmentStatus: string;
  enrichedAt: string | null;
  enrichmentError: string | null;
  pendingSuggestions: number;
  company: { id: string; name: string; domain: string | null; industry: string | null } | null;
  owner: Person | null;
  fields: RecordField[];
  relationship: {
    calls: number;
    emails: number;
    meetings: number;
    notes: number;
    nextTask: { subject: string | null; dueAt: string | null } | null;
    colleagues: { id: string; name: string; title: string | null }[];
  };
  deals: {
    id: string;
    name: string;
    stage: DealStage;
    currency: string;
    amountCents: number | null;
    expectedCloseDate: string | null;
    role: string | null;
    owner: Person;
  }[];
};

export function ContactSheet({ contactId }: { contactId: string }) {
  const [tab, setTab] = useState('overview');
  const openRecord = useOpenRecord();
  const query = useCrmQuery<Contact>(['contact', contactId], `/contacts/${contactId}`);
  const contact = query.data;

  const remove = useCrmMutation<void>((call) => call(`/contacts/${contactId}`, 'DELETE'), {
    success: 'Contact deleted.',
    onSuccess: () => openRecord(null),
  });

  const name = contact ? contactName(contact) : 'Contact';

  return (
    <RecordSheetFrame
      loading={query.isPending}
      error={query.error?.message ?? null}
      title={name}
      description={
        contact ? (
          <span>
            {[contact.title, contact.email].filter(Boolean).join(' · ')}
            {contact.company ? (
              <>
                {contact.title || contact.email ? ' · ' : ''}
                <button type="button" className="text-blue-600 hover:underline dark:text-blue-400" onClick={() => openRecord({ kind: 'company', id: contact.company!.id })}>
                  {contact.company.name}
                </button>
              </>
            ) : null}
          </span>
        ) : undefined
      }
      media={contact ? <PersonAvatar person={{ name, image: contact.imageUrl }} size="lg" /> : null}
      actions={contact ? <RecordActions name={name} consequence="Their timeline goes with them; deals they were on stay." pending={remove.isPending} onDelete={() => remove.mutate()} /> : null}
      stats={
        contact ? (
          <StatsRow>
            <Stat label="Calls & meetings">{contact.relationship.calls + contact.relationship.meetings}</Stat>
            <Stat label="Emails logged">{contact.relationship.emails}</Stat>
            <Stat label="Last activity"><RelativeTime date={contact.lastActivityAt} empty="Never" /></Stat>
            <Stat label="Owner"><OwnerCell owner={contact.owner} /></Stat>
          </StatsRow>
        ) : null
      }
      tab={tab}
      onTabChange={setTab}
      tabs={
        contact
          ? [
              { value: 'overview', label: 'Overview', content: <ContactOverview contact={contact} /> },
              { value: 'deals', label: 'Deals', count: contact.deals.length, content: <ContactDeals contact={contact} /> },
              { value: 'activity', label: 'Activity', content: <Timeline anchor={{ contactId: contact.id }} /> },
              {
                value: 'ai',
                label: 'AI',
                count: contact.pendingSuggestions || undefined,
                content: (
                  <div className="space-y-6">
                    <ResearchCard kind="contact" id={contact.id} status={contact.enrichmentStatus} error={contact.enrichmentError} />
                    <SuggestionsList kind="contact" id={contact.id} />
                    <AssistantChat kind="contact" id={contact.id} />
                  </div>
                ),
              },
            ]
          : []
      }
    />
  );
}

function ContactOverview({ contact }: { contact: Contact }) {
  const members = useCrmMembers();
  const companies = useCompanyOptions();
  const openRecord = useOpenRecord();
  const update = useCrmMutation<Record<string, unknown>>((call, data) => call(`/contacts/${contact.id}`, 'PATCH', data));
  const save = (data: Record<string, string | null>) => update.mutate(data);
  const saveFields = (fields: Record<string, FieldValueJson>) => update.mutate({ fields });
  const { relationship } = contact;

  return (
    <SplitBody
      main={
        <>
          <Section title="Relationship">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Calls">{relationship.calls}</Stat>
              <Stat label="Meetings">{relationship.meetings}</Stat>
              <Stat label="Emails">{relationship.emails}</Stat>
              <Stat label="Notes">{relationship.notes}</Stat>
            </div>
            {relationship.nextTask ? (
              <p className="text-sm text-muted-foreground">
                Next up: <span className="text-foreground">{relationship.nextTask.subject}</span>
                {relationship.nextTask.dueAt ? <> on <LocalDay date={relationship.nextTask.dueAt} /></> : null}
              </p>
            ) : null}
          </Section>
          {relationship.colleagues.length > 0 ? (
            <Section title={`Also at ${contact.company?.name ?? 'their company'}`}>
              <ul className="space-y-1">
                {relationship.colleagues.map((colleague) => (
                  <li key={colleague.id}>
                    <button type="button" className="flex items-center gap-2 text-sm hover:underline" onClick={() => openRecord({ kind: 'contact', id: colleague.id })}>
                      <PersonAvatar person={{ name: colleague.name }} size="xs" />
                      {colleague.name}
                      {colleague.title ? <span className="text-muted-foreground">· {colleague.title}</span> : null}
                    </button>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
        </>
      }
      rail={
        <Section title="Details">
          <div>
            <InlineField label="First name" value={contact.firstName} onSave={(firstName) => firstName.trim() && save({ firstName })} />
            <InlineField label="Last name" value={contact.lastName} onSave={(lastName) => save({ lastName })} />
            <InlineField label="Title" value={contact.title} onSave={(title) => save({ title })} />
            <InlineField label="Email" value={contact.email} type="email" onSave={(email) => save({ email })} />
            <InlineField label="Phone" value={contact.phone} type="tel" onSave={(phone) => save({ phone })} />
            <InlineSelect
              label="Company"
              value={contact.company?.id ?? NO_COMPANY}
              options={[{ value: NO_COMPANY, label: 'No company' }, ...(companies.data ?? []).map((company) => ({ value: company.id, label: company.name }))]}
              onSave={(companyId) => save({ companyId: companyId === NO_COMPANY ? null : companyId })}
            />
            <InlineSelect
              label="Owner"
              value={contact.owner?.id ?? UNASSIGNED}
              options={memberOptions(members.data?.members)}
              onSave={(ownerId) => save({ ownerId: ownerId === UNASSIGNED ? null : ownerId })}
            />
            <InlineField label="LinkedIn" value={contact.linkedinUrl} type="url" onSave={(linkedinUrl) => save({ linkedinUrl })} />
            <InlineField label="X / Twitter" value={contact.twitterUrl} type="url" onSave={(twitterUrl) => save({ twitterUrl })} />
            <InlineField label="GitHub" value={contact.githubUrl} type="url" onSave={(githubUrl) => save({ githubUrl })} />
            <RecordFields fields={contact.fields} onSave={saveFields} />
          </div>
          {contact.isPrimaryContact ? <p className="pt-2 text-xs text-muted-foreground">Primary contact at {contact.company?.name}.</p> : null}
        </Section>
      }
    />
  );
}

function ContactDeals({ contact }: { contact: Contact }) {
  const openRecord = useOpenRecord();
  if (contact.deals.length === 0) {
    return (
      <EmptyState
        icon={Briefcase}
        title="Not on any deals"
        description="Add them to a deal from the deal's sheet to record who is involved and in what role."
      />
    );
  }
  return (
    <MiniTable headers={[{ label: 'Deal' }, { label: 'Role', className: 'w-32' }, { label: 'Stage', className: 'w-44' }, { label: 'Amount', className: 'w-28 text-right' }, { label: 'Owner', className: 'w-36' }]}>
      {contact.deals.map((deal) => (
        <tr key={deal.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openRecord({ kind: 'deal', id: deal.id })}>
          <td className="truncate px-3 py-2 font-medium">{deal.name}</td>
          <td className="truncate px-3 py-2 text-muted-foreground">{deal.role ?? '—'}</td>
          <td className="px-3 py-2"><DealStageMenu dealId={deal.id} stage={deal.stage} /></td>
          <td className="px-3 py-2 text-right tabular-nums">{formatMoney(deal.amountCents, deal.currency)}</td>
          <td className="px-3 py-2"><OwnerCell owner={deal.owner} /></td>
        </tr>
      ))}
    </MiniTable>
  );
}
