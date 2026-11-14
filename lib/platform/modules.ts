// Platform module registry. Pure data + helpers so it can run in the edge middleware,
// in API routes and in the browser.
//
// A module is "on" for a workspace when:
//   1. the platform admin has not switched it off globally, and
//   2. the workspace override says on, or (no override and) the workspace's plan includes it.
// Platform admins bypass every check. Core areas (dashboard, settings, members, teams,
// workspace, admin) are never gated.

export const MODULE_KEYS = [
  'mail',
  'meetings',
  'chat',
  'scrumboard',
  'crm',
  'docs',
  'notes',
  'workload',
  'timesheet',
  'drive',
  'events',
  'calendar',
  'clips',
  'whiteboard',
  'calls',
  'ai',
] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export interface ModuleDef {
  key: ModuleKey;
  label: string;
  description: string;
  // Page path prefixes (":slug" matches one path segment holding a team slug).
  pages: string[];
  // API path prefixes used only by this module. Shared APIs are left out on purpose
  // so switching one module off never breaks another.
  apis: string[];
}

export const MODULES: ModuleDef[] = [
  {
    key: 'mail',
    label: 'Mail',
    description: 'Gmail-backed inbox, compose and threads',
    pages: ['/mail'],
    apis: ['/api/integrations/google/gmail'],
  },
  {
    key: 'meetings',
    label: 'Meetings & AI Notetaker',
    description: 'Meeting scheduling, recordings, transcripts and summaries',
    pages: ['/meetings', '/scheduled'],
    apis: [],
  },
  {
    key: 'chat',
    label: 'Chat',
    description: 'Channels, direct messages and team conversations',
    pages: ['/chat', '/conversations', '/team/:slug/chat', '/team/:slug/channels', '/team/:slug/conversations'],
    apis: [
      '/api/channels',
      '/api/messages',
      '/api/direct-messages',
      '/api/servers',
      '/api/chat',
      '/api/teams/:slug/conversations',
      '/api/teams/:slug/messages',
    ],
  },
  {
    key: 'scrumboard',
    label: 'Scrumboard & Tasks',
    description: 'Boards, columns, tasks and sprints',
    pages: ['/scrumboard', '/board', '/task'],
    apis: ['/api/boards', '/api/columns', '/api/subtasks', '/api/labels'],
  },
  {
    key: 'crm',
    label: 'CRM',
    description: 'Companies, contacts, deals and pipeline',
    pages: ['/crm'],
    apis: ['/api/teams/:slug/crm'],
  },
  {
    key: 'docs',
    label: 'Docs',
    description: 'Team documents and wiki pages',
    pages: ['/docs', '/team/:slug/docs'],
    apis: ['/api/docSearch'],
  },
  {
    key: 'notes',
    label: 'Notes',
    description: 'Personal notes',
    pages: ['/notes'],
    apis: ['/api/notes'],
  },
  {
    key: 'workload',
    label: 'Workload',
    description: 'Team capacity and workload view',
    pages: ['/teams/:slug/workload', '/workload'],
    apis: ['/api/teams/:slug/workload'],
  },
  {
    key: 'timesheet',
    label: 'Timesheet',
    description: 'Time tracking, timers and approvals',
    pages: ['/time-tracking'],
    apis: ['/api/time-tracking', '/api/time'],
  },
  {
    key: 'drive',
    label: 'Drive',
    description: 'File storage, folders and sharing',
    pages: ['/drive', '/files', '/team/:slug/drive'],
    apis: ['/api/drive', '/api/files'],
  },
  {
    key: 'events',
    label: 'Events & Booking',
    description: 'Event types and public booking pages',
    pages: ['/events'],
    apis: [],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    description: 'Unified calendar',
    pages: ['/calendar'],
    apis: [],
  },
  {
    key: 'clips',
    label: 'Clips',
    description: 'Screen recordings and video clips',
    pages: ['/clips'],
    apis: [],
  },
  {
    key: 'whiteboard',
    label: 'Whiteboard',
    description: 'Collaborative whiteboards',
    pages: ['/team/:slug/whiteboard'],
    apis: [],
  },
  {
    key: 'calls',
    label: 'Calls',
    description: 'Audio and video calls',
    pages: ['/calls'],
    apis: ['/api/calls'],
  },
  {
    key: 'ai',
    label: 'AI Assistant',
    description: 'AI agents, voice commands and email drafting',
    pages: [],
    apis: ['/api/ai', '/api/agents', '/api/voice'],
  },
];

export const MODULE_BY_KEY: Record<ModuleKey, ModuleDef> = Object.fromEntries(
  MODULES.map((m) => [m.key, m])
) as Record<ModuleKey, ModuleDef>;

export function isModuleKey(v: unknown): v is ModuleKey {
  return typeof v === 'string' && (MODULE_KEYS as readonly string[]).includes(v);
}

// Sidebar href → module, for hiding links.
export function moduleForHref(href: string): ModuleKey | null {
  return matchPath(href.split('?')[0], 'pages')?.module ?? null;
}

function prefixMatch(pattern: string, path: string): string | null | false {
  // Returns false when no match, otherwise the team slug captured by ":slug" (or null).
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (s.length < p.length) return false;
  let slug: string | null = null;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === ':slug') {
      slug = decodeURIComponent(s[i]);
      continue;
    }
    if (p[i] !== s[i]) return false;
  }
  return slug;
}

export function matchPath(
  pathname: string,
  kind: 'pages' | 'apis' | 'any' = 'any'
): { module: ModuleKey; slug: string | null; isApi: boolean } | null {
  const isApi = pathname.startsWith('/api/');
  if (kind === 'pages' && isApi) return null;
  if (kind === 'apis' && !isApi) return null;
  for (const m of MODULES) {
    for (const pattern of isApi ? m.apis : m.pages) {
      const r = prefixMatch(pattern, pathname);
      if (r !== false) return { module: m.key, slug: r, isApi };
    }
  }
  return null;
}

// Team slug carried by common team-scoped URLs, even outside module routes.
export function teamSlugFromPath(pathname: string): string | null {
  const m = pathname.match(/^\/(?:api\/)?(?:teams|team|members|conversations)\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

export type ModuleMap = Partial<Record<ModuleKey, boolean>>;

export interface EffectiveModuleInput {
  global: ModuleMap; // platform switches (missing = on)
  planModules: string[]; // modules included in the plan
  overrides: ModuleMap; // workspace overrides (missing = follow plan)
}

export function effectiveModules({ global, planModules, overrides }: EffectiveModuleInput): Record<ModuleKey, boolean> {
  const out = {} as Record<ModuleKey, boolean>;
  for (const key of MODULE_KEYS) {
    if (global[key] === false) {
      out[key] = false;
      continue;
    }
    const o = overrides[key];
    out[key] = typeof o === 'boolean' ? o : planModules.includes(key);
  }
  return out;
}

export const MODULE_COOKIE = 'conferio-team';
