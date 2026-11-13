import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CURRENCIES, DEAL_STAGE_OPTIONS, OPEN_DEAL_STAGES, type DealStage } from '@/lib/crm/constants';
import { useCrmMembers, useCrmMutation, useCrmQuery } from './api';
import { useOpenRecord } from './navigation';
import { FieldLabel, MemberSelect, PersonAvatar, Spinner, StageBadge } from './primitives';

const NO_COMPANY = '__none__';

type CompanyOption = { id: string; name: string; domain: string | null };

export function useCompanyOptions() {
  return useCrmQuery<CompanyOption[]>(['company-options'], '/companies/options');
}

function DialogFrame({
  open,
  onOpenChange,
  title,
  description,
  formId,
  pending,
  submitLabel,
  canSubmit,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  formId: string;
  pending: boolean;
  submitLabel: string;
  canSubmit: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="submit" form={formId} disabled={pending || !canSubmit}>
            {pending ? <Spinner className="text-current" /> : null}
            {submitLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CreateCompanyDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const members = useCrmMembers();
  const openRecord = useOpenRecord();
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [industry, setIndustry] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);

  useEffect(() => {
    if (open) {
      setName('');
      setDomain('');
      setIndustry('');
      setOwnerId(members.data?.me.id ?? null);
      setMemberIds([]);
    }
  }, [open, members.data?.me.id]);

  const create = useCrmMutation<Record<string, unknown>, { id: string; name: string }>(
    (call, input) => call('/companies', 'POST', input),
    {
      success: (company) => `${company.name} added.`,
      onSuccess: (company) => {
        onOpenChange(false);
        openRecord({ kind: 'company', id: company.id });
      },
    }
  );

  const available = (members.data?.members ?? []).filter((member) => memberIds.indexOf(member.id) === -1);

  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="New company"
      description="A client or prospect. Its contacts, deals and activity all hang off it."
      formId="crm-create-company"
      pending={create.isPending}
      submitLabel="Create company"
      canSubmit={name.trim() !== ''}
    >
      <form
        id="crm-create-company"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({ name, domain: domain || undefined, industry: industry || undefined, ownerId, memberIds });
        }}
      >
        <div>
          <FieldLabel htmlFor="crm-company-name">Name</FieldLabel>
          <Input id="crm-company-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Inc." autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel htmlFor="crm-company-domain">Domain</FieldLabel>
            <Input id="crm-company-domain" value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="acme.com" />
          </div>
          <div>
            <FieldLabel htmlFor="crm-company-industry">Industry</FieldLabel>
            <Input id="crm-company-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Software" />
          </div>
        </div>
        <div>
          <FieldLabel>Owner</FieldLabel>
          <MemberSelect value={ownerId} members={members.data?.members} onChange={setOwnerId} />
        </div>
        <div>
          <FieldLabel>Assigned team members</FieldLabel>
          <div className="flex flex-wrap gap-1.5">
            {memberIds.map((id) => {
              const member = members.data?.members.find((entry) => entry.id === id);
              if (!member) return null;
              return (
                <span key={id} className="flex items-center gap-1 rounded-full border py-0.5 pl-0.5 pr-1.5 text-xs dark:border-[#333]">
                  <PersonAvatar person={member} size="xs" />
                  {member.name}
                  <button type="button" aria-label={`Remove ${member.name}`} onClick={() => setMemberIds(memberIds.filter((entry) => entry !== id))}>
                    <X className="size-3" />
                  </button>
                </span>
              );
            })}
          </div>
          {available.length > 0 ? (
            <Select value="" onValueChange={(id) => setMemberIds([...memberIds, id])}>
              <SelectTrigger className="mt-1.5 h-9">
                <SelectValue placeholder="Add a team member" />
              </SelectTrigger>
              <SelectContent>
                {available.map((member) => (
                  <SelectItem key={member.id} value={member.id}>
                    {member.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </form>
    </DialogFrame>
  );
}

export function CreateContactDialog({
  open,
  onOpenChange,
  companyId,
  ownerId: presetOwner,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  ownerId?: string | null;
}) {
  const members = useCrmMembers();
  const companies = useCompanyOptions();
  const openRecord = useOpenRecord();
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', title: '' });
  const [company, setCompany] = useState<string>(NO_COMPANY);
  const [ownerId, setOwnerId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm({ firstName: '', lastName: '', email: '', phone: '', title: '' });
      setCompany(companyId ?? NO_COMPANY);
      setOwnerId(presetOwner !== undefined ? presetOwner : (members.data?.me.id ?? null));
    }
  }, [open, companyId, presetOwner, members.data?.me.id]);

  const create = useCrmMutation<Record<string, unknown>, { id: string; firstName: string }>(
    (call, input) => call('/contacts', 'POST', input),
    {
      success: (contact) => `${contact.firstName} added.`,
      onSuccess: (contact) => {
        onOpenChange(false);
        if (!companyId) openRecord({ kind: 'contact', id: contact.id });
      },
    }
  );

  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: event.target.value });

  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="New contact"
      description="Someone you talk to. A work email files them under their company automatically."
      formId="crm-create-contact"
      pending={create.isPending}
      submitLabel="Create contact"
      canSubmit={form.firstName.trim() !== ''}
    >
      <form
        id="crm-create-contact"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          create.mutate({
            ...form,
            companyId: company === NO_COMPANY ? (companyId ? null : undefined) : company,
            ownerId,
          });
        }}
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>First name</FieldLabel>
            <Input value={form.firstName} onChange={set('firstName')} autoFocus />
          </div>
          <div>
            <FieldLabel>Last name</FieldLabel>
            <Input value={form.lastName} onChange={set('lastName')} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Email</FieldLabel>
            <Input type="email" value={form.email} onChange={set('email')} placeholder="jane@acme.com" />
          </div>
          <div>
            <FieldLabel>Phone</FieldLabel>
            <Input type="tel" value={form.phone} onChange={set('phone')} />
          </div>
        </div>
        <div>
          <FieldLabel>Title</FieldLabel>
          <Input value={form.title} onChange={set('title')} placeholder="Head of Operations" />
        </div>
        {companyId ? null : (
          <div>
            <FieldLabel>Company</FieldLabel>
            <Select value={company} onValueChange={setCompany}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_COMPANY}>From their email, or none</SelectItem>
                {(companies.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div>
          <FieldLabel>Owner</FieldLabel>
          <MemberSelect value={ownerId} members={members.data?.members} onChange={setOwnerId} />
        </div>
      </form>
    </DialogFrame>
  );
}

function centsFromInput(value: string): number | null {
  const trimmed = value.replace(/,/g, '').trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) : null;
}

export function CreateDealDialog({
  open,
  onOpenChange,
  companyId,
  ownerId: presetOwner,
  currency: defaultCurrency = 'USD',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId?: string;
  ownerId?: string | null;
  currency?: string;
}) {
  const members = useCrmMembers();
  const companies = useCompanyOptions();
  const openRecord = useOpenRecord();
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [stage, setStage] = useState<DealStage>('DEMO_BOOKED');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [closeDate, setCloseDate] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setCompany(companyId ?? '');
      setOwnerId(presetOwner ?? members.data?.me.id ?? null);
      setStage('DEMO_BOOKED');
      setAmount('');
      setCurrency(defaultCurrency);
      setCloseDate('');
    }
  }, [open, companyId, presetOwner, defaultCurrency, members.data?.me.id]);

  const create = useCrmMutation<Record<string, unknown>, { id: string; name: string }>(
    (call, input) => call('/deals', 'POST', input),
    {
      success: (deal) => `${deal.name} opened.`,
      onSuccess: (deal) => {
        onOpenChange(false);
        openRecord({ kind: 'deal', id: deal.id });
      },
    }
  );

  const amountCents = centsFromInput(amount);
  const canSubmit = name.trim() !== '' && company !== '' && Boolean(ownerId) && (amount.trim() === '' || amountCents !== null);

  return (
    <DialogFrame
      open={open}
      onOpenChange={onOpenChange}
      title="New deal"
      description="Something being sold to a company. It joins the pipeline and the forecast."
      formId="crm-create-deal"
      pending={create.isPending}
      submitLabel="Create deal"
      canSubmit={canSubmit}
    >
      <form
        id="crm-create-deal"
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          create.mutate({
            name,
            companyId: company,
            ownerId,
            stage,
            amountCents,
            currency,
            expectedCloseDate: closeDate ? new Date(`${closeDate}T12:00:00`).toISOString() : null,
          });
        }}
      >
        <div>
          <FieldLabel>Deal name</FieldLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Annual plan, 50 seats" autoFocus />
        </div>
        {companyId ? null : (
          <div>
            <FieldLabel>Company</FieldLabel>
            <Select value={company || undefined} onValueChange={setCompany}>
              <SelectTrigger className="h-9">
                <SelectValue placeholder={companies.data?.length ? 'Choose a company' : 'Create a company first'} />
              </SelectTrigger>
              <SelectContent>
                {(companies.data ?? []).map((option) => (
                  <SelectItem key={option.id} value={option.id}>
                    {option.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="grid grid-cols-[1fr_110px] gap-3">
          <div>
            <FieldLabel>Amount</FieldLabel>
            <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="12000" />
          </div>
          <div>
            <FieldLabel>Currency</FieldLabel>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from(new Set([defaultCurrency, ...CURRENCIES])).map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <FieldLabel>Stage</FieldLabel>
            <Select value={stage} onValueChange={(value) => setStage(value as DealStage)}>
              <SelectTrigger className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DEAL_STAGE_OPTIONS.filter((option) => OPEN_DEAL_STAGES.indexOf(option.value) !== -1 || option.value === 'CLOSED_WON').map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <StageBadge stage={option.value} />
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <FieldLabel>Expected close</FieldLabel>
            <Input type="date" value={closeDate} onChange={(e) => setCloseDate(e.target.value)} />
          </div>
        </div>
        <div>
          <FieldLabel>Owner</FieldLabel>
          <MemberSelect value={ownerId} members={members.data?.members} allowUnassigned={false} onChange={setOwnerId} />
        </div>
      </form>
    </DialogFrame>
  );
}

export { centsFromInput };
