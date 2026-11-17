'use client';

// One gated list of app navigation items, shared by every sidebar style.
// Hides modules switched off for the workspace (plan / override / platform
// switch) and items the member's team role can't use, then applies the user's
// own order / hidden / pinned preferences.
import { useMemo } from 'react';
import {
  Bot, Building2, Calendar, CalendarCheck2, Disc, FileText, Handshake, HardDrive, LayoutDashboard, ListTodo,
  Mail, MessageCircleMore, NotebookPen, PenTool, Settings, ShieldCheck, SquareKanban, Timer, Users, UsersRound, Video,
} from 'lucide-react';
import usePlatformAccess from 'hooks/usePlatformAccess';
import { useTeamSlug } from 'hooks/useTeamSlug';
import { usePreferences } from 'hooks/usePreferences';
import type { ModuleKey } from '@/lib/platform/modules';

export type SidebarVariant = 'default' | 'clickup' | 'rail';
export interface SidebarPrefs { variant?: SidebarVariant; order?: string[]; hidden?: string[]; pinned?: string[]; collapsed?: boolean }

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: ModuleKey;
  roles?: string[];
  /** key for /api/nav/preview (hover previews) */
  preview?: string;
  group: 'home' | 'work' | 'collab' | 'admin';
  external?: boolean;
}

export function buildNavItems(slug?: string): NavItem[] {
  return [
    { key: 'dashboard', label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, preview: 'dashboard', group: 'home' },
    { key: 'calendar', label: 'Calendar', href: '/calendar/page', icon: Calendar, module: 'calendar', preview: 'calendar', group: 'home' },
    { key: 'mail', label: 'Mail', href: '/mail', icon: Mail, module: 'mail', group: 'home' },
    { key: 'scrumboard', label: 'Scrumboard', href: '/scrumboard', icon: SquareKanban, module: 'scrumboard', preview: 'scrumboard', group: 'work' },
    { key: 'docs', label: 'Docs', href: slug ? `/team/${slug}/docs` : '/docs', icon: FileText, module: 'docs', preview: 'docs', group: 'work' },
    { key: 'notes', label: 'Notes', href: '/notes', icon: NotebookPen, module: 'notes', preview: 'notes', group: 'work' },
    { key: 'crm', label: 'CRM', href: '/crm', icon: Handshake, module: 'crm', preview: 'crm', group: 'work' },
    { key: 'timesheet', label: 'Timesheet', href: '/time-tracking', icon: Timer, module: 'timesheet', preview: 'timesheet', group: 'work' },
    { key: 'workload', label: 'Workload', href: slug ? `/teams/${slug}/workload` : '/workload', icon: Users, module: 'workload', roles: ['ADMIN', 'OWNER', 'MANAGER'], preview: 'workload', group: 'work' },
    { key: 'drive', label: 'Drive', href: '/drive/page', icon: HardDrive, module: 'drive', preview: 'drive', group: 'work' },
    { key: 'meetings', label: 'Meetings', href: '/meetings/page', icon: Video, module: 'meetings', preview: 'meetings', group: 'collab' },
    { key: 'scheduled', label: 'Scheduled', href: '/scheduled/page', icon: ListTodo, module: 'meetings', preview: 'scheduled', group: 'collab' },
    { key: 'events', label: 'Events', href: '/events/page', icon: CalendarCheck2, module: 'events', preview: 'events', group: 'collab' },
    { key: 'chat', label: 'Chat', href: slug ? `/team/${slug}/chat` : '/chat', icon: MessageCircleMore, module: 'chat', preview: 'chat', group: 'collab' },
    { key: 'clips', label: 'Clips', href: '/clips', icon: Disc, module: 'clips', preview: 'clips', group: 'collab' },
    ...(slug ? [{ key: 'whiteboard', label: 'Whiteboard', href: `/team/${slug}/whiteboard`, icon: PenTool, module: 'whiteboard' as ModuleKey, preview: 'whiteboard', group: 'collab' as const }] : []),
    { key: 'members', label: 'Members', href: slug ? `/members/${slug}` : '/members', icon: UsersRound, preview: 'members', group: 'admin' },
    { key: 'ai', label: 'AI', href: 'https://ai.collabium.in', icon: Bot, module: 'ai', group: 'admin', external: true },
    { key: 'workspace', label: 'Workspace', href: '/workspace', icon: Building2, group: 'admin' },
    { key: 'settings', label: 'Settings', href: '/settings/page', icon: Settings, group: 'admin' },
  ];
}

export function useSidebarPrefs() {
  const { prefs, update } = usePreferences();
  const s = (prefs.sidebar && typeof prefs.sidebar === 'object' ? prefs.sidebar : {}) as SidebarPrefs;
  const variant: SidebarVariant = s.variant === 'clickup' || s.variant === 'rail' ? s.variant : 'default';
  return {
    sidebar: { ...s, variant, order: s.order ?? [], hidden: s.hidden ?? [], pinned: s.pinned ?? [] },
    save: (patch: Partial<SidebarPrefs>) => update({ sidebar: { ...s, ...patch } }),
  };
}

/** Gated + user-ordered nav items. `all` ignores the user's hidden list (for the customize dialog). */
export function useNavItems() {
  const slug = useTeamSlug();
  const { access, isEnabled } = usePlatformAccess();
  const { sidebar } = useSidebarPrefs();

  return useMemo(() => {
    const role = access?.teamRole ?? null;
    const allowed = buildNavItems(slug).filter((i) => {
      if (i.roles && role && !i.roles.includes(role)) return false;
      return isEnabled(i.module ?? null);
    });
    if (access?.isPlatformAdmin) {
      allowed.push({ key: 'admin', label: 'Admin', href: '/admin', icon: ShieldCheck, group: 'admin' });
    }
    const rank = new Map(sidebar.order.map((k, i) => [k, i]));
    const ordered = [...allowed].sort((a, b) => (rank.get(a.key) ?? 1000 + allowed.indexOf(a)) - (rank.get(b.key) ?? 1000 + allowed.indexOf(b)));
    return {
      all: ordered,
      visible: ordered.filter((i) => !sidebar.hidden.includes(i.key)),
      pinned: sidebar.pinned.map((k) => ordered.find((i) => i.key === k)).filter(Boolean) as NavItem[],
    };
  }, [slug, access, isEnabled, sidebar.order, sidebar.hidden, sidebar.pinned]);
}
