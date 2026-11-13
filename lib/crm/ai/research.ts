import type Anthropic from '@anthropic-ai/sdk';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { contactName, dealStageLabel, formatMoney } from '../constants';
import { updateCompany } from '../companies';
import { updateContact } from '../contacts';
import { badRequest, conflict, notFound, type CrmContext } from '../http';
import { normalizeDomain } from '../values';
import { touch } from '../stamp';
import { CRM_AI_MODEL, anthropic, translateAiError } from './client';
import { recordSnapshot } from './context';

const RUNNING_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_ROUNDS = 12;

export const COMPANY_RESEARCH_FIELDS = ['description', 'industry', 'website', 'city', 'stateCode', 'country', 'phone', 'email', 'linkedinUrl', 'twitterUrl'] as const;
export const CONTACT_RESEARCH_FIELDS = ['title', 'phone', 'linkedinUrl', 'twitterUrl', 'githubUrl'] as const;

export const FIELD_LABELS: Record<string, string> = {
  description: 'Description',
  industry: 'Industry',
  website: 'Website',
  city: 'City',
  stateCode: 'State',
  country: 'Country',
  phone: 'Phone',
  email: 'Email',
  linkedinUrl: 'LinkedIn',
  twitterUrl: 'X / Twitter',
  githubUrl: 'GitHub',
  title: 'Title',
};

const stringList = { type: 'array', items: { type: 'string' } } as const;

function submitTool(fields: readonly string[], bases: string[], briefProperties: Record<string, unknown>, briefRequired: string[]): Anthropic.Tool {
  return {
    name: 'submit_findings',
    description: 'Submit your research once you are done. Call it exactly once, at the end.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        fields: {
          type: 'array',
          description: 'Only facts you saw stated on a page you read. Omit anything you could not confirm.',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', enum: [...fields] },
              value: { type: 'string' },
              source_url: { type: 'string', description: 'The page that states it.' },
              basis: { type: 'string', enum: bases },
              quote: { type: 'string', description: 'Short excerpt from the page that supports the value.' },
            },
            required: ['field', 'value', 'source_url', 'basis', 'quote'],
            additionalProperties: false,
          },
        },
        brief: { type: 'object', properties: briefProperties, required: briefRequired, additionalProperties: false },
        sources: {
          type: 'array',
          items: {
            type: 'object',
            properties: { url: { type: 'string' }, title: { type: 'string' } },
            required: ['url', 'title'],
            additionalProperties: false,
          },
        },
      },
      required: ['fields', 'brief', 'sources'],
      additionalProperties: false,
    },
  };
}

const COMPANY_BRIEF = {
  summary: { type: 'string', description: 'Two or three sentences a rep can read before a call.' },
  what_they_do: { type: 'string' },
  customers: { type: 'string', description: 'Who they sell to, if stated.' },
  signals: { ...stringList, description: 'Recent news, launches, hiring or funding with dates where known.' },
  talking_points: { ...stringList, description: 'Openers grounded in the findings and our CRM history.' },
  risks: stringList,
};

const CONTACT_BRIEF = {
  summary: { type: 'string', description: 'Who this person is professionally, only as far as sources confirm.' },
  background: { type: 'string' },
  talking_points: stringList,
  identity_confidence: { type: 'string', enum: ['confirmed', 'unclear', 'not_found'] },
};

const findingSchema = z.object({
  field: z.string(),
  value: z.string(),
  source_url: z.string(),
  basis: z.string(),
  quote: z.string(),
});

const companyFindings = z.object({
  fields: z.array(findingSchema),
  brief: z.object({
    summary: z.string(),
    what_they_do: z.string(),
    customers: z.string(),
    signals: z.array(z.string()),
    talking_points: z.array(z.string()),
    risks: z.array(z.string()),
  }),
  sources: z.array(z.object({ url: z.string(), title: z.string() })),
});

const contactFindings = z.object({
  fields: z.array(findingSchema),
  brief: z.object({
    summary: z.string(),
    background: z.string(),
    talking_points: z.array(z.string()),
    identity_confidence: z.enum(['confirmed', 'unclear', 'not_found']),
  }),
  sources: z.array(z.object({ url: z.string(), title: z.string() })),
});

const dealReview = z.object({
  summary: z.string(),
  health: z.enum(['on_track', 'at_risk', 'stalled', 'closed']),
  risks: z.array(z.string()),
  next_steps: z.array(z.string()),
  questions_to_ask: z.array(z.string()),
});

const DEAL_REVIEW_TOOL: Anthropic.Tool = {
  name: 'submit_review',
  description: 'Submit the deal review. Call it exactly once.',
  strict: true,
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'Where the deal stands, in two or three sentences.' },
      health: { type: 'string', enum: ['on_track', 'at_risk', 'stalled', 'closed'] },
      risks: stringList,
      next_steps: { ...stringList, description: 'Concrete actions, each with who should do it when the data says.' },
      questions_to_ask: stringList,
    },
    required: ['summary', 'health', 'risks', 'next_steps', 'questions_to_ask'],
    additionalProperties: false,
  },
};

// Runs a research turn that may use web search and fetch, until the model calls the submit tool.
async function runUntilSubmitted(params: {
  system: string;
  prompt: string;
  submit: Anthropic.Tool;
  web: boolean;
}): Promise<unknown> {
  const tools: Anthropic.ToolUnion[] = [
    ...(params.web
      ? ([
          { type: 'web_search_20260209', name: 'web_search', max_uses: 6 },
          { type: 'web_fetch_20260209', name: 'web_fetch', max_uses: 8 },
        ] as Anthropic.ToolUnion[])
      : []),
    params.submit,
  ];

  const messages: Anthropic.MessageParam[] = [{ role: 'user', content: params.prompt }];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const response = await anthropic()
      .messages.stream({
        model: CRM_AI_MODEL,
        max_tokens: 32000,
        thinking: { type: 'adaptive' },
        output_config: { effort: params.web ? 'high' : 'medium' },
        system: params.system,
        tools,
        messages,
      })
      .finalMessage();

    if (response.stop_reason === 'refusal') throw badRequest('The AI declined to research this record.');

    const submitted = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use' && block.name === params.submit.name
    );
    if (submitted) {
      if (response.stop_reason === 'max_tokens') throw badRequest('The research ran out of room before finishing. Try again.');
      return submitted.input;
    }

    messages.push({ role: 'assistant', content: response.content });

    if (response.stop_reason === 'pause_turn') continue;

    messages.push({
      role: 'user',
      content: `Call ${params.submit.name} now with what you have. Leave out anything you could not confirm.`,
    });
  }

  throw badRequest('The research did not finish. Try again.');
}

async function claim(where: { kind: 'company' | 'contact'; id: string }) {
  const stale = new Date(Date.now() - RUNNING_TIMEOUT_MS);
  const data = { enrichmentStatus: 'RUNNING' as const, enrichmentError: null };
  const filter = { id: where.id, OR: [{ enrichmentStatus: { not: 'RUNNING' as const } }, { updatedAt: { lt: stale } }] };
  const { count } =
    where.kind === 'company'
      ? await prisma.crmCompany.updateMany({ where: filter, data })
      : await prisma.crmContact.updateMany({ where: filter, data });
  if (count === 0) throw conflict('Research is already running on this record.');
}

async function finish(where: { kind: 'company' | 'contact'; id: string }, error: string | null) {
  const data = { enrichmentStatus: error ? ('FAILED' as const) : ('COMPLETE' as const), enrichmentError: error, enrichedAt: error ? undefined : new Date() };
  if (where.kind === 'company') await prisma.crmCompany.update({ where: { id: where.id }, data });
  else await prisma.crmContact.update({ where: { id: where.id }, data });
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

function same(a: string | null | undefined, b: string): boolean {
  return (a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
}

function cleanSources(sources: { url: string; title: string }[]) {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!hostOf(source.url) || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

async function logResearch(ctx: CrmContext, target: { companyId?: string; contactId?: string }, summary: string, meta: Record<string, unknown>) {
  const activity = await prisma.crmActivity.create({
    data: {
      teamId: ctx.teamId,
      type: 'ENRICHMENT',
      subject: 'AI research',
      body: summary,
      occurredAt: new Date(),
      companyId: target.companyId ?? null,
      contactId: target.contactId ?? null,
      createdById: ctx.userId,
      meta: meta as Prisma.InputJsonValue,
    },
    select: { createdAt: true },
  });
  await touch(target, activity.createdAt);
}

export async function researchCompany(ctx: CrmContext, companyId: string) {
  const company = await prisma.crmCompany.findFirst({
    where: { id: companyId, teamId: ctx.teamId },
    select: Object.fromEntries([['id', true], ['name', true], ['domain', true], ...COMPANY_RESEARCH_FIELDS.map((f) => [f, true])]) as Record<string, true>,
  });
  if (!company) throw notFound('That company does not exist in this team.');

  const record = company as unknown as Record<string, string | null> & { id: string; name: string; domain: string | null };
  await claim({ kind: 'company', id: companyId });

  try {
    const snapshot = await recordSnapshot(ctx, { kind: 'company', id: companyId });
    const target = record.domain ? `${record.name} (${record.domain})` : record.name;

    const raw = await runUntilSubmitted({
      web: true,
      submit: submitTool(COMPANY_RESEARCH_FIELDS, ['official_site', 'third_party'], COMPANY_BRIEF, Object.keys(COMPANY_BRIEF)),
      system:
        'You research companies for a sales team. You only report what a page you actually read states. A confidently wrong fact is worse than a blank field, so leave out anything you could not confirm. Mark basis official_site only when the page is on the company\'s own domain.',
      prompt: `Research the company ${target}. Start with its own website${record.domain ? ` (https://${record.domain})` : ''}, then a few reputable public sources for recent news.

Fill these CRM fields where a source states them: ${COMPANY_RESEARCH_FIELDS.join(', ')}. stateCode is the state or region. Use full https URLs for website and social links. Keep description to two sentences.

Then write the brief, using our CRM history below for the talking points.

Our CRM record:
${snapshot}

When you are done, call submit_findings once.`,
    });

    const findings = companyFindings.parse(raw);
    const domain = normalizeDomain(record.domain);
    const applied: Record<string, string> = {};
    const proposed: { field: string; value: string; sourceUrl: string; evidence: string; basis: string }[] = [];

    for (const finding of findings.fields) {
      if ((COMPANY_RESEARCH_FIELDS as readonly string[]).indexOf(finding.field) === -1) continue;
      const value = finding.value.trim();
      if (!value || same(record[finding.field], value)) continue;

      const host = hostOf(finding.source_url);
      const official = Boolean(domain && host && (host === domain || host.endsWith(`.${domain}`)));
      const blank = !record[finding.field];

      if (official && blank && !(finding.field in applied)) applied[finding.field] = value;
      else proposed.push({ field: finding.field, value, sourceUrl: finding.source_url, evidence: finding.quote, basis: official ? 'official_site' : finding.basis });
    }

    if (Object.keys(applied).length) await updateCompany(ctx, companyId, applied);

    await prisma.$transaction([
      prisma.crmSuggestion.deleteMany({ where: { companyId, status: 'PROPOSED' } }),
      prisma.crmSuggestion.createMany({
        data: [
          ...Object.keys(applied).map((field) => {
            const finding = findings.fields.find((f) => f.field === field)!;
            return { teamId: ctx.teamId, companyId, field, value: applied[field], sourceUrl: finding.source_url, evidence: finding.quote, basis: 'official_site', status: 'APPLIED' as const, decidedById: ctx.userId, decidedAt: new Date() };
          }),
          ...proposed.map((p) => ({ teamId: ctx.teamId, companyId, ...p })),
        ],
      }),
      prisma.crmBrief.upsert({
        where: { companyId },
        create: { teamId: ctx.teamId, companyId, summary: findings.brief.summary, sections: findings.brief as Prisma.InputJsonValue, sources: cleanSources(findings.sources) as Prisma.InputJsonValue },
        update: { summary: findings.brief.summary, sections: findings.brief as Prisma.InputJsonValue, sources: cleanSources(findings.sources) as Prisma.InputJsonValue, refreshedAt: new Date() },
      }),
    ]);

    await logResearch(
      ctx,
      { companyId },
      `Researched ${record.name}: filled ${Object.keys(applied).length} empty field(s) from their own site, suggested ${proposed.length} change(s) for review.`,
      { applied: Object.keys(applied), proposed: proposed.map((p) => p.field), sources: cleanSources(findings.sources).length }
    );
    await finish({ kind: 'company', id: companyId }, null);

    return { applied: Object.keys(applied), proposed: proposed.length };
  } catch (error) {
    await finish({ kind: 'company', id: companyId }, error instanceof Error ? error.message.slice(0, 300) : 'Research failed.');
    translateAiError(error);
  }
}

// Nothing about a person is guessed: every finding about a contact waits for a human to accept it.
export async function researchContact(ctx: CrmContext, contactId: string) {
  const contact = await prisma.crmContact.findFirst({
    where: { id: contactId, teamId: ctx.teamId },
    select: { id: true, firstName: true, lastName: true, email: true, title: true, phone: true, linkedinUrl: true, twitterUrl: true, githubUrl: true, company: { select: { name: true, domain: true } } },
  });
  if (!contact) throw notFound('That contact does not exist in this team.');
  if (!contact.company && !contact.email) {
    throw badRequest('Add their company or work email first, so the research can tell them apart from namesakes.');
  }

  await claim({ kind: 'contact', id: contactId });

  try {
    const snapshot = await recordSnapshot(ctx, { kind: 'contact', id: contactId });
    const who = `${contactName(contact)}${contact.company ? ` at ${contact.company.name}${contact.company.domain ? ` (${contact.company.domain})` : ''}` : ''}${contact.email ? `, email ${contact.email}` : ''}`;

    const raw = await runUntilSubmitted({
      web: true,
      submit: submitTool(CONTACT_RESEARCH_FIELDS, ['profile_matches_name_and_company', 'official_site', 'third_party'], CONTACT_BRIEF, Object.keys(CONTACT_BRIEF)),
      system:
        'You research business contacts for a sales team. Nothing about a person may be guessed. Only report a profile or detail when the page ties it to this exact person: the same name AND the same employer or email. People share names; when in doubt, leave it out and set identity_confidence to unclear. Never report personal home addresses, family details or anything not professional.',
      prompt: `Find professional information about ${who}.

Fields you may fill when a source clearly matches this person: ${CONTACT_RESEARCH_FIELDS.join(', ')}. Use full https URLs for profiles.

Our CRM record:
${snapshot}

When you are done, call submit_findings once.`,
    });

    const findings = contactFindings.parse(raw);
    const current = contact as unknown as Record<string, string | null>;
    const proposed = findings.fields
      .filter((f) => (CONTACT_RESEARCH_FIELDS as readonly string[]).indexOf(f.field) !== -1)
      .filter((f) => f.value.trim() && !same(current[f.field], f.value))
      .map((f) => ({ teamId: ctx.teamId, contactId, field: f.field, value: f.value.trim(), sourceUrl: f.source_url, evidence: f.quote, basis: f.basis }));

    await prisma.$transaction([
      prisma.crmSuggestion.deleteMany({ where: { contactId, status: 'PROPOSED' } }),
      prisma.crmSuggestion.createMany({ data: proposed }),
      prisma.crmBrief.upsert({
        where: { contactId },
        create: { teamId: ctx.teamId, contactId, summary: findings.brief.summary, sections: findings.brief as Prisma.InputJsonValue, sources: cleanSources(findings.sources) as Prisma.InputJsonValue },
        update: { summary: findings.brief.summary, sections: findings.brief as Prisma.InputJsonValue, sources: cleanSources(findings.sources) as Prisma.InputJsonValue, refreshedAt: new Date() },
      }),
    ]);

    await logResearch(
      ctx,
      { contactId },
      `Researched ${contactName(contact)}: ${proposed.length} suggestion(s) for review, identity ${findings.brief.identity_confidence.replace('_', ' ')}.`,
      { proposed: proposed.map((p) => p.field), identity: findings.brief.identity_confidence }
    );
    await finish({ kind: 'contact', id: contactId }, null);

    return { applied: [], proposed: proposed.length };
  } catch (error) {
    await finish({ kind: 'contact', id: contactId }, error instanceof Error ? error.message.slice(0, 300) : 'Research failed.');
    translateAiError(error);
  }
}

// A deal review reads only our own CRM data: where it stands, what could sink it, what to do next.
export async function reviewDeal(ctx: CrmContext, dealId: string) {
  const deal = await prisma.crmDeal.findFirst({
    where: { id: dealId, teamId: ctx.teamId },
    select: { id: true, name: true, stage: true, amount: true, currency: true },
  });
  if (!deal) throw notFound('That deal does not exist in this team.');

  try {
    const snapshot = await recordSnapshot(ctx, { kind: 'deal', id: dealId });
    const raw = await runUntilSubmitted({
      web: false,
      submit: DEAL_REVIEW_TOOL,
      system:
        'You are a sales manager reviewing one deal with the rep. Be specific and grounded in the record: cite dates, stages and missing pieces you can see. Do not invent conversations that are not in the timeline.',
      prompt: `Today is ${new Date().toISOString().slice(0, 10)}. Review this deal (${deal.name}, ${dealStageLabel(deal.stage)}, ${formatMoney(deal.amount ? Math.round(Number(deal.amount) * 100) : null, deal.currency)}).

${snapshot}

Call submit_review once with your review.`,
    });

    const review = dealReview.parse(raw);
    await prisma.crmBrief.upsert({
      where: { dealId },
      create: { teamId: ctx.teamId, dealId, summary: review.summary, sections: review as Prisma.InputJsonValue },
      update: { summary: review.summary, sections: review as Prisma.InputJsonValue, refreshedAt: new Date() },
    });

    return { health: review.health };
  } catch (error) {
    translateAiError(error);
  }
}

// Suggestions

export async function listSuggestions(ctx: CrmContext, where: { companyId?: string; contactId?: string }) {
  const rows = await prisma.crmSuggestion.findMany({
    where: { teamId: ctx.teamId, ...where },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    take: 50,
    select: { id: true, field: true, value: true, sourceUrl: true, evidence: true, basis: true, status: true, createdAt: true, decidedAt: true, decidedBy: { select: { name: true } } },
  });
  return rows.map((row) => ({
    ...row,
    label: FIELD_LABELS[row.field] ?? row.field,
    createdAt: row.createdAt.toISOString(),
    decidedAt: row.decidedAt?.toISOString() ?? null,
  }));
}

export async function decideSuggestion(ctx: CrmContext, id: string, decision: 'accept' | 'dismiss') {
  const suggestion = await prisma.crmSuggestion.findFirst({
    where: { id, teamId: ctx.teamId },
    select: { id: true, field: true, value: true, status: true, companyId: true, contactId: true },
  });
  if (!suggestion) throw notFound('That suggestion no longer exists.');
  if (suggestion.status !== 'PROPOSED') throw conflict('That suggestion has already been settled.');

  if (decision === 'accept') {
    const data = { [suggestion.field]: suggestion.value };
    if (suggestion.companyId) await updateCompany(ctx, suggestion.companyId, data);
    else if (suggestion.contactId) await updateContact(ctx, suggestion.contactId, data);
  }

  await prisma.crmSuggestion.update({
    where: { id },
    data: { status: decision === 'accept' ? 'APPLIED' : 'DISMISSED', decidedById: ctx.userId, decidedAt: new Date() },
  });

  return { id, status: decision === 'accept' ? 'APPLIED' : 'DISMISSED' };
}

export async function getBrief(ctx: CrmContext, where: { companyId?: string; contactId?: string; dealId?: string }) {
  const brief = await prisma.crmBrief.findFirst({
    where: { teamId: ctx.teamId, ...where },
    select: { summary: true, sections: true, sources: true, refreshedAt: true },
  });
  return brief ? { ...brief, refreshedAt: brief.refreshedAt.toISOString() } : null;
}
