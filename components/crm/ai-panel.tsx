import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Check, ExternalLink, MessageSquarePlus, RefreshCw, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { RecordKind } from '@/lib/crm/constants';
import { toQuery, useCrmMutation, useCrmQuery } from './api';
import { useOpenRecord } from './navigation';
import { RelativeTime, Section, Spinner } from './primitives';

type AiStatus = { available: boolean; model: string };

type Brief = {
  summary: string;
  sections: Record<string, unknown>;
  sources: { url: string; title: string }[];
  refreshedAt: string;
} | null;

type Suggestion = {
  id: string;
  field: string;
  label: string;
  value: string;
  sourceUrl: string | null;
  evidence: string | null;
  basis: string;
  status: 'PROPOSED' | 'APPLIED' | 'DISMISSED';
  createdAt: string;
  decidedAt: string | null;
  decidedBy: { name: string } | null;
};

type ChatAction = { kind: RecordKind | 'task'; id: string; label: string };
type ChatEntry = { role: 'user' | 'assistant'; text: string; actions?: ChatAction[]; at: string };
type Conversation = { id: string; title: string | null; entries: ChatEntry[]; updatedAt: string } | null;

export function useAiStatus() {
  return useCrmQuery<AiStatus>(['ai-status'], '/ai/status');
}

export function AiNotConfigured() {
  return (
    <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground dark:border-[#2a2a2a]">
      <p className="flex items-center gap-1.5 font-medium text-foreground">
        <Sparkles className="size-4" /> AI is not set up yet
      </p>
      <p className="mt-1">
        Add a valid <code>ANTHROPIC_API_KEY</code> to the server environment and restart the app to turn on research, briefs and the assistant. Everything else in the CRM works without it.
      </p>
    </div>
  );
}

const SECTION_TITLES: Record<string, string> = {
  what_they_do: 'What they do',
  customers: 'Customers',
  signals: 'Recent signals',
  talking_points: 'Talking points',
  risks: 'Risks',
  background: 'Background',
  next_steps: 'Next steps',
  questions_to_ask: 'Questions to ask',
};

const HEALTH: Record<string, { label: string; className: string }> = {
  on_track: { label: 'On track', className: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300' },
  at_risk: { label: 'At risk', className: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300' },
  stalled: { label: 'Stalled', className: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300' },
  closed: { label: 'Closed', className: 'bg-neutral-100 text-neutral-700 dark:bg-[#222] dark:text-neutral-300' },
};

function BriefSections({ sections }: { sections: Record<string, unknown> }) {
  return (
    <div className="space-y-3">
      {Object.keys(SECTION_TITLES).map((key) => {
        const value = sections[key];
        if (!value || (Array.isArray(value) && value.length === 0)) return null;
        return (
          <div key={key}>
            <div className="text-xs font-medium text-muted-foreground">{SECTION_TITLES[key]}</div>
            {Array.isArray(value) ? (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm">
                {(value as string[]).map((item, index) => <li key={index}>{item}</li>)}
              </ul>
            ) : (
              <p className="mt-0.5 text-sm">{String(value)}</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

const RESEARCH_COPY: Record<RecordKind, { action: string; running: string; empty: string }> = {
  company: {
    action: 'Research with AI',
    running: 'Reading their website and public sources. This usually takes one to three minutes.',
    empty: 'Run research to fill in missing details from their website, with a brief and talking points. Facts from their own site fill empty fields; everything else waits for your approval.',
  },
  contact: {
    action: 'Research with AI',
    running: 'Looking for public professional profiles that match this exact person. This can take a couple of minutes.',
    empty: 'Run research to find professional details. Nothing about a person is guessed: every finding waits for you to accept it.',
  },
  deal: {
    action: 'Review this deal',
    running: 'Reviewing the deal against its timeline.',
    empty: 'Get an AI review of where this deal stands, what could sink it, and the next steps, based on everything logged here.',
  },
};

export function ResearchCard({ kind, id, status, error }: { kind: RecordKind; id: string; status?: string; error?: string | null }) {
  const ai = useAiStatus();
  const brief = useCrmQuery<Brief>(['brief', kind, id], `/ai/research${toQuery({ kind, id })}`);
  const research = useCrmMutation<void, { applied?: string[]; proposed?: number; health?: string }>(
    (call) => call('/ai/research', 'POST', { kind, id }),
    {
      success: (result) =>
        kind === 'deal'
          ? 'Deal reviewed.'
          : `Research done: ${result.applied?.length ?? 0} filled, ${result.proposed ?? 0} to review.`,
    }
  );

  if (ai.data && !ai.data.available) return <AiNotConfigured />;

  const copy = RESEARCH_COPY[kind];
  const running = research.isPending || status === 'RUNNING';
  const sections = (brief.data?.sections ?? {}) as Record<string, unknown>;
  const health = typeof sections.health === 'string' ? HEALTH[sections.health] : null;

  return (
    <Section
      title={kind === 'deal' ? 'AI deal review' : 'AI brief'}
      action={
        <Button size="sm" variant="outline" disabled={running || !ai.data} onClick={() => research.mutate()}>
          {running ? <Spinner className="text-current" /> : brief.data ? <RefreshCw /> : <Sparkles />}
          {brief.data ? 'Refresh' : copy.action}
        </Button>
      }
    >
      <div className="space-y-3 rounded-lg border p-4 dark:border-[#262626]">
        {running ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Spinner /> {copy.running}
          </p>
        ) : null}
        {!running && status === 'FAILED' && error ? <p className="text-sm text-red-600">Last research failed: {error}</p> : null}

        {brief.data ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              {health ? <span className={cn('rounded px-1.5 py-0.5 text-xs font-medium', health.className)}>{health.label}</span> : null}
              <span className="text-xs text-muted-foreground">
                Updated <RelativeTime date={brief.data.refreshedAt} />
              </span>
            </div>
            <p className="text-sm">{brief.data.summary}</p>
            <BriefSections sections={sections} />
            {brief.data.sources.length > 0 ? (
              <div>
                <div className="text-xs font-medium text-muted-foreground">Sources</div>
                <ul className="mt-1 space-y-0.5">
                  {brief.data.sources.slice(0, 8).map((source) => (
                    <li key={source.url}>
                      <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                        <ExternalLink className="size-3" />
                        {source.title || source.url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </>
        ) : !running ? (
          <p className="text-sm text-muted-foreground">{copy.empty}</p>
        ) : null}
      </div>
    </Section>
  );
}

export function SuggestionsList({ kind, id }: { kind: 'company' | 'contact'; id: string }) {
  const suggestions = useCrmQuery<Suggestion[]>(['suggestions', kind, id], `/suggestions${toQuery(kind === 'company' ? { companyId: id } : { contactId: id })}`);
  const decide = useCrmMutation<{ id: string; decision: 'accept' | 'dismiss' }>(
    (call, input) => call(`/suggestions/${input.id}`, 'PATCH', { decision: input.decision })
  );

  const pending = (suggestions.data ?? []).filter((s) => s.status === 'PROPOSED');
  const settled = (suggestions.data ?? []).filter((s) => s.status !== 'PROPOSED').slice(0, 8);
  if (!suggestions.data || (pending.length === 0 && settled.length === 0)) return null;

  return (
    <Section title={`Suggestions${pending.length ? ` (${pending.length} to review)` : ''}`}>
      <ul className="space-y-2">
        {pending.map((s) => (
          <li key={s.id} className="rounded-lg border p-3 dark:border-[#262626]">
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="break-words text-sm font-medium">{s.value}</div>
                {s.evidence ? <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{s.evidence}&rdquo;</p> : null}
                {s.sourceUrl ? (
                  <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline dark:text-blue-400">
                    <ExternalLink className="size-3" />
                    {s.basis === 'official_site' ? 'Their website' : s.basis === 'profile_matches_name_and_company' ? 'Matching profile' : 'Third-party source'}
                  </a>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button size="sm" variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: 'accept' })}>
                  <Check />
                  Apply
                </Button>
                <Button size="sm" variant="ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: s.id, decision: 'dismiss' })} aria-label="Dismiss">
                  <X />
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
      {settled.length > 0 ? (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">History</summary>
          <ul className="mt-1 space-y-0.5">
            {settled.map((s) => (
              <li key={s.id}>
                {s.status === 'APPLIED' ? 'Applied' : 'Dismissed'} {s.label}: {s.value}
                {s.decidedBy ? ` by ${s.decidedBy.name}` : ''}
                {s.basis === 'official_site' && s.status === 'APPLIED' && !s.decidedBy ? ' (from their website)' : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </Section>
  );
}

const STARTERS: Record<RecordKind | 'team', string[]> = {
  company: ['Summarize this account and what we should do next', 'Who should we talk to here, and why?', 'Draft a follow-up email to the primary contact'],
  contact: ['What do we know about this person?', 'Draft a check-in email', 'Create a task to follow up next week'],
  deal: ['What could sink this deal?', 'What should happen before it can close?', 'Move this deal forward and log why'],
  team: ['Which deals need attention this week?', 'Summarize our pipeline', 'What is overdue across the team?'],
};

export function AssistantChat({ kind, id, className }: { kind?: RecordKind; id?: string; className?: string }) {
  const ai = useAiStatus();
  const openRecord = useOpenRecord();
  const key = ['ai-chat', kind ?? 'team', id ?? 'team'];
  const conversation = useCrmQuery<Conversation>(key, `/ai/chat${toQuery({ kind, id })}`);
  const [draft, setDraft] = useState('');
  const [pendingText, setPendingText] = useState<string | null>(null);
  const scroller = useRef<HTMLDivElement>(null);

  const send = useCrmMutation<string, NonNullable<Conversation>>(
    (call, message) => call('/ai/chat', 'POST', { kind, id, conversationId: conversation.data?.id ?? null, message }),
    { onSuccess: () => setPendingText(null) }
  );
  const reset = useCrmMutation<void>((call) => call('/ai/chat', 'PUT', { kind, id }));

  const entries: ChatEntry[] = [
    ...(conversation.data?.entries ?? []),
    ...(pendingText ? [{ role: 'user' as const, text: pendingText, at: new Date().toISOString() }] : []),
  ];

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
  }, [entries.length, send.isPending]);

  useEffect(() => {
    if (send.isError) setPendingText(null);
  }, [send.isError]);

  if (ai.data && !ai.data.available) return <AiNotConfigured />;

  const submit = (text: string) => {
    const message = text.trim();
    if (!message || send.isPending) return;
    setPendingText(message);
    setDraft('');
    send.mutate(message);
  };

  return (
    <div className={cn('flex min-h-[420px] flex-col rounded-lg border dark:border-[#262626]', className)}>
      <div className="flex items-center justify-between border-b px-3 py-2 dark:border-[#262626]">
        <span className="flex items-center gap-1.5 text-sm font-medium">
          <Sparkles className="size-4" /> CRM assistant
        </span>
        <Button size="sm" variant="ghost" disabled={reset.isPending || entries.length === 0} onClick={() => reset.mutate()}>
          <MessageSquarePlus />
          New chat
        </Button>
      </div>

      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto p-3">
        {conversation.isPending ? (
          <div className="flex justify-center py-6"><Spinner /></div>
        ) : entries.length === 0 ? (
          <div className="space-y-2 py-4">
            <p className="text-sm text-muted-foreground">
              Ask about {kind ? `this ${kind}` : 'your pipeline'}, or ask it to do things: create tasks, log notes, move deals, assign teammates.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {STARTERS[kind ?? 'team'].map((starter) => (
                <button key={starter} type="button" onClick={() => submit(starter)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-accent dark:border-[#333]">
                  {starter}
                </button>
              ))}
            </div>
          </div>
        ) : (
          entries.map((entry, index) => (
            <div key={index} className={cn('flex', entry.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                  entry.role === 'user' ? 'bg-neutral-900 text-white dark:bg-white dark:text-black' : 'bg-neutral-100 dark:bg-[#1a1a1a]'
                )}
              >
                {entry.text}
                {entry.actions?.length ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {entry.actions.map((action, i) => (
                      <button
                        key={i}
                        type="button"
                        disabled={action.kind === 'task'}
                        onClick={() => action.kind !== 'task' && openRecord({ kind: action.kind, id: action.id })}
                        className="flex items-center gap-1 rounded-full border bg-white px-2 py-0.5 text-[11px] text-foreground dark:border-[#333] dark:bg-[#111]"
                      >
                        <Check className="size-3 text-green-600" />
                        {action.label}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
        {send.isPending ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Spinner className="size-3" /> Thinking…
          </div>
        ) : null}
      </div>

      <form
        className="flex items-end gap-2 border-t p-2 dark:border-[#262626]"
        onSubmit={(event) => {
          event.preventDefault();
          submit(draft);
        }}
      >
        <Textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              submit(draft);
            }
          }}
          rows={1}
          placeholder={kind ? `Ask about this ${kind}…` : 'Ask about your pipeline…'}
          className="max-h-32 min-h-[38px] resize-none text-sm"
        />
        <Button type="submit" size="icon" disabled={!draft.trim() || send.isPending || !ai.data} aria-label="Send">
          <ArrowUp />
        </Button>
      </form>
    </div>
  );
}
