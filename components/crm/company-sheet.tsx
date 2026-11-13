import React, { useState } from 'react';
import { Briefcase, Plus, Star, UserPlus, Users, X } from 'lucide-react';
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
  OPEN_DEAL_STAGES,
  contactName,
  formatMoney,
  type DealStage,
  type FieldValueJson,
} from '@/lib/crm/constants';
import { useCrmMembers, useCrmMutation, useCrmQuery, type Person, type RecordField } from './api';
import { CreateContactDialog, CreateDealDialog } from './create-dialogs';
import { useOpenRecord } from './navigation';
import {
  CompanyMark,
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

type CompanyMember = Person & { assignmentId: string; role: string | null; assignedAt: string };

export type Company = {
  id: string;
  name: string;
  domain: string | null;
  website: string | null;
  description: string | null;
  industry: string | null;
  city: string | null;
  stateCode: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  linkedinUrl: string | null;
  twitterUrl: string | null;
  source: string;
  createdAt: string;
  lastActivityAt: string | null;
  primaryContactId: string | null;
  reportingCurrency: string;
  enrichmentStatus: string;
  enrichedAt: string | null;
  enrichmentError: string | null;
  pendingSuggestions: number;
  owner: Person | null;
  createdBy: Person | null;
  members: CompanyMember[];
  fields: RecordField[];
  contacts: {
    id: string;
    firstName: string;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    title: string | null;
    imageUrl: string | null;
    owner: Person | null;
  }[];
  deals: {
    id: string;
    name: string;
    stage: DealStage;
    currency: string;
    amountCents: number | null;
    baseAmountCents: number | null;
    expectedCloseDate: string | null;
    owner: Person;
  }[];
};

function consequence(company: Company) {
  const deals = company.deals.length;
  const contacts = company.contacts.length;
  const gone = deals > 0 ? `${deals === 1 ? 'Its one deal' : `All ${deals} of its deals`} and everything filed against the account go too.` : 'Everything filed against the account goes too.';
  const kept = contacts > 0 ? ` ${contacts === 1 ? 'The one person' : `The ${contacts} people`} who work there stay in the CRM, without a company.` : '';
  return gone + kept;
}

export function CompanySheet({ companyId }: { companyId: string }) {
  const [tab, setTab] = useState('overview');
  const openRecord = useOpenRecord();
  const query = useCrmQuery<Company>(['company', companyId], `/companies/${companyId}`);
  const company = query.data;

  const remove = useCrmMutation<void>((call) => call(`/companies/${companyId}`, 'DELETE'), {
    success: 'Company deleted.',
    onSuccess: () => openRecord(null),
  });

  const openDeals = company?.deals.filter((deal) => OPEN_DEAL_STAGES.indexOf(deal.stage) !== -1) ?? [];
  const openValue = openDeals.reduce((total, deal) => total + (deal.baseAmountCents ?? 0), 0);
  const unconverted = openDeals.filter((deal) => deal.amountCents !== null && deal.baseAmountCents === null).length;
  const nextClose = openDeals.map((deal) => deal.expectedCloseDate).filter((date): date is string => Boolean(date)).sort()[0] ?? null;
  const location = company ? [company.city, company.stateCode, company.country].filter(Boolean).join(', ') : '';

  return (
    <RecordSheetFrame
      loading={query.isPending}
      error={query.error?.message ?? null}
      title={company?.name ?? 'Company'}
      description={company ? [company.domain, location, company.industry].filter(Boolean).join(' · ') || 'No details yet' : undefined}
      media={company ? <CompanyMark name={company.name} domain={company.domain} size="lg" /> : null}
      actions={company ? <RecordActions name={company.name} consequence={consequence(company)} pending={remove.isPending} onDelete={() => remove.mutate()} /> : null}
      stats={
        company ? (
          <StatsRow>
            <Stat label="Open pipeline">
              {formatMoney(openValue, company.reportingCurrency)}
              {unconverted > 0 ? <span className="text-muted-foreground"> +{unconverted} unconverted</span> : null}
            </Stat>
            <Stat label="Open deals">{openDeals.length}</Stat>
            <Stat label="Next close"><LocalDay date={nextClose} /></Stat>
            <Stat label="Owner"><OwnerCell owner={company.owner} /></Stat>
          </StatsRow>
        ) : null
      }
      tab={tab}
      onTabChange={setTab}
      tabs={
        company
          ? [
              { value: 'overview', label: 'Overview', content: <CompanyOverview company={company} /> },
              { value: 'team', label: 'Team', count: company.members.length, content: <CompanyTeam company={company} /> },
              { value: 'contacts', label: 'Contacts', count: company.contacts.length, content: <CompanyContacts company={company} /> },
              { value: 'deals', label: 'Deals', count: company.deals.length, content: <CompanyDeals company={company} /> },
              { value: 'activity', label: 'Activity', content: <Timeline anchor={{ companyId: company.id }} /> },
              {
                value: 'ai',
                label: 'AI',
                count: company.pendingSuggestions || undefined,
                content: (
                  <div className="space-y-6">
                    <ResearchCard kind="company" id={company.id} status={company.enrichmentStatus} error={company.enrichmentError} />
                    <SuggestionsList kind="company" id={company.id} />
                    <AssistantChat kind="company" id={company.id} />
                  </div>
                ),
              },
            ]
          : []
      }
    />
  );
}

function CompanyOverview({ company }: { company: Company }) {
  const members = useCrmMembers();
  const update = useCrmMutation<Record<string, unknown>>((call, data) => call(`/companies/${company.id}`, 'PATCH', data));
  const save = (data: Record<string, string | null>) => update.mutate(data);
  const saveFields = (fields: Record<string, FieldValueJson>) => update.mutate({ fields });

  return (
    <SplitBody
      main={
        <>
          <Section title="About">
            <InlineField label="Description" value={company.description} multiline placeholder="What they do, why they matter" onSave={(description) => save({ description })} />
          </Section>
          <Section title="Assigned team">
            <CompanyTeam company={company} compact />
          </Section>
          <Section title="People">
            <CompanyContacts company={company} />
          </Section>
        </>
      }
      rail={
        <Section title="Details">
          <div>
            <InlineField label="Name" value={company.name} onSave={(name) => name.trim() && save({ name })} />
            <InlineField label="Domain" value={company.domain} placeholder="acme.com" onSave={(domain) => save({ domain })} />
            <InlineField
              label="Website"
              value={company.website}
              type="url"
              placeholder="https://acme.com"
              display={company.website ? <a href={company.website} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="text-blue-600 hover:underline dark:text-blue-400">{company.website}</a> : undefined}
              onSave={(website) => save({ website })}
            />
            <InlineField label="Industry" value={company.industry} onSave={(industry) => save({ industry })} />
            <InlineField label="Phone" value={company.phone} type="tel" onSave={(phone) => save({ phone })} />
            <InlineField label="Email" value={company.email} type="email" onSave={(email) => save({ email })} />
            <InlineField label="City" value={company.city} onSave={(city) => save({ city })} />
            <InlineField label="State" value={company.stateCode} onSave={(stateCode) => save({ stateCode })} />
            <InlineField label="Country" value={company.country} onSave={(country) => save({ country })} />
            <InlineField label="LinkedIn" value={company.linkedinUrl} type="url" onSave={(linkedinUrl) => save({ linkedinUrl })} />
            <InlineField label="X / Twitter" value={company.twitterUrl} type="url" onSave={(twitterUrl) => save({ twitterUrl })} />
            <InlineSelect
              label="Owner"
              value={company.owner?.id ?? UNASSIGNED}
              options={memberOptions(members.data?.members)}
              onSave={(ownerId) => save({ ownerId: ownerId === UNASSIGNED ? null : ownerId })}
            />
            <RecordFields fields={company.fields} onSave={saveFields} />
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Added <RelativeTime date={company.createdAt} />
            {company.createdBy ? ` by ${company.createdBy.name}` : ''} · last activity <RelativeTime date={company.lastActivityAt} empty="never" />
          </p>
        </Section>
      }
    />
  );
}

// Team members working this client: the link between the CRM and the rest of the workspace.
function CompanyTeam({ company, compact = false }: { company: Company; compact?: boolean }) {
  const members = useCrmMembers();
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState('');

  const assign = useCrmMutation<{ userId: string; role: string | null }>(
    (call, input) => call(`/companies/${company.id}/members`, 'POST', input),
    {
      success: 'Assigned to the client.',
      onSuccess: () => {
        setUserId('');
        setRole('');
      },
    }
  );
  const unassign = useCrmMutation<string>((call, id) => call(`/companies/${company.id}/members?userId=${encodeURIComponent(id)}`, 'DELETE'), {
    success: 'Removed from the client.',
  });

  const assignedIds = company.members.map((member) => member.id);
  const available = (members.data?.members ?? []).filter((member) => assignedIds.indexOf(member.id) === -1);

  return (
    <div className="space-y-3">
      {company.members.length === 0 ? (
        compact ? (
          <p className="text-sm text-muted-foreground">Nobody is assigned to this client yet.</p>
        ) : (
          <EmptyState icon={Users} title="No one assigned" description={`Assign team members to ${company.name} so everyone knows who works the account. They get notified and it shows on their CRM overview.`} />
        )
      ) : (
        <ul className="divide-y rounded-lg border dark:divide-[#222] dark:border-[#262626]">
          {company.members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-3 py-2">
              <PersonAvatar person={member} size="md" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">
                  {member.name}
                  {company.owner?.id === member.id ? <span className="ml-1.5 rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-normal text-muted-foreground dark:bg-[#222]">Owner</span> : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {member.role ?? 'Team member'} · {member.email}
                </div>
              </div>
              <button
                type="button"
                aria-label={`Remove ${member.name}`}
                disabled={unassign.isPending}
                onClick={() => unassign.mutate(member.id)}
                className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-red-500"
              >
                <X className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {available.length > 0 ? (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (userId) assign.mutate({ userId, role: role.trim() || null });
          }}
        >
          <Select value={userId || undefined} onValueChange={setUserId}>
            <SelectTrigger className="h-8 w-48 text-sm">
              <SelectValue placeholder="Assign a team member" />
            </SelectTrigger>
            <SelectContent>
              {available.map((member) => (
                <SelectItem key={member.id} value={member.id}>
                  {member.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input value={role} onChange={(event) => setRole(event.target.value)} placeholder="Role, e.g. Account manager" className="h-8 w-52 text-sm" />
          <Button type="submit" size="sm" variant="outline" disabled={!userId || assign.isPending}>
            <UserPlus />
            Assign
          </Button>
        </form>
      ) : null}
    </div>
  );
}

function CompanyContacts({ company }: { company: Company }) {
  const openRecord = useOpenRecord();
  const [adding, setAdding] = useState(false);
  const setPrimary = useCrmMutation<string>((call, contactId) => call(`/companies/${company.id}/primary-contact`, 'PUT', { contactId }), {
    success: 'Primary contact set.',
  });

  const dialog = <CreateContactDialog open={adding} onOpenChange={setAdding} companyId={company.id} ownerId={company.owner?.id ?? null} />;

  if (company.contacts.length === 0) {
    return (
      <>
        {dialog}
        <EmptyState
          icon={Users}
          title="No contacts yet"
          description={`Everyone you talk to at ${company.name} lives here. Add the first person and their calls, emails and notes hang off them.`}
          action={<Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus />Add contact</Button>}
        />
      </>
    );
  }

  return (
    <div className="space-y-2">
      {dialog}
      <MiniTable headers={[{ label: '', className: 'w-10' }, { label: 'Name' }, { label: 'Title' }, { label: 'Email' }, { label: 'Owner' }]}>
        {company.contacts.map((contact) => {
          const primary = contact.id === company.primaryContactId;
          return (
            <tr key={contact.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openRecord({ kind: 'contact', id: contact.id })}>
              <td className="px-3 py-2">
                <button
                  type="button"
                  title={primary ? 'Primary contact' : 'Make primary'}
                  disabled={primary || setPrimary.isPending}
                  onClick={(event) => {
                    event.stopPropagation();
                    setPrimary.mutate(contact.id);
                  }}
                >
                  <Star className={primary ? 'size-4 fill-amber-400 text-amber-400' : 'size-4 text-muted-foreground'} />
                </button>
              </td>
              <td className="truncate px-3 py-2 font-medium">{contactName(contact)}</td>
              <td className="truncate px-3 py-2">{contact.title ?? <span className="text-muted-foreground">—</span>}</td>
              <td className="truncate px-3 py-2 text-muted-foreground">{contact.email ?? '—'}</td>
              <td className="px-3 py-2"><OwnerCell owner={contact.owner} /></td>
            </tr>
          );
        })}
      </MiniTable>
      <Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus />Add contact</Button>
    </div>
  );
}

function CompanyDeals({ company }: { company: Company }) {
  const openRecord = useOpenRecord();
  const [adding, setAdding] = useState(false);
  const dialog = (
    <CreateDealDialog open={adding} onOpenChange={setAdding} companyId={company.id} ownerId={company.owner?.id ?? null} currency={company.reportingCurrency} />
  );

  if (company.deals.length === 0) {
    return (
      <>
        {dialog}
        <EmptyState
          icon={Briefcase}
          title="No deals yet"
          description={`Nothing is being sold to ${company.name} right now. Open one and it joins the pipeline and the forecast.`}
          action={<Button variant="outline" size="sm" onClick={() => setAdding(true)}><Plus />New deal</Button>}
        />
      </>
    );
  }

  return (
    <div className="space-y-2">
      {dialog}
      <MiniTable headers={[{ label: 'Deal' }, { label: 'Stage', className: 'w-44' }, { label: 'Amount', className: 'w-28 text-right' }, { label: 'Close date', className: 'w-28' }, { label: 'Owner', className: 'w-36' }]}>
        {company.deals.map((deal) => (
          <tr key={deal.id} className="cursor-pointer hover:bg-accent/50" onClick={() => openRecord({ kind: 'deal', id: deal.id })}>
            <td className="truncate px-3 py-2 font-medium">{deal.name}</td>
            <td className="px-3 py-2"><DealStageMenu dealId={deal.id} stage={deal.stage} /></td>
            <td className="px-3 py-2 text-right tabular-nums">{formatMoney(deal.amountCents, deal.currency)}</td>
            <td className="px-3 py-2 text-muted-foreground"><LocalDay date={deal.expectedCloseDate} /></td>
            <td className="px-3 py-2"><OwnerCell owner={deal.owner} /></td>
          </tr>
        ))}
      </MiniTable>
      <Button variant="ghost" size="sm" onClick={() => setAdding(true)}><Plus />New deal</Button>
    </div>
  );
}
