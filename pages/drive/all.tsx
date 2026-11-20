// /drive/all – one place for every image, video, file shared or uploaded in a team.
// Cards, list and the expanded viewer mirror the Drive layout (components/file-manager/table-upload.tsx).
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatDistanceToNow, format } from 'date-fns';
import { toast } from 'sonner';
import {
  ArrowUpRight,
  Check,
  Download,
  ExternalLink,
  FileArchiveIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
  File as FileIcon,
  Filter,
  HardDrive,
  HeadphonesIcon,
  ImageIcon,
  Lock,
  MessageCircleMore,
  MoreHorizontal,
  NotebookPen,
  SquareKanban,
  FileText,
  UserCheck,
  Users,
  VideoIcon,
} from 'lucide-react';

import { AppSidebar } from '@/components/file-manager/components/app-sidebar';
import { SidebarInset, SidebarProvider } from '@/components/file-manager/components/ui/sidebar';
import { ScrollArea } from '@/components/ui/scroll-area';
import ThinSidebar from '@/components/ui/thinSidebar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import { Modal, ModalBody, ModalContent, ModalHeader, ModalTitle } from '@/components/ui/animated-modal';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/animate-ui/components/radix/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/animate-ui/components/animate/tooltip';
import { List } from '@/components/animate-ui/icons/list';
import { AnimateIcon } from '@/components/animate-ui/icons/icon';
import { LayoutDashboard } from '@/components/animate-ui/icons/layout-dashboard';
import { Ellipsis } from '@/components/animate-ui/icons/ellipsis';
import { DownloadIcon } from '@/components/animate-ui/icons/download';
import { Link2 } from '@/components/animate-ui/icons/link-2';
import {
  ExpandableScreen,
  ExpandableScreenContent,
  ExpandableScreenTrigger,
} from '@/components/ui/ExpandableScreen';
import { GooeyInput } from '@/components/ui/gooey-input';
import type { MediaItem, MediaSource, MediaUser } from '@/lib/drive/central-media';

interface Team {
  id: string;
  name: string;
  slug: string;
  role?: string;
}

interface MediaResponse {
  items: MediaItem[];
  counts: Record<string, number>;
  pagination: { page: number; pageSize: number; total: number; totalPages: number };
}

const LOCKED_BG = 'https://i.pinimg.com/1200x/7b/95/a2/7b95a2e1ecf7a65120d0417c44d2a66e.jpg';

const SOURCE_TABS = [
  { key: 'all', label: 'All' },
  { key: 'drive', label: 'Drive' },
  { key: 'chat', label: 'Chat' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'docs', label: 'Docs' },
  { key: 'notes', label: 'Notes' },
] as const;

const TYPE_OPTIONS = [
  { key: 'all', label: 'All types' },
  { key: 'image', label: 'Images' },
  { key: 'video', label: 'Videos' },
  { key: 'audio', label: 'Audio' },
  { key: 'document', label: 'Documents' },
  { key: 'other', label: 'Other' },
];

const ASSIGNED_OPTIONS = [
  { key: 'all', label: 'Any assignment' },
  { key: 'any', label: 'Assigned to someone' },
  { key: 'to-me', label: 'Assigned to me' },
  { key: 'by-me', label: 'Assigned by me' },
];

const SOURCE_META: Record<MediaSource, { label: string; icon: any; variant: 'default' | 'secondary' | 'outline' }> = {
  DRIVE: { label: 'Drive', icon: HardDrive, variant: 'default' },
  CHANNEL: { label: 'Channel', icon: MessageCircleMore, variant: 'secondary' },
  THREAD: { label: 'Thread', icon: MessageCircleMore, variant: 'secondary' },
  DM: { label: 'DM', icon: MessageCircleMore, variant: 'secondary' },
  TASK: { label: 'Task', icon: SquareKanban, variant: 'outline' },
  TASK_COMMENT: { label: 'Comment', icon: SquareKanban, variant: 'outline' },
  DOC: { label: 'Doc', icon: FileText, variant: 'secondary' },
  NOTE: { label: 'Note', icon: NotebookPen, variant: 'secondary' },
};

const WORD_MIMES = [
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const SHEET_MIMES = [
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

// ---------------------------------------------------------------------------
// helpers

function formatSize(bytes: number | null) {
  if (!bytes) return null;
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${parseFloat((bytes / Math.pow(1024, i)).toFixed(1))} ${units[i]}`;
}

function extOf(item: MediaItem) {
  const m = item.name.match(/\.([a-z0-9]{1,6})$/i);
  return (m?.[1] || item.mimeType.split('/')[1]?.slice(0, 4) || 'file').toUpperCase();
}

function displayName(u: MediaUser | null) {
  return u?.name || u?.email || 'Unknown';
}

function metaLine(item: MediaItem) {
  return [displayName(item.uploadedBy), formatSize(item.size), extOf(item)].filter(Boolean).join(' • ');
}

function isArchive(item: MediaItem) {
  const e = extOf(item).toLowerCase();
  return /zip|rar/.test(item.mimeType) || e === 'zip' || e === 'rar';
}

function officeSrc(url: string) {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

function getFileIcon(mimeType: string) {
  if (mimeType.startsWith('image/')) return <ImageIcon className="size-3.5 text-green-400" />;
  if (mimeType.startsWith('video/')) return <VideoIcon className="size-3.5 text-red-500" />;
  if (mimeType.startsWith('audio/')) return <HeadphonesIcon className="size-3.5 text-pink-500" />;
  if (mimeType.includes('pdf')) return <FileTextIcon className="size-3.5 text-purple-500" />;
  if (mimeType.includes('word') || mimeType.includes('doc')) return <FileTextIcon className="size-3.5 text-blue-600" />;
  if (mimeType.includes('excel') || mimeType.includes('sheet'))
    return <FileSpreadsheetIcon className="size-3.5 text-yellow-500" />;
  if (mimeType.includes('zip') || mimeType.includes('rar')) return <FileArchiveIcon className="size-3.5 text-orange-500" />;
  return <FileTextIcon className="size-3.5" />;
}

function absoluteUrl(url: string) {
  if (typeof window === 'undefined' || /^https?:/i.test(url)) return url;
  return new URL(url, window.location.origin).toString();
}

function copyLink(item: MediaItem) {
  if (!item.url) return;
  navigator.clipboard
    ?.writeText(absoluteUrl(item.url))
    .then(() => toast.success('Link copied'))
    .catch(() => toast.error('Could not copy link'));
}

function UserAvatar({ user, className = 'size-6' }: { user: MediaUser | null; className?: string }) {
  return (
    <Avatar className={className}>
      <AvatarImage src={user?.image || ''} />
      <AvatarFallback className="text-[10px]">{displayName(user)[0]?.toUpperCase()}</AvatarFallback>
    </Avatar>
  );
}

function SourceBadge({ source }: { source: MediaSource }) {
  const m = SOURCE_META[source];
  const Icon = m.icon;
  return (
    <Badge variant={m.variant} className="text-xs !py-0.5 whitespace-nowrap">
      <Icon className="size-3 mr-1" /> {m.label}
    </Badge>
  );
}

const iconBtn = '!px-0 !py-2.5 h-5 w-6 hover:bg-[#F0F0F0] rounded-sm hover:dark:bg-[#222222]';
const viewerBtn = '!px-0 !py-2.5 h-7 w-7 hover:bg-[#F0F0F0] rounded-sm hover:dark:bg-[#222222]';

// ---------------------------------------------------------------------------
// shared menu (card, viewer, list row)

function ItemMenuItems({ item, onOpen }: { item: MediaItem; onOpen: () => void }) {
  return (
    <>
      <DropdownMenuItem onClick={onOpen}>
        <Download className="size-4 mr-2" /> Open
      </DropdownMenuItem>
      {item.location.href && (
        <DropdownMenuItem asChild>
          <Link href={item.location.href}>
            <ExternalLink className="size-4 mr-2" /> Go to {SOURCE_META[item.source].label.toLowerCase()}
          </Link>
        </DropdownMenuItem>
      )}
      {item.url && (
        <DropdownMenuItem onClick={() => copyLink(item)}>
          <Link2 className="size-4 mr-2 -rotate-45" /> Copy link
        </DropdownMenuItem>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// previews

function CardPreview({ item }: { item: MediaItem }) {
  const [failed, setFailed] = useState(false);
  const url = item.url;

  if (url && !failed && item.mimeType.startsWith('image/')) {
    return (
      <div className="mt-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={item.name}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-48 max-h-48 object-cover rounded-xl"
        />
      </div>
    );
  }
  if (url && !failed && item.mimeType.startsWith('video/')) {
    return (
      <div className="mt-3">
        <video
          aria-label="Video player"
          autoPlay={false}
          loop
          muted
          preload="metadata"
          src={`${url}#t=0.5`}
          onError={() => setFailed(true)}
          className="w-full min-h-48 h-48 object-cover rounded-xl"
        />
      </div>
    );
  }
  if (url && item.mimeType.startsWith('audio/')) {
    return (
      <div className="mt-3 border rounded-lg bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 size-10 bg-blue-500 text-white rounded-full flex items-center justify-center">🎵</div>
          <div className="flex-1 min-w-0" onClick={(e) => e.stopPropagation()}>
            <audio aria-label="audio player" controls src={url} className="mt-2 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (url && item.mimeType === 'application/pdf') {
    return (
      <div className="overflow-hidden h-48 max-h-48 w-full mt-3 rounded-lg border pointer-events-none">
        <iframe src={url} className="w-full h-48 rounded" title={item.name} sandbox="allow-same-origin allow-popups" />
      </div>
    );
  }
  if (url && (WORD_MIMES.includes(item.mimeType) || SHEET_MIMES.includes(item.mimeType))) {
    return (
      <div className="overflow-hidden w-full mt-3 rounded-lg border h-48 pointer-events-none">
        <iframe src={officeSrc(url)} className="w-full h-full rounded" title={item.name} sandbox="allow-same-origin allow-popups" />
      </div>
    );
  }
  if (isArchive(item)) {
    return (
      <div className="mt-3 border h-48 max-h-48 rounded-lg bg-muted/30 p-3">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 size-10 bg-yellow-500 text-white rounded-full flex items-center justify-center">📦</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            <p className="text-xs text-muted-foreground">
              {extOf(item)} {formatSize(item.size) && `• ${formatSize(item.size)}`}
            </p>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-3 border h-48 max-h-48 rounded-lg bg-muted/30 flex flex-col items-center justify-center gap-2">
      <FileIcon className="size-10 text-neutral-400" />
      <span className="text-xs text-muted-foreground uppercase tracking-wider">{extOf(item)}</span>
    </div>
  );
}

function ViewerPreview({ item }: { item: MediaItem }) {
  const url = item.url;
  if (item.mimeType.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={item.name} className="max-h-full max-w-full object-contain rounded-xl" />;
  }
  if (item.mimeType.startsWith('video/')) {
    return (
      <video aria-label="video player" autoPlay loop controls src={url} className="max-h-full max-w-full object-contain rounded-xl" />
    );
  }
  if (item.mimeType.startsWith('audio/')) {
    return (
      <div className="border border-[#262626] rounded-lg bg-muted/30 p-3 w-full max-w-md">
        <div className="flex items-center gap-3">
          <div className="flex-shrink-0 size-10 bg-blue-500 text-white rounded-full flex items-center justify-center">🎵</div>
          <div className="flex-1 min-w-0">
            <audio aria-label="audio player" controls autoPlay src={url} className="mt-2 w-full" />
          </div>
        </div>
      </div>
    );
  }
  if (item.mimeType === 'application/pdf') {
    return (
      <div className="overflow-hidden h-full w-full rounded-lg border border-[#262626]">
        <iframe src={url} className="w-full h-full rounded" title={item.name} sandbox="allow-same-origin allow-popups" />
      </div>
    );
  }
  if (WORD_MIMES.includes(item.mimeType) || SHEET_MIMES.includes(item.mimeType)) {
    return (
      <div className="overflow-hidden w-full rounded-lg border border-[#262626] h-full">
        <iframe src={officeSrc(url)} className="w-full h-full rounded" title={item.name} sandbox="allow-same-origin allow-popups" />
      </div>
    );
  }
  return (
    <div className="border border-[#262626] rounded-lg bg-muted/30 p-4 w-full max-w-md">
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 size-10 bg-yellow-500 text-white rounded-full flex items-center justify-center">
          {isArchive(item) ? '📦' : '📄'}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate text-white">{item.name}</p>
          <p className="text-xs text-neutral-500">
            {extOf(item)} {formatSize(item.size) && `• ${formatSize(item.size)}`} • No preview for this type
          </p>
          <a href={url} download={item.name} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-sm text-blue-400 hover:underline">
            Download
          </a>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// details panel (in the viewer)

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-[11px] uppercase tracking-wider text-neutral-500">{label}</p>
      <div className="text-sm text-neutral-200 min-w-0">{children}</div>
    </div>
  );
}

function PersonLine({ user }: { user: MediaUser | null }) {
  return (
    <span className="inline-flex items-center gap-2 min-w-0">
      <UserAvatar user={user} className="size-6 shrink-0" />
      <span className="truncate">{displayName(user)}</span>
    </span>
  );
}

function DetailsPanel({ item }: { item: MediaItem }) {
  const sharedLabel = item.source === 'DRIVE' || item.source.startsWith('TASK') ? 'Uploaded by' : 'Shared by';
  const edited = item.source === 'DOC' || (item.source === 'NOTE' && item.id.startsWith('note:'));
  return (
    <aside className="md:w-80 shrink-0 border-t md:border-t-0 md:border-l border-[#1F1F1F] bg-[#0D0D0D] p-4 space-y-5 overflow-y-auto scrollbar-thin2">
      <DetailRow label="Source">
        <SourceBadge source={item.source} />
      </DetailRow>

      <DetailRow label="Where">
        {item.location.href ? (
          <Link href={item.location.href} className="inline-flex items-center gap-1 font-medium hover:underline break-all">
            {item.location.label}
            <ArrowUpRight className="size-3.5 shrink-0" />
          </Link>
        ) : (
          <span className="font-medium break-all">{item.location.label}</span>
        )}
        {item.location.detail && <p className="text-xs text-neutral-500 mt-0.5">{item.location.detail}</p>}
      </DetailRow>

      <DetailRow label={sharedLabel}>
        <PersonLine user={item.uploadedBy} />
      </DetailRow>

      <DetailRow label={edited ? 'Last edited' : 'When'}>
        {format(new Date(item.createdAt), 'PPp')}
        <p className="text-xs text-neutral-500">{formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}</p>
      </DetailRow>

      <DetailRow label="File">
        {[extOf(item), formatSize(item.size)].filter(Boolean).join(' • ')}
      </DetailRow>

      <DetailRow label="Assigned">
        {item.assignments.length === 0 ? (
          <span className="text-neutral-500">Not assigned</span>
        ) : (
          <div className="space-y-2.5">
            {item.assignments.map((a, i) => (
              <div key={i} className="space-y-1">
                <PersonLine user={a.assignee} />
                <p className="text-xs text-neutral-500 pl-8">
                  {a.assigner ? <>by {displayName(a.assigner)}</> : 'Assigned'}
                  {a.assignedAt && <> · {formatDistanceToNow(new Date(a.assignedAt), { addSuffix: true })}</>}
                </p>
              </div>
            ))}
          </div>
        )}
      </DetailRow>

      {item.alsoIn.length > 0 && (
        <DetailRow label="Also in">
          <div className="flex flex-wrap gap-1.5">
            {item.alsoIn.map((l, i) => (
              <Link
                key={i}
                href={l.href || '#'}
                className="text-xs rounded-md border border-[#2A2A2A] px-2 py-0.5 hover:bg-[#1A1A1A]"
              >
                {l.type}: {l.label}
              </Link>
            ))}
          </div>
        </DetailRow>
      )}
    </aside>
  );
}

// ---------------------------------------------------------------------------
// viewer (expanded screen content), same chrome as Drive

function LockedViewer({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="relative w-full h-[calc(96vh-1rem)] flex flex-col items-center justify-center bg-[#191919] overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LOCKED_BG} alt="Locked" className="absolute inset-0 w-full h-full object-cover opacity-60" />
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/50">
        <Lock className="size-16 text-white mb-4" />
        <p className="text-white text-lg font-medium mb-2">This file is password protected</p>
        <p className="text-neutral-400 text-sm mb-6">Enter password to view content</p>
        <Button onClick={onUnlock} className="bg-white text-black hover:bg-neutral-200">
          <Lock className="size-4 mr-2" /> Enter Password
        </Button>
      </div>
    </div>
  );
}

function Viewer({ item, onOpen, onUnlock }: { item: MediaItem; onOpen: () => void; onUnlock: () => void }) {
  if (!item.url) return <LockedViewer onUnlock={onUnlock} />;
  return (
    <div className="flex flex-col h-[calc(96vh-1rem)]">
      <div className="bg-[#191919] border-t border-[#1F1F1F] h-10 shrink-0 w-full flex justify-between items-center pr-10">
        <div className="flex justify-start items-center gap-2 px-4 min-w-0">
          <UserAvatar user={item.uploadedBy} className="size-6 shrink-0" />
          <div className="flex flex-col min-w-0">
            <h3 className="font-medium text-xs truncate text-white" title={item.name}>
              {item.name}
            </h3>
            <p className="text-xs text-neutral-500 truncate">{metaLine(item)}</p>
          </div>
        </div>
        <div className="flex justify-end items-center gap-2 shrink-0">
          {item.assignments.length > 0 && (
            <div className="hidden sm:flex items-center gap-1">
              <p className="text-xs text-neutral-500">Assigned:</p>
              <div className="flex -space-x-2">
                {item.assignments.slice(0, 3).map((a, i) => (
                  <UserAvatar key={i} user={a.assignee} className="size-6 border-2 border-background" />
                ))}
                {item.assignments.length > 3 && (
                  <span className="text-[10px] text-white size-6 border-2 border-background bg-red-500 rounded-full flex items-center justify-center">
                    +{item.assignments.length - 3}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex w-fit justify-center gap-1 items-center">
            <Button onClick={() => copyLink(item)} variant="ghost" size="icon" className={viewerBtn} aria-label="Copy link">
              <AnimateIcon animateOnHover>
                <Link2 className="-rotate-45 h-7 w-7 dark:text-[#d0cfcf]" />
              </AnimateIcon>
            </Button>
            <Button onClick={onOpen} variant="ghost" size="icon" className={viewerBtn} aria-label="Download">
              <AnimateIcon animateOnHover>
                <DownloadIcon className="h-7 w-7 dark:text-[#d0cfcf]" />
              </AnimateIcon>
            </Button>
            {item.location.href && (
              <Button variant="ghost" size="icon" className={viewerBtn} asChild>
                <Link href={item.location.href} aria-label="Go to source">
                  <ExternalLink className="h-4 w-4 dark:text-[#d0cfcf]" />
                </Link>
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger>
                <AnimateIcon animateOnHover>
                  <Button variant="ghost" size="icon" className={`!-rotate-90 ${iconBtn}`}>
                    <Ellipsis className="h-5 w-5 dark:text-[#d0cfcf]" />
                  </Button>
                </AnimateIcon>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <ItemMenuItems item={item} onOpen={onOpen} />
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <SourceBadge source={item.source} />
        </div>
      </div>
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        <div className="flex flex-1 min-h-[40vh] items-center justify-center w-full overflow-auto scrollbar-thin2 p-2">
          <ViewerPreview item={item} />
        </div>
        <DetailsPanel item={item} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// grid card, same structure as the Drive card

function MediaCard({
  item,
  onOpen,
  onUnlock,
}: {
  item: MediaItem;
  onOpen: () => void;
  onUnlock: () => void;
}) {
  const locked = !item.url;
  const firstAssign = item.assignments[0];
  return (
    <ExpandableScreen layoutId={`media-${item.id}`} triggerRadius="100px" contentRadius="24px">
      <ExpandableScreenTrigger className="w-full">
        <div className="relative">
          <Card className="rounded-2xl group relative border-t-2 border-white border-none h-fit p-1 pt-3 dark:bg-neutral-800 shadow">
            <div className="flex justify-between items-center w-full gap-1">
              <div className="flex justify-start items-start gap-2 px-1 min-w-0 flex-1">
                <UserAvatar user={item.uploadedBy} className="size-8 shrink-0" />
                <div className="flex flex-col min-w-0">
                  <h3 className="font-medium text-xs truncate" title={item.name}>
                    {item.name}
                  </h3>
                  <p className="text-xs text-neutral-500 truncate">{metaLine(item)}</p>
                </div>
              </div>
              <div className="flex justify-center items-center shrink-0" onClick={(e) => e.stopPropagation()}>
                <SourceBadge source={item.source} />
                <DropdownMenu>
                  <DropdownMenuTrigger>
                    <AnimateIcon animateOnHover>
                      <Button variant="ghost" size="icon" className={`!-rotate-90 ${iconBtn}`}>
                        <Ellipsis className="h-5 w-5 dark:text-[#8D8D8D]" />
                      </Button>
                    </AnimateIcon>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <ItemMenuItems item={item} onOpen={onOpen} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            <div className="group relative">
              {!locked && (
                <div className="absolute inset-0 z-10 rounded-md opacity-0 py-1 px-2 group-hover:opacity-100 transition-opacity flex items-end h-fit justify-end gap-2">
                  <div
                    className="flex w-fit justify-center px-1 py-0.5 h-8 rounded-md bg-[#ffffff] dark:bg-[#111111] items-center"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Button onClick={onOpen} variant="ghost" size="icon" className={iconBtn} aria-label="Download">
                      <AnimateIcon animateOnHover>
                        <DownloadIcon className="h-5 w-5 dark:text-[#8D8D8D]" />
                      </AnimateIcon>
                    </Button>
                    <Button onClick={() => copyLink(item)} variant="ghost" size="icon" className={iconBtn} aria-label="Copy link">
                      <AnimateIcon animateOnHover>
                        <Link2 className="-rotate-45 h-5 w-5 dark:text-[#8D8D8D]" />
                      </AnimateIcon>
                    </Button>
                    {item.location.href && (
                      <Button variant="ghost" size="icon" className={iconBtn} asChild>
                        <Link href={item.location.href} aria-label="Go to source">
                          <ExternalLink className="h-4 w-4 dark:text-[#8D8D8D]" />
                        </Link>
                      </Button>
                    )}
                  </div>
                </div>
              )}
              <CardPreview item={item} />
            </div>

            {/* details: where it lives + assignment */}
            <div className="px-1.5 pt-2 pb-1 space-y-1 min-w-0">
              <p className="flex items-center gap-1 text-[11px] text-neutral-500 min-w-0" title={item.location.detail || item.location.label}>
                <span className="truncate">{item.location.label}</span>
                <span className="shrink-0">· {formatDistanceToNow(new Date(item.createdAt))}</span>
              </p>
              {firstAssign && (
                <p className="flex items-center gap-1 text-[11px] text-neutral-500 min-w-0">
                  <UserCheck className="size-3 shrink-0 text-emerald-500" />
                  <span className="truncate">
                    {displayName(firstAssign.assignee)}
                    {item.assignments.length > 1 && ` +${item.assignments.length - 1}`}
                    {firstAssign.assigner && <> · by {displayName(firstAssign.assigner)}</>}
                  </span>
                </p>
              )}
            </div>
          </Card>

          {locked && (
            <div
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm rounded-2xl cursor-pointer overflow-hidden"
              onClick={(e) => {
                e.stopPropagation();
                onUnlock();
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={LOCKED_BG} alt="Locked" className="absolute inset-0 w-full h-full object-cover opacity-90" />
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/40">
                <p className="text-[#b4b4b4] text-sm mt-8 opacity-90 font-medium">Click to unlock</p>
              </div>
            </div>
          )}
        </div>
      </ExpandableScreenTrigger>

      <ExpandableScreenContent className="bg-[#000] max-w-7xl max-h-[96%] !rounded-lg !overflow-hidden border border-[#181818]">
        <Viewer item={item} onOpen={onOpen} onUnlock={onUnlock} />
      </ExpandableScreenContent>
    </ExpandableScreen>
  );
}

// ---------------------------------------------------------------------------
// list view, same table as Drive

function HoverPreview({ item }: { item: MediaItem }) {
  if (!item.url) return <Lock className="size-6 text-neutral-500" />;
  if (item.mimeType.startsWith('image/'))
    // eslint-disable-next-line @next/next/no-img-element
    return <img className="w-full h-full object-cover rounded-sm" src={item.url} alt="" />;
  if (item.mimeType.startsWith('video/'))
    return <video aria-label="video player" autoPlay loop muted src={item.url} className="w-full h-full object-cover rounded" />;
  if (item.mimeType.startsWith('audio/')) return <audio aria-label="audio player" controls src={item.url} />;
  if (item.mimeType === 'application/pdf')
    return <iframe src={item.url} className="w-full h-full" title={item.name} sandbox="allow-same-origin allow-popups" />;
  if (WORD_MIMES.includes(item.mimeType) || SHEET_MIMES.includes(item.mimeType))
    return <iframe src={officeSrc(item.url)} className="w-full h-full rounded" title={item.name} sandbox="allow-same-origin allow-popups" />;
  return (
    <div className="flex flex-col items-center gap-2 text-neutral-500 text-xs px-6">
      <FileIcon className="size-8" /> {extOf(item)}
    </div>
  );
}

function MediaTable({
  items,
  onView,
  onOpen,
  onUnlock,
}: {
  items: MediaItem[];
  onView: (item: MediaItem) => void;
  onOpen: (item: MediaItem) => void;
  onUnlock: (item: MediaItem) => void;
}) {
  return (
    <div className="rounded-lg">
      <Table>
        <TableHeader>
          <TableRow className="border-none hover:bg-transparent">
            <TableHead className="h-7 py-1 pl-4 text-xs font-medium text-neutral-500 w-[34%]">Name</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500">Source</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500">Where</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500">Last Modified</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500 text-center">Type</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500 text-end">Size</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500 text-center w-[80px]">Uploaded</TableHead>
            <TableHead className="h-7 py-1 text-xs font-medium text-neutral-500 text-center w-[90px]">Assigned</TableHead>
            <TableHead className="h-7 py-1 pr-4 text-xs font-medium text-neutral-500 text-end w-[60px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow
              key={item.id}
              className="group !border-b border-[#222] hover:bg-neutral-900/40 transition-colors cursor-pointer"
              onClick={() => (item.url ? onView(item) : onUnlock(item))}
            >
              <TableCell className="py-1 pl-4">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="size-4 flex items-center justify-center text-neutral-400 shrink-0">
                    {item.url ? getFileIcon(item.mimeType) : <Lock className="size-3.5 text-red-400" />}
                  </div>
                  <div className="flex items-center gap-2 min-w-0">
                    <HoverCard>
                      <HoverCardTrigger className="cursor-pointer min-w-0">
                        <p className="text-sm font-medium dark:text-neutral-200 group-hover:dark:text-white transition-colors truncate max-w-[220px]">
                          {item.name}
                        </p>
                      </HoverCardTrigger>
                      <HoverCardContent className="dark:bg-black flex justify-center items-center overflow-hidden border border-neutral-800 p-1 h-80 min-w-40 w-auto">
                        <HoverPreview item={item} />
                      </HoverCardContent>
                    </HoverCard>
                    {item.url && (
                      <div
                        className="flex items-center gap-1.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity duration-150"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          aria-label="Copy link"
                          className="p-1 rounded dark:bg-[#111111] dark:hover:bg-[#222222] hover:bg-accent text-[#979797] border border-border dark:border-[#484848] hover:text-foreground transition-colors"
                          onClick={() => copyLink(item)}
                        >
                          <Link2 className="w-3.5 h-3.5 -rotate-45" />
                        </button>
                        <button
                          type="button"
                          aria-label="Download"
                          className="p-1 rounded dark:bg-[#111111] dark:hover:bg-[#222222] hover:bg-accent text-[#979797] border border-border dark:border-[#484848] hover:text-foreground transition-colors"
                          onClick={() => onOpen(item)}
                        >
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="py-1">
                <SourceBadge source={item.source} />
              </TableCell>
              <TableCell className="py-1 text-sm text-neutral-500 max-w-[200px]">
                <p className="truncate" title={item.location.detail || item.location.label}>
                  {item.location.label}
                </p>
              </TableCell>
              <TableCell className="py-1 text-sm text-neutral-500 whitespace-nowrap">
                {format(new Date(item.createdAt), 'MMM d, yyyy')}
              </TableCell>
              <TableCell className="py-1 text-center">
                <span className="text-xs text-neutral-500 font-medium uppercase tracking-wider">{extOf(item)}</span>
              </TableCell>
              <TableCell className="py-1 text-sm text-neutral-500 text-end whitespace-nowrap">
                {formatSize(item.size) || '—'}
              </TableCell>
              <TableCell className="py-1 text-center">
                <span title={displayName(item.uploadedBy)}>
                  <UserAvatar user={item.uploadedBy} className="size-6 mx-auto ring-2 ring-transparent group-hover:ring-neutral-700 transition-all" />
                </span>
              </TableCell>
              <TableCell className="py-1">
                {item.assignments.length > 0 ? (
                  <div
                    className="flex justify-center -space-x-2"
                    title={item.assignments
                      .map((a) => `${displayName(a.assignee)}${a.assigner ? ` (by ${displayName(a.assigner)})` : ''}`)
                      .join(', ')}
                  >
                    {item.assignments.slice(0, 3).map((a, i) => (
                      <UserAvatar key={i} user={a.assignee} className="size-6 border-2 border-background" />
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-xs text-neutral-600">—</p>
                )}
              </TableCell>
              <TableCell className="py-1 pr-4 text-end" onClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-md opacity-0 group-hover:opacity-100 transition-opacity text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48 dark:bg-neutral-900 border-neutral-800">
                    <ItemMenuItems item={item} onOpen={() => (item.url ? onOpen(item) : onUnlock(item))} />
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// page

function FilterMenu({
  icon: Icon,
  label,
  value,
  options,
  onChange,
}: {
  icon: any;
  label: string;
  value: string;
  options: { key: string; label: string }[];
  onChange: (v: string) => void;
}) {
  const active = value !== 'all';
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className="!px-0 !py-0">
        <Button
          variant="ghost"
          size="icon"
          aria-label={label}
          className="relative h-7 w-7 !px-0.5 !py-0.5 rounded-full hover:dark:bg-[#000]"
        >
          <Icon className={`h-4 w-4 ${active ? 'text-foreground' : 'text-[#B4B4B4]'}`} />
          {active && <span className="absolute top-0.5 right-0.5 size-1.5 rounded-full bg-blue-500" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-52">
        <DropdownMenuLabel>{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {options.map((o) => (
          <DropdownMenuItem key={o.key} onClick={() => onChange(o.key)} className="flex items-center justify-between cursor-pointer">
            {o.label}
            {value === o.key && <Check className="size-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [listPreview, setListPreview] = useState<MediaItem | null>(null);
  const [unlocked, setUnlocked] = useState<Record<string, string>>({});
  const [lockTarget, setLockTarget] = useState<MediaItem | null>(null);
  const [password, setPassword] = useState('');

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

  const chooseView = (v: 'grid' | 'list') => {
    setView(v);
    try {
      localStorage.setItem('drive-all-view', v);
    } catch {}
  };

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

  // password-protected Drive files come without a URL until unlocked here
  const items = useMemo(
    () => (data?.items || []).map((it) => (!it.url && unlocked[it.id] ? { ...it, url: unlocked[it.id] } : it)),
    [data?.items, unlocked]
  );
  const counts = data?.counts || {};

  const verifyPassword = useMutation({
    mutationFn: async ({ item, password }: { item: MediaItem; password: string }) => {
      const fileId = item.id.replace(/^drive:/, '');
      const res = await fetch(`/api/files/${fileId}/verify-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Invalid password');
      }
      return res.json();
    },
    onSuccess: (res, { item }) => {
      if (res?.url) setUnlocked((u) => ({ ...u, [item.id]: res.url }));
      setLockTarget(null);
      setPassword('');
      toast.success('File unlocked');
    },
    onError: (e: any) => toast.error(e.message || 'Invalid password'),
  });

  const requestUnlock = (item: MediaItem) => {
    if (item.source !== 'DRIVE') return;
    setPassword('');
    setLockTarget(item);
  };

  const openFile = (item: MediaItem) => {
    if (!item.url) return requestUnlock(item);
    window.open(item.url, '_blank', 'noopener,noreferrer');
  };

  const closeListPreview = () => setTimeout(() => setListPreview(null), 400);

  return (
    <Tabs className="flex flex-col h-full">
      {/* header bar, same as Drive */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-1 border-b border-[#222] px-2">
        <Tabs value={source} onValueChange={(v) => setQuery({ source: v })}>
          <TabsList className="!bg-transparent rounded-none -mb-1 gap-1 h-auto flex-wrap justify-start">
            {SOURCE_TABS.map((t) => (
              <TabsTrigger
                key={t.key}
                value={t.key}
                className="hover:border-[#B4B4B4] border-transparent border-b rounded-none data-[state=active]:bg-[#cccaca] dark:data-[state=active]:border-[#f4f4f4] hover:dark:border-[#2c22f5]"
              >
                {t.label}
                {counts[t.key] !== undefined && (
                  <span className="ml-1.5 text-[11px] tabular-nums text-neutral-500">{counts[t.key]}</span>
                )}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex justify-center items-center gap-2">
          {teams.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild className="!px-0 !py-0">
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Select team"
                  className="relative h-7 w-7 !px-0.5 !py-0.5 rounded-full hover:dark:bg-[#000]"
                >
                  <Users className="h-4 w-4 text-[#B4B4B4]" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                <DropdownMenuLabel>Select Team</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {teams.map((t) => (
                  <DropdownMenuItem
                    key={t.id}
                    onClick={() => setQuery({ team: t.slug })}
                    className="flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Users className="size-4 text-[#B4B4B4]" />
                      <span>{t.name}</span>
                    </div>
                    {team?.id === t.id ? (
                      <Check className="size-4" />
                    ) : (
                      t.role && (
                        <Badge variant="outline" className="text-xs">
                          {t.role}
                        </Badge>
                      )
                    )}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <FilterMenu icon={Filter} label="File type" value={type} options={TYPE_OPTIONS} onChange={(v) => setQuery({ type: v })} />
          <FilterMenu
            icon={UserCheck}
            label="Assignment"
            value={assigned}
            options={ASSIGNED_OPTIONS}
            onChange={(v) => setQuery({ assigned: v })}
          />

          <Separator orientation="vertical" className="h-6 mr-0.5 dark:!bg-[#303030]" />

          <GooeyInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search..." className="" />

          <Separator orientation="vertical" className="h-6 mr-0.5 dark:!bg-[#303030]" />

          <TabsList className="border dark:!border-[#303030] bg-transparent h-8 !p-0 overflow-hidden rounded-xl">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <span>
                    <TabsTrigger
                      value="Grid"
                      data-state={view === 'grid' ? 'active' : 'inactive'}
                      onClick={() => chooseView('grid')}
                      className="group py-2 rounded-none"
                    >
                      <AnimateIcon animateOnHover>
                        <LayoutDashboard className="size-4 dark:text-white" />
                      </AnimateIcon>
                    </TabsTrigger>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="px-2 py-1 text-xs">Grid View</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <Separator orientation="vertical" className="dark:!bg-[#303030]" />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger onClick={() => chooseView('list')} className="!bg-transparent">
                  <span>
                    <AnimateIcon animateOnHover>
                      <TabsTrigger
                        value="List"
                        data-state={view === 'list' ? 'active' : 'inactive'}
                        className="py-2 h-full w-full rounded-none !bg-transparent"
                      >
                        <List animateOnView className="size-4 dark:text-white" />
                      </TabsTrigger>
                    </AnimateIcon>
                  </span>
                </TooltipTrigger>
                <TooltipContent className="px-2 py-1 text-xs">List View</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </TabsList>
        </div>
      </div>

      {/* body */}
      <div className={`flex-1 flex flex-col pt-2 transition-opacity ${isFetching && !isLoading ? 'opacity-60' : ''}`}>
        {isLoading || !team ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 max-xl:gap-3 px-4 max-xl:px-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl p-1 pt-3 bg-white dark:bg-neutral-800 shadow animate-pulse">
                <div className="flex items-center gap-2 px-1">
                  <div className="size-8 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                  <div className="space-y-1.5 flex-1">
                    <div className="h-2.5 w-2/3 rounded bg-neutral-200 dark:bg-neutral-700" />
                    <div className="h-2 w-1/2 rounded bg-neutral-200 dark:bg-neutral-700" />
                  </div>
                </div>
                <div className="mt-3 h-48 rounded-xl bg-neutral-200 dark:bg-neutral-700" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="text-sm text-red-500 py-16 text-center">Couldn&apos;t load team media. Try refreshing.</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-20 text-center px-4">
            <HardDrive className="h-10 w-10 text-muted-foreground" />
            <p className="font-medium">Nothing here yet</p>
            <p className="text-sm text-muted-foreground max-w-sm">
              Files shared in chat, attached to tasks, added to docs or notes, or uploaded to Drive in{' '}
              {team?.name || 'your team'} will show up here.
            </p>
          </div>
        ) : view === 'grid' ? (
          <div className="grid pt-0 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 gap-4 max-xl:gap-3 pb-2 px-4 max-xl:px-3">
            {items.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onOpen={() => openFile(item)}
                onUnlock={() => requestUnlock(item)}
              />
            ))}
          </div>
        ) : (
          <MediaTable items={items} onView={setListPreview} onOpen={openFile} onUnlock={requestUnlock} />
        )}

        {data && data.pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-3 pt-5 pb-3 text-sm">
            <Button variant="outline" size="sm" className="rounded-xl" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Previous
            </Button>
            <span className="text-muted-foreground tabular-nums">
              Page {page} of {data.pagination.totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="rounded-xl"
              disabled={page >= data.pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
      </div>

      {/* list view opens the same expanded viewer */}
      {listPreview && (
        <ExpandableScreen
          key={listPreview.id}
          defaultExpanded
          layoutId={`media-list-${listPreview.id}`}
          contentRadius="24px"
          onExpandChange={(open) => !open && closeListPreview()}
        >
          <ExpandableScreenContent className="bg-[#000] max-w-7xl max-h-[96%] !rounded-lg !overflow-hidden border border-[#181818]">
            <Viewer item={listPreview} onOpen={() => openFile(listPreview)} onUnlock={() => requestUnlock(listPreview)} />
          </ExpandableScreenContent>
        </ExpandableScreen>
      )}

      <Modal open={!!lockTarget} onOpenChange={(o: boolean) => !o && setLockTarget(null)}>
        <ModalBody>
          <ModalContent>
            <ModalHeader>
              <ModalTitle>Enter Password to Access File</ModalTitle>
            </ModalHeader>
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (lockTarget && password) verifyPassword.mutate({ item: lockTarget, password });
              }}
            >
              <Input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
              <Button type="submit" className="w-full" disabled={!password || verifyPassword.isPending}>
                {verifyPassword.isPending ? 'Checking…' : 'Unlock'}
              </Button>
            </form>
          </ModalContent>
        </ModalBody>
      </Modal>
    </Tabs>
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
