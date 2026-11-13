import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Briefcase, Building2, LayoutDashboard, Search, Settings2, Sparkles, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import Mainsidebar from '@/components/ui/mainSideBar';
import { Header } from '@/components/doc-components/Header';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import useTeams from 'hooks/useTeams';
import { useTeamStore } from 'store/teamStore';
import { toQuery, useCrmApi, useCrmMembers, useCrmQuery, type SearchHit } from './api';
import { CompanySheet } from './company-sheet';
import { ContactSheet } from './contact-sheet';
import { DealSheet } from './deal-sheet';
import { useCurrentRecord, useOpenRecord } from './navigation';
import { CompanyMark, PersonAvatar, Spinner } from './primitives';
import { AssistantChat } from './ai-panel';

const NAV = [
  { href: '/crm', label: 'Overview', icon: LayoutDashboard },
  { href: '/crm/companies', label: 'Companies', icon: Building2 },
  { href: '/crm/contacts', label: 'Contacts', icon: Users },
  { href: '/crm/deals', label: 'Deals', icon: Briefcase },
  { href: '/crm/settings', label: 'Settings', icon: Settings2 },
];

// Notification links carry ?team=slug so they open in the right team even if another one is selected.
function useTeamFromLink() {
  const router = useRouter();
  const { teams } = useTeams();
  const { selectedTeam, setSelectedTeam } = useTeamStore();
  const wanted = typeof router.query.team === 'string' ? router.query.team : null;

  useEffect(() => {
    if (!wanted || !teams) return;
    const match = teams.find((team) => team.slug === wanted);
    if (match && match.slug !== selectedTeam?.slug) setSelectedTeam(match);
  }, [wanted, teams, selectedTeam?.slug, setSelectedTeam]);
}

export function CrmShell({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  const router = useRouter();
  const { ready } = useCrmApi();
  const members = useCrmMembers();
  const [askOpen, setAskOpen] = useState(false);
  useTeamFromLink();

  const denied = members.error && (members.error.status === 403 || members.error.status === 401);

  return (
    <div className="flex h-screen max-h-screen !overflow-y-hidden bg-[#F9F9F9] dark:bg-[#090909]">
      <Mainsidebar />
      <div className="flex w-full min-w-0 flex-col">
        <Header />
        <div className="border-b bg-white px-6 dark:border-[#222] dark:bg-[#111111]">
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold">{title}</h1>
              <p className="truncate text-xs text-muted-foreground">
                {members.data ? `${members.data.team.name} CRM` : 'Clients, contacts and deals for your team'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <QuickSearch />
              {ready && !denied ? (
                <Button size="sm" variant="outline" onClick={() => setAskOpen(true)}>
                  <Sparkles />
                  Ask AI
                </Button>
              ) : null}
              {actions}
            </div>
          </div>
          <nav className="-mb-px mt-3 flex gap-5 overflow-x-auto">
            {NAV.map((item) => {
              const active = item.href === '/crm' ? router.pathname === '/crm' : router.pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-1.5 whitespace-nowrap border-b-2 pb-2 text-sm',
                    active ? 'border-neutral-900 font-medium text-foreground dark:border-white' : 'border-transparent text-muted-foreground hover:text-foreground'
                  )}
                >
                  <Icon className="size-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>

        <main className="scrollbar-thin2 flex-1 overflow-y-auto px-6 py-5">
          {!ready ? (
            <Notice>Select a team from the sidebar to open its CRM.</Notice>
          ) : denied ? (
            <Notice>{members.error?.message ?? 'You do not have access to this CRM.'}</Notice>
          ) : members.isPending ? (
            <div className="flex justify-center py-16"><Spinner className="size-5" /></div>
          ) : (
            children
          )}
        </main>
      </div>
      {ready && !denied ? <RecordSheetHost /> : null}
      {ready && !denied ? (
        <Sheet open={askOpen} onOpenChange={setAskOpen}>
          <SheetContent side="right" className="flex w-full flex-col p-4 sm:max-w-xl">
            <SheetTitle>Ask your CRM</SheetTitle>
            <SheetDescription>Questions about the whole pipeline, or tell it what to do.</SheetDescription>
            {askOpen ? <AssistantChat className="min-h-0 flex-1" /> : null}
          </SheetContent>
        </Sheet>
      ) : null}
    </div>
  );
}

function Notice({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto mt-16 max-w-md rounded-lg border bg-white p-6 text-center text-sm text-muted-foreground dark:border-[#262626] dark:bg-[#111]">{children}</div>;
}

function RecordSheetHost() {
  const record = useCurrentRecord();
  const openRecord = useOpenRecord();

  return (
    <Sheet open={record !== null} onOpenChange={(open) => !open && openRecord(null)}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-4xl">
        <SheetTitle className="sr-only">Record</SheetTitle>
        <SheetDescription className="sr-only">Details of the selected CRM record</SheetDescription>
        {record?.kind === 'company' ? <CompanySheet key={record.id} companyId={record.id} /> : null}
        {record?.kind === 'contact' ? <ContactSheet key={record.id} contactId={record.id} /> : null}
        {record?.kind === 'deal' ? <DealSheet key={record.id} dealId={record.id} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function QuickSearch() {
  const openRecord = useOpenRecord();
  const [term, setTerm] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(term.trim()), 200);
    return () => clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (box.current && !box.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const results = useCrmQuery<{ hits: SearchHit[] }>(['search', debounced], debounced.length >= 2 ? `/search${toQuery({ q: debounced })}` : null);
  const hits = results.data?.hits ?? [];

  return (
    <div ref={box} className="relative">
      <div className="flex h-8 items-center gap-1.5 rounded-md border bg-transparent px-2 dark:border-[#262626]">
        <Search className="size-3.5 text-muted-foreground" />
        <input
          value={term}
          onChange={(event) => {
            setTerm(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false);
            if (event.key === 'Enter' && hits[0]) {
              openRecord({ kind: hits[0].kind, id: hits[0].id });
              setOpen(false);
            }
          }}
          placeholder="Search the CRM"
          className="w-44 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      {open && debounced.length >= 2 ? (
        <div className="absolute right-0 z-40 mt-1 w-80 overflow-hidden rounded-md border bg-popover shadow-lg dark:border-[#262626]">
          {results.isFetching && hits.length === 0 ? (
            <div className="flex justify-center p-3"><Spinner /></div>
          ) : hits.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No matches.</p>
          ) : (
            <ul className="max-h-80 overflow-y-auto py-1">
              {hits.map((hit) => (
                <li key={`${hit.kind}:${hit.id}`}>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-accent"
                    onClick={() => {
                      openRecord({ kind: hit.kind, id: hit.id });
                      setOpen(false);
                    }}
                  >
                    {hit.kind === 'contact' ? (
                      <PersonAvatar person={{ name: hit.label }} size="xs" />
                    ) : (
                      <CompanyMark name={hit.kind === 'deal' ? (hit.detail ?? hit.label) : hit.label} domain={hit.kind === 'company' ? hit.detail : null} size="sm" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{hit.label}</span>
                      {hit.detail ? <span className="block truncate text-xs text-muted-foreground">{hit.detail}</span> : null}
                    </span>
                    <span className="text-[10px] uppercase text-muted-foreground">{hit.kind}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
