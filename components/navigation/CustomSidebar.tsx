'use client';

// Alternative sidebar styles (the original sidebar stays the "Default"):
//   clickup — expanded sidebar: team switcher, search, Home / Favorites / Work /
//             Collaborate sections, collapsible; hover any item to preview its
//             live data without opening it.
//   rail    — slim icon + label rail with the same hover previews.
// Both share useNavItems() (module/role gated) and the user's order/hide/pin prefs.
import React, { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter } from 'next/router';
import useSWR from 'swr';
import * as HoverCard from '@radix-ui/react-hover-card';
import {
  ArrowDown, ArrowUp, ChevronDown, ChevronsLeft, ChevronsRight, Eye, EyeOff, Loader2, Palette, Search, Star, SlidersHorizontal,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import useTeams from 'hooks/useTeams';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useNavItems, useSidebarPrefs, type NavItem, type SidebarVariant } from './nav-items';

// ── Hover preview ────────────────────────────────────────────────────────────

interface PreviewItem { id: string; label: string; sub?: string; href?: string; badge?: string; color?: string }
interface Preview { title: string; items: PreviewItem[]; empty?: string; cta?: { label: string; href: string } }

function PreviewCard({ previewKey, item }: { previewKey: string; item: NavItem }) {
  const { data, isLoading } = useSWR<{ preview: Preview | null }>(`/api/nav/preview?key=${previewKey}`, (u: string) => fetch(u).then((r) => r.json()), {
    dedupingInterval: 15_000,
    revalidateOnFocus: false,
  });
  const p = data?.preview;
  const Icon = item.icon;
  return (
    <div className="w-72">
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <Icon className="size-4 text-primary" />
        <p className="flex-1 truncate text-sm font-semibold">{item.label}</p>
      </div>
      {isLoading && !p ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>
      ) : !p ? (
        <p className="p-3 text-xs text-muted-foreground">Open {item.label}</p>
      ) : (
        <>
          <p className="px-3 pt-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{p.title}</p>
          <div className="max-h-72 overflow-y-auto p-1.5">
            {p.items.length ? p.items.map((x) => {
              const inner = (
                <>
                  {x.color && <span className="size-1.5 shrink-0 rounded-full" style={{ background: x.color }} />}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{x.label}</span>
                    {x.sub && <span className="block truncate text-[11px] capitalize text-muted-foreground">{x.sub}</span>}
                  </span>
                  {x.badge && <span className="shrink-0 rounded bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">{x.badge}</span>}
                </>
              );
              return x.href ? (
                <Link key={x.id} href={x.href} className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent">{inner}</Link>
              ) : (
                <div key={x.id} className="flex items-center gap-2 rounded-md px-2 py-1.5">{inner}</div>
              );
            }) : <p className="px-2 py-3 text-xs text-muted-foreground">{p.empty ?? 'Nothing here yet'}</p>}
          </div>
          {p.cta && (
            <Link href={p.cta.href} className="block border-t px-3 py-2 text-xs font-medium text-primary hover:bg-accent">{p.cta.label} →</Link>
          )}
        </>
      )}
    </div>
  );
}

function WithPreview({ item, children }: { item: NavItem; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!item.preview) return <>{children}</>;
  return (
    <HoverCard.Root openDelay={250} closeDelay={120} open={open} onOpenChange={setOpen}>
      <HoverCard.Trigger asChild>{children}</HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content side="right" align="start" sideOffset={10}
          className="z-[200] overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-xl animate-in fade-in-0 zoom-in-95">
          {open && <PreviewCard previewKey={item.preview} item={item} />}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

const isActive = (pathname: string, asPath: string, href: string) => {
  const path = asPath.split('?')[0];
  if (href === '/dashboard') return path === '/dashboard';
  const base = href.replace(/\/page$/, '');
  return path === href || path.startsWith(base + '/') || path === base;
};

// ── Team switcher ────────────────────────────────────────────────────────────

function TeamSwitcher({ compact }: { compact?: boolean }) {
  const { teams, selectedTeam, setSelectedTeam } = useTeams();
  const [open, setOpen] = useState(false);
  const name = selectedTeam?.name ?? 'Select team';
  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)}
        className={cn('flex w-full items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-accent', compact && 'justify-center px-0')} title={name}>
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          {name.charAt(0).toUpperCase()}
        </span>
        {!compact && <><span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{name}</span><ChevronDown className="size-3.5 text-muted-foreground" /></>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-full z-50 mt-1 w-56 rounded-lg border bg-popover p-1 shadow-lg">
            {(teams ?? []).map((t: any) => (
              <button key={t.id} type="button" onClick={() => { setSelectedTeam(t); setOpen(false); }}
                className={cn('flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent', t.id === selectedTeam?.id && 'bg-accent')}>
                <span className="flex size-5 items-center justify-center rounded bg-muted text-[10px] font-bold">{t.name.charAt(0).toUpperCase()}</span>
                <span className="truncate">{t.name}</span>
              </button>
            ))}
            <Link href="/teams" className="mt-1 block rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent">Manage teams…</Link>
          </div>
        </>
      )}
    </div>
  );
}

// ── Customize dialog (variant, order, show/hide, favorites) ──────────────────

export function SidebarCustomizeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { sidebar, save } = useSidebarPrefs();
  const { all } = useNavItems();
  const move = (key: string, dir: -1 | 1) => {
    const keys = all.map((i) => i.key);
    const i = keys.indexOf(key);
    const j = i + dir;
    if (j < 0 || j >= keys.length) return;
    [keys[i], keys[j]] = [keys[j], keys[i]];
    save({ order: keys });
  };
  const toggle = (list: 'hidden' | 'pinned', key: string) => {
    const cur = sidebar[list] ?? [];
    save({ [list]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] });
  };
  const variants: [SidebarVariant, string, string][] = [
    ['default', 'Default', 'The original compact sidebar that expands on hover'],
    ['clickup', 'Expanded', 'Sections, favorites, team switcher and live hover previews'],
    ['rail', 'Rail', 'Slim icon + label rail with live hover previews'],
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Customize sidebar</DialogTitle>
          <DialogDescription>Pick a style, reorder items, hide what you don&apos;t use and star favorites.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-2">
          {variants.map(([k, label, desc]) => (
            <button key={k} type="button" onClick={() => save({ variant: k })}
              className={cn('rounded-lg border p-2 text-left', sidebar.variant === k ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent')}>
              <SidebarThumb variant={k} />
              <p className="mt-1.5 text-xs font-semibold">{label}</p>
              <p className="text-[10px] leading-tight text-muted-foreground">{desc}</p>
            </button>
          ))}
        </div>
        <div className="max-h-[45vh] space-y-0.5 overflow-y-auto rounded-lg border p-1">
          {all.map((item, idx) => {
            const Icon = item.icon;
            const hidden = sidebar.hidden.includes(item.key);
            const pinned = sidebar.pinned.includes(item.key);
            return (
              <div key={item.key} className={cn('flex items-center gap-2 rounded-md px-2 py-1 text-sm', hidden && 'opacity-50')}>
                <Icon className="size-4 text-muted-foreground" />
                <span className="flex-1">{item.label}</span>
                <button type="button" title={pinned ? 'Unfavorite' : 'Favorite'} onClick={() => toggle('pinned', item.key)} className="rounded p-1 hover:bg-accent">
                  <Star className={cn('size-3.5', pinned ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground')} />
                </button>
                <button type="button" title={hidden ? 'Show' : 'Hide'} disabled={item.key === 'settings'} onClick={() => toggle('hidden', item.key)} className="rounded p-1 hover:bg-accent disabled:opacity-30">
                  {hidden ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                </button>
                <button type="button" disabled={idx === 0} onClick={() => move(item.key, -1)} className="rounded p-1 hover:bg-accent disabled:opacity-30"><ArrowUp className="size-3.5" /></button>
                <button type="button" disabled={idx === all.length - 1} onClick={() => move(item.key, 1)} className="rounded p-1 hover:bg-accent disabled:opacity-30"><ArrowDown className="size-3.5" /></button>
              </div>
            );
          })}
        </div>
        <div className="flex items-center justify-between text-xs">
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => save({ order: [], hidden: [], pinned: [] })}>Reset order & visibility</button>
          <Link href="/settings/page" className="flex items-center gap-1 text-primary hover:underline"><Palette className="size-3.5" />Theme & appearance</Link>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function SidebarThumb({ variant }: { variant: SidebarVariant }) {
  return (
    <div className="flex h-14 overflow-hidden rounded-md border bg-muted/40">
      <div className={cn('flex flex-col gap-1 border-r bg-background p-1', variant === 'default' ? 'w-3' : variant === 'rail' ? 'w-5 items-center' : 'w-12')}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} className={cn('h-1.5 rounded-sm bg-muted-foreground/40', variant === 'clickup' ? 'w-full' : 'w-1.5')} />
        ))}
      </div>
      <div className="flex-1 p-1"><div className="h-full rounded-sm bg-background/70" /></div>
    </div>
  );
}

// ── Expanded (ClickUp-style) ─────────────────────────────────────────────────

function ExpandedSidebar() {
  const router = useRouter();
  const { visible, pinned } = useNavItems();
  const { sidebar, save } = useSidebarPrefs();
  const [customizing, setCustomizing] = useState(false);
  const [q, setQ] = useState('');
  const collapsed = !!sidebar.collapsed;
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ home: true, work: true, collab: true, admin: true });
  const filtered = q ? visible.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())) : visible;
  const groups: [string, string][] = [['home', 'Home'], ['work', 'Work'], ['collab', 'Collaborate'], ['admin', 'Workspace']];

  const Item = ({ item }: { item: NavItem }) => {
    const Icon = item.icon;
    const active = isActive(router.pathname, router.asPath, item.href);
    const pinnedNow = sidebar.pinned.includes(item.key);
    return (
      <WithPreview item={item}>
        <Link href={item.href} target={item.external ? '_blank' : undefined} title={collapsed ? item.label : undefined}
          className={cn('group/item flex h-8 items-center gap-2.5 rounded-md px-2 text-sm transition-colors',
            active ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            collapsed && 'justify-center px-0')}>
          <Icon className="size-[1.05rem] shrink-0" />
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <button type="button" title={pinnedNow ? 'Remove from favorites' : 'Add to favorites'}
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); save({ pinned: pinnedNow ? sidebar.pinned.filter((k) => k !== item.key) : [...sidebar.pinned, item.key] }); }}
                className="opacity-0 group-hover/item:opacity-100">
                <Star className={cn('size-3', pinnedNow ? 'fill-amber-400 text-amber-400 opacity-100' : 'text-muted-foreground')} />
              </button>
            </>
          )}
        </Link>
      </WithPreview>
    );
  };

  return (
    <aside className={cn('flex h-screen shrink-0 flex-col border-r bg-sidebar text-sidebar-foreground transition-[width] duration-200', collapsed ? 'w-[60px]' : 'w-60')}>
      <div className={cn('flex items-center gap-1 p-2', collapsed && 'flex-col')}>
        <Link href="/dashboard" className="shrink-0">
          <Image src="/logo-transparent.png" alt="Conferio" width={28} height={28} className="rounded-md bg-black p-1" />
        </Link>
        <div className={cn('min-w-0 flex-1', collapsed && 'w-full')}><TeamSwitcher compact={collapsed} /></div>
        <button type="button" onClick={() => save({ collapsed: !collapsed })} className="rounded p-1 text-muted-foreground hover:bg-accent" title={collapsed ? 'Expand' : 'Collapse'}>
          {collapsed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
        </button>
      </div>
      {!collapsed && (
        <div className="px-2 pb-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Jump to…"
              className="h-8 w-full rounded-md border bg-background/50 pl-7 pr-2 text-xs outline-none focus:border-primary" />
          </div>
        </div>
      )}
      <nav className="flex-1 space-y-3 overflow-y-auto px-2 pb-2 thin-scrollbar">
        {!q && pinned.length > 0 && (
          <div>
            {!collapsed && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Favorites</p>}
            <div className="space-y-0.5">{pinned.map((i) => <Item key={`p-${i.key}`} item={i} />)}</div>
          </div>
        )}
        {groups.map(([g, label]) => {
          const items = filtered.filter((i) => i.group === g);
          if (!items.length) return null;
          const isOpen = q ? true : openGroups[g];
          return (
            <div key={g}>
              {!collapsed && (
                <button type="button" onClick={() => setOpenGroups((s) => ({ ...s, [g]: !s[g] }))}
                  className="flex w-full items-center gap-1 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn('size-3 transition-transform', !isOpen && '-rotate-90')} />{label}
                </button>
              )}
              {isOpen && <div className="space-y-0.5">{items.map((i) => <Item key={i.key} item={i} />)}</div>}
            </div>
          );
        })}
      </nav>
      <div className="border-t p-2">
        <button type="button" onClick={() => setCustomizing(true)}
          className={cn('flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground', collapsed && 'justify-center px-0')}>
          <SlidersHorizontal className="size-4" />{!collapsed && 'Customize sidebar'}
        </button>
      </div>
      <SidebarCustomizeDialog open={customizing} onClose={() => setCustomizing(false)} />
    </aside>
  );
}

// ── Rail ─────────────────────────────────────────────────────────────────────

function RailSidebar() {
  const router = useRouter();
  const { visible, pinned } = useNavItems();
  const [customizing, setCustomizing] = useState(false);
  const items = [...pinned, ...visible.filter((v) => !pinned.some((p) => p.key === v.key))];
  return (
    <aside className="flex h-screen w-[72px] shrink-0 flex-col items-center border-r bg-sidebar py-2 text-sidebar-foreground">
      <Link href="/dashboard" className="mb-2">
        <Image src="/logo-transparent.png" alt="Conferio" width={30} height={30} className="rounded-md bg-black p-1" />
      </Link>
      <TeamSwitcher compact />
      <nav className="mt-2 flex w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto px-1.5 thin-scrollbar">
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(router.pathname, router.asPath, item.href);
          return (
            <WithPreview key={item.key} item={item}>
              <Link href={item.href} target={item.external ? '_blank' : undefined}
                className={cn('flex w-full flex-col items-center gap-0.5 rounded-lg py-1.5 text-[10px] transition-colors',
                  active ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-accent hover:text-foreground')}>
                <Icon className="size-[1.1rem]" />
                <span className="w-full truncate px-0.5 text-center leading-tight">{item.label}</span>
              </Link>
            </WithPreview>
          );
        })}
      </nav>
      <button type="button" onClick={() => setCustomizing(true)} title="Customize sidebar" className="mt-1 rounded-lg p-2 text-muted-foreground hover:bg-accent">
        <SlidersHorizontal className="size-4" />
      </button>
      <SidebarCustomizeDialog open={customizing} onClose={() => setCustomizing(false)} />
    </aside>
  );
}

export default function CustomSidebar({ variant }: { variant: Exclude<SidebarVariant, 'default'> }) {
  return variant === 'rail' ? <RailSidebar /> : <ExpandedSidebar />;
}

