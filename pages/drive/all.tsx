// /drive/all – one place for every image, video, file shared or uploaded in a team
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import {
  ArrowUpRight,
  CheckSquare,
  Download,
  ExternalLink,
  File as FileIcon,
  FileText,
  Film,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  List,
  Lock,
  MessageCircleMore,
  Music,
  NotebookPen,
  Search,
  SquareKanban,
  UserCheck,
} from 'lucide-react';

import { AppSidebar } from '@/components/file-manager/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/file-manager/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import ThinSidebar from '@/components/ui/thinSidebar';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { MediaItem, MediaSource, MediaUser } from '@/lib/drive/central-media';

interface Team {
  id: string;
  name: string;
  slug: string;
}

interface MediaResponse {
  items: MediaItem[];
  counts: Record<string, number>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const SOURCE_TABS = [
  { key: 'all', label: 'Everything', icon: HardDrive },
  { key: 'drive', label: 'Drive', icon: HardDrive },
  { key: 'chat', label: 'Chat', icon: MessageCircleMore },
  { key: 'tasks', label: 'Tasks', icon: SquareKanban },
  { key: 'docs', label: 'Docs', icon: FileText },
  { key: 'notes', label: 'Notes', icon: NotebookPen },
] as const;

const SOURCE_META: Record<MediaSource, { label: string; icon: any; className: string }> = {
  DRIVE: { label: 'Drive', icon: HardDrive, className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  CHANNEL: { label: 'Channel', icon: MessageCircleMore, className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  THREAD: { label: 'Thread', icon: MessageCircleMore, className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  DM: { label: 'Direct message', icon: MessageCircleMore, className: 'bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400' },
  TASK: { label: 'Task', icon: SquareKanban, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  TASK_COMMENT: { label: 'Task comment', icon: SquareKanban, className: 'bg-amber-500/10 text-amber-700 dark:text-amber-400' },
  DOC: { label: 'Doc', icon: FileText, className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' },
  NOTE: { label: 'Note', icon: NotebookPen, className: 'bg-rose-500/10 text-rose-600 dark:text-rose-400' },
};

const KIND_ICON = { image: ImageIcon, video: Film, audio: Music, document: FileText, other: FileIcon };

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

function displayName(u: MediaUser | null) {
  return u?.name || u?.email || 'Unknown';
}

function initials(u: MediaUser | null) {
  return displayName(u)
    .split(/\s+/)
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function UserChip({ user, size = 'sm' }: { user: MediaUser | null; size?: 'sm' | 'md' }) {
  const dim = size === 'sm' ? 'h-5 w-5' : 'h-7 w-7';
  return (
    <span className="inline-flex items-center gap-1.5 min-w-0">
      <Avatar className={dim}>
        {user?.image && <AvatarImage src={user.image} alt="" />}
        <AvatarFallback className="text-[9px]">{initials(user)}</AvatarFallback>
      </Avatar>
      <span className="truncate">{displayName(user)}</span>
    </span>
  );
}

function SourceBadge({ source }: { source: MediaSource }) {
  const m = SOURCE_META[source];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium ${m.className}`}>
      <Icon className="h-3 w-3" />
      {m.label}
    </span>
  );
}

function Thumb({ item, className = '' }: { item: MediaItem; className?: string }) {
  const [failed, setFailed] = useState(false);
  const Icon = item.url ? KIND_ICON[item.kind] : Lock;
  if (item.url && !failed && item.kind === 'image') {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={item.url} alt="" loading="lazy" onError={() => setFailed(true)} className={`object-cover ${className}`} />;
  }
  if (item.url && !failed && item.kind === 'video') {
    return <video src={`${item.url}#t=0.5`} preload="metadata" muted onError={() => setFailed(true)} className={`object-cover ${className}`} />;
  }
  return (
    <div className={`flex items-center justify-center bg-neutral-200/60 dark:bg-neutral-800/60 ${className}`}>
      <Icon className="h-8 w-8 text-neutral-400" />
    </div>
  );
}

function AssignmentLine({ item }: { item: MediaItem }) {
  if (!item.assignments.length) return null;
  const first = item.assignments[0];
  const more = item.assignments.length - 1;
  return (
    <div className="flex items-center gap-1 text-[11px] text-muted-foreground min-w-0">
      <UserCheck className="h-3 w-3 shrink-0 text-emerald-600" />
      <span className="truncate">
        {displayName(first.assignee)}
        {more > 0 && ` +${more}`}
        {first.assigner && <> · by {displayName(first.assigner)}</>}
      </span>
    </div>
  );
}

function PreviewDialog({ item, onClose }: { item: MediaItem | null; onClose: () => void }) {
  if (!item) return null;
  const size = formatSize(item.size);
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[calc(100vw-32px)] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="pr-6 break-all text-base">{item.name}</DialogTitle>
        </DialogHeader>

        <div className="rounded-xl overflow-hidden bg-neutral-100 dark:bg-neutral-900 flex items-center justify-center min-h-[200px]">
          {!item.url ? (
            <div className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
              <Lock className="h-8 w-8" />
              Password protected. Open it from Drive to unlock.
            </div>
          ) : item.kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.url} alt={item.name} className="max-h-[55vh] w-auto object-contain" />
          ) : item.kind === 'video' ? (
            <video src={item.url} controls className="max-h-[55vh] w-full" />
          ) : item.kind === 'audio' ? (
            <audio src={item.url} controls className="w-full m-6" />
          ) : item.mimeType === 'application/pdf' ? (
            <iframe src={item.url} title={item.name} className="w-full h-[55vh]" />
          ) : (
            <div className="flex flex-col items-center gap-2 p-10 text-sm text-muted-foreground">
              <FileIcon className="h-10 w-10" />
              No preview for this file type
            </div>
          )}
        </div>

        <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-2.5 text-sm">
          <dt className="text-muted-foreground">Source</dt>
          <dd><SourceBadge source={item.source} /></dd>

          <dt className="text-muted-foreground">Where</dt>
          <dd className="min-w-0">
            {item.location.href ? (
              <Link href={item.location.href} className="inline-flex items-center gap-1 font-medium hover:underline break-all">
                {item.location.label}
                <ArrowUpRight className="h-3.5 w-3.5 shrink-0" />
              </Link>
            ) : (
              <span className="font-medium">{item.location.label}</span>
            )}
            {item.location.detail && <div className="text-xs text-muted-foreground">{item.location.detail}</div>}
          </dd>

          <dt className="text-muted-foreground">
            {item.source === 'DRIVE' || item.source.startsWith('TASK') ? 'Uploaded by' : 'Shared by'}
          </dt>
          <dd><UserChip user={item.uploadedBy} size="md" /></dd>

          <dt className="text-muted-foreground">When</dt>
          <dd>
            {format(new Date(item.createdAt), 'PPp')}
            {(item.source === 'DOC' || (item.source === 'NOTE' && item.id.startsWith('note:'))) && (
              <span className="text-xs text-muted-foreground"> (last edited)</span>
            )}
          </dd>

          {size && (
            <>
              <dt className="text-muted-foreground">Size</dt>
              <dd>{size}</dd>
            </>
          )}

          {item.assignments.length > 0 && (
            <>
              <dt className="text-muted-foreground">Assigned</dt>
              <dd className="space-y-1.5">
                {item.assignments.map((a, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <UserChip user={a.assignee} />
                    {a.assigner && (
                      <span className="text-muted-foreground inline-flex items-center gap-1">
                        by <UserChip user={a.assigner} />
                      </span>
                    )}
                    {a.assignedAt && (
                      <span className="text-xs text-muted-foreground">
                        · {formatDistanceToNow(new Date(a.assignedAt), { addSuffix: true })}
                      </span>
                    )}
                  </div>
                ))}
              </dd>
            </>
          )}

          {item.alsoIn.length > 0 && (
            <>
              <dt className="text-muted-foreground">Also in</dt>
              <dd className="flex flex-wrap gap-1.5">
                {item.alsoIn.map((l, i) => (
                  <Link key={i} href={l.href || '#'} className="text-xs rounded-md border px-2 py-0.5 hover:bg-muted">
                    {l.type}: {l.label}
                  </Link>
                ))}
              </dd>
            </>
          )}
        </dl>

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          {item.location.href && (
            <Button variant="outline" size="sm" asChild>
              <Link href={item.location.href}>
                <ExternalLink className="h-4 w-4 mr-1.5" /> Go to {SOURCE_META[item.source].label.toLowerCase()}
              </Link>
            </Button>
          )}
          {item.url && (
            <Button size="sm" asChild>
              <a href={item.url} target="_blank" rel="noopener noreferrer" download={item.name}>
                <Download className="h-4 w-4 mr-1.5" /> Open / download
              </a>
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CentralDrive() {
  const router = useRouter();
  const q = router.query;
  const source = (typeof q.source === 'string' && q.source) || 'all';
  const type = (typeof q.type === 'string' && q.type) || 'all';
  const assigned = (typeof q.assigned === 'string' && q.assigned) || 'all';

  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [page, setPage] = useState(1);
  const [preview, setPreview] = useState<MediaItem | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    try {
      const v = localStorage.getItem('drive-all-view');
      if (v === 'grid' || v === 'list') setView(v);
    } catch {}
  }, []);

  const setQuery = (patch: Record<string, string>) => {
    const next: Record<string, any> = { ...router.query, ...patch };
    Object.keys(next).forEach((k) => (next[k] === 'all' || next[k] === '') && delete next[k]);
    setPage(1);
    router.replace({ pathname: router.pathname, query: next }, undefined, { shallow: true });
  };

  const { data: teamsData } = useQuery({
    queryKey: ['my-teams'],
    queryFn: async () => {
      const res = await fetch('/api/teams/my-teams');
      if (!res.ok) throw new Error('Failed to fetch teams');
      return res.json();
    },
  });
  const teams: Team[] = teamsData?.teams || [];
  const team = useMemo(() => {
    const t = typeof q.team === 'string' ? q.team : undefined;
    return teams.find((x) => x.slug === t || x.id === t) || teams[0];
  }, [teams, q.team]);

  useEffect(() => setPage(1), [debounced]);

  const { data, isLoading, isError, isFetching } = useQuery<MediaResponse>({
    queryKey: ['drive-central-media', team?.id, source, type, assigned, debounced, page],
    enabled: !!team?.id && router.isReady,
    queryFn: async () => {
      const params = new URLSearchParams({
        teamId: team!.id,
        source,
        type,
        page: String(page),
        pageSize: '60',
        ...(assigned !== 'all' && { assigned }),
        ...(debounced && { keyword: debounced }),
      });
      const res = await fetch(`/api/drive/media?${params}`);
      if (!res.ok) throw new Error('Failed to load media');
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  const items = data?.items || [];
  const counts = data?.counts || {};

  return (
    <div className="flex flex-col h-full">
      {/* header */}
      <div className="px-4 sm:px-6 pt-4 pb-3 space-y-3 border-b dark:border-[#27272A]">
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold">All team media</h1>
            <p className="text-xs text-muted-foreground">
              Everything uploaded or shared in {team?.name || 'your team'}: Drive, chat, tasks, docs and notes
            </p>
          </div>
          {teams.length > 1 && (
            <Select value={team?.slug} onValueChange={(v) => setQuery({ team: v })}>
              <SelectTrigger className="w-[180px] h-9">
                <SelectValue placeholder="Team" />
              </SelectTrigger>
              <SelectContent>
                {teams.map((t) => (
                  <SelectItem key={t.id} value={t.slug}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* source tabs */}
        <div className="flex gap-1.5 overflow-x-auto thin-scrollbar -mx-1 px-1 pb-1">
          {SOURCE_TABS.map((t) => {
            const active = source === t.key;
            return (
              <button
                key={t.key}
                onClick={() => setQuery({ source: t.key })}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                  active
                    ? 'bg-neutral-900 text-white border-neutral-900 dark:bg-white dark:text-black dark:border-white'
                    : 'bg-white dark:bg-[#191919] dark:border-[#27272A] hover:bg-muted'
                }`}
              >
                <t.icon className="h-3.5 w-3.5" />
                {t.label}
                {counts[t.key] !== undefined && (
                  <span className={`tabular-nums ${active ? 'opacity-70' : 'text-muted-foreground'}`}>{counts[t.key]}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* filters */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, place or person"
              className="pl-8 h-9"
            />
          </div>
          <Select value={type} onValueChange={(v) => setQuery({ type: v })}>
            <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              <SelectItem value="image">Images</SelectItem>
              <SelectItem value="video">Videos</SelectItem>
              <SelectItem value="audio">Audio</SelectItem>
              <SelectItem value="document">Documents</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>
          <Select value={assigned} onValueChange={(v) => setQuery({ assigned: v })}>
            <SelectTrigger className="w-[160px] h-9">
              <CheckSquare className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any assignment</SelectItem>
              <SelectItem value="any">Assigned to someone</SelectItem>
              <SelectItem value="to-me">Assigned to me</SelectItem>
              <SelectItem value="by-me">Assigned by me</SelectItem>
            </SelectContent>
          </Select>
          <div className="ml-auto flex rounded-lg border dark:border-[#27272A] overflow-hidden">
            {(['grid', 'list'] as const).map((v) => {
              const Icon = v === 'grid' ? LayoutGrid : List;
              return (
                <button
                  key={v}
                  aria-label={`${v} view`}
                  onClick={() => {
                    setView(v);
                    try { localStorage.setItem('drive-all-view', v); } catch {}
                  }}
                  className={`p-2 ${view === v ? 'bg-muted' : 'hover:bg-muted/60'}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* body */}
      <div className={`px-4 sm:px-6 py-4 transition-opacity ${isFetching && !isLoading ? 'opacity-60' : ''}`}>
        {isLoading || !team ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {Array.from({ length: 10 }).map((_, i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="text-sm text-red-500 py-16 text-center">Couldn&apos;t load team media. Try refreshing.</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center">
            <HardDrive className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nothing here yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Files shared in chat, attached to tasks, added to docs or notes, or uploaded to Drive will show up here.
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setPreview(item)}
                className="group text-left rounded-xl border dark:border-[#27272A] bg-white dark:bg-[#191919] overflow-hidden hover:shadow-md transition-shadow"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <Thumb item={item} className="h-full w-full group-hover:scale-[1.02] transition-transform" />
                  <div className="absolute left-2 top-2"><SourceBadge source={item.source} /></div>
                  {item.kind === 'video' && item.url && (
                    <Film className="absolute right-2 top-2 h-4 w-4 text-white drop-shadow" />
                  )}
                </div>
                <div className="p-2.5 space-y-1 min-w-0">
                  <p className="text-sm font-medium truncate" title={item.name}>{item.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate" title={item.location.label}>
                    {item.location.label}
                  </p>
                  <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <UserChip user={item.uploadedBy} />
                    <span className="shrink-0">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: false })}</span>
                  </div>
                  <AssignmentLine item={item} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border dark:border-[#27272A] bg-white dark:bg-[#191919] divide-y dark:divide-[#27272A] overflow-hidden">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => setPreview(item)}
                className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-muted/50"
              >
                <Thumb item={item} className="h-11 w-11 rounded-lg shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <span className="hidden sm:inline-flex"><SourceBadge source={item.source} /></span>
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.location.label}
                    {item.location.detail ? ` · ${item.location.detail}` : ''}
                  </p>
                  <AssignmentLine item={item} />
                </div>
                <div className="hidden md:block w-40 text-xs text-muted-foreground min-w-0">
                  <UserChip user={item.uploadedBy} />
                </div>
                <div className="hidden sm:block w-20 text-right text-xs text-muted-foreground tabular-nums">
                  {formatSize(item.size) || '—'}
                </div>
                <div className="w-24 text-right text-xs text-muted-foreground shrink-0">
                  {format(new Date(item.createdAt), 'MMM d, yyyy')}
                </div>
              </button>
            ))}
          </div>
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-5 text-sm">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground tabular-nums">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      <PreviewDialog item={preview} onClose={() => setPreview(null)} />
    </div>
  );
}

export default function DriveAllPage() {
  return (
    <div className="flex">
      <ThinSidebar />
      <SidebarProvider className=" bg-[#FFFFFF] dark:bg-[#09090B] p-2 overflow-hidden">
        <AppSidebar className=" h-screen mr-2 w-60 bg-transparent" />
        <SidebarInset className=" border flex flex-col dark:border-[#27272A] dark:bg-[#101010] bg-[#F4F4F4] rounded-3xl overflow-hidden">
          <ScrollArea className="py-2 px-0 thin-scrollbar2">
            <CentralDrive />
          </ScrollArea>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}
