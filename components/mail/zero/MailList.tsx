'use client';

import { memo } from 'react';
import Link from 'next/link';
import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Archive2, Star2, Trash } from './icons';
import { MailAvatar } from './MailAvatar';
import { cleanName, formatFullDate, formatMailDate, type FolderId, type MailMessage } from './lib';

interface MailListProps {
  messages: MailMessage[];
  folder: FolderId;
  selectedId: string | null;
  focusedIndex: number;
  isLoading: boolean;
  error: string | null;
  hasMore: boolean;
  searchQuery: string;
  threadCounts: Record<string, number>;
  onOpen: (m: MailMessage) => void;
  onStar: (m: MailMessage) => void;
  onArchive: (m: MailMessage) => void;
  onTrash: (m: MailMessage) => void;
  onLoadMore: () => void;
}

export function MailList({
  messages,
  folder,
  selectedId,
  focusedIndex,
  isLoading,
  error,
  hasMore,
  searchQuery,
  threadCounts,
  onOpen,
  onStar,
  onArchive,
  onTrash,
  onLoadMore,
}: MailListProps) {
  if (error) {
    const notConnected = /not connected/i.test(error);
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center">
        <p className="text-sm font-medium text-black dark:text-white">
          {notConnected ? 'Gmail is not connected' : 'Could not load your mail'}
        </p>
        <p className="max-w-sm text-xs text-[#8C8C8C]">
          {notConnected ? 'Connect your Google account to see your inbox here.' : error}
        </p>
        {notConnected && (
          <Link
            href="/settings/integrations"
            className="mt-2 inline-flex h-7 items-center rounded-lg bg-[#006FFE] px-3 text-sm text-white transition-colors hover:bg-[#0056CC]"
          >
            Connect Gmail
          </Link>
        )}
      </div>
    );
  }

  if (isLoading && messages.length === 0) return <MailListSkeleton />;

  if (messages.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
        <p className="text-lg text-black dark:text-white">It&apos;s empty here</p>
        <p className="text-sm text-[#8C8C8C] dark:text-white/50">
          {searchQuery ? 'No emails match your search' : 'Nothing in this folder yet'}
        </p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto pb-6 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-[#E7E7E7] dark:[&::-webkit-scrollbar-thumb]:bg-[#252525]">
      {messages.map((m, index) => (
        <ThreadRow
          key={m.id}
          message={m}
          index={index}
          folder={folder}
          selected={selectedId === m.id}
          focused={focusedIndex === index}
          replies={threadCounts[m.threadId] ?? 1}
          onOpen={onOpen}
          onStar={onStar}
          onArchive={onArchive}
          onTrash={onTrash}
        />
      ))}
      {hasMore && (
        <div className="flex justify-center py-3">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoading}
            className="inline-flex h-7 items-center rounded-lg border border-[#E7E7E7] bg-white px-3 text-sm text-[#6D6D6D] transition-colors hover:bg-gray-100 disabled:opacity-60 dark:border-none dark:bg-[#313131] dark:text-white dark:hover:bg-[#404040]"
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  );
}

const ThreadRow = memo(function ThreadRow({
  message,
  index,
  folder,
  selected,
  focused,
  replies,
  onOpen,
  onStar,
  onArchive,
  onTrash,
}: {
  message: MailMessage;
  index: number;
  folder: FolderId;
  selected: boolean;
  focused: boolean;
  replies: number;
  onOpen: (m: MailMessage) => void;
  onStar: (m: MailMessage) => void;
  onArchive: (m: MailMessage) => void;
  onTrash: (m: MailMessage) => void;
}) {
  const isSent = folder === 'SENT' || folder === 'DRAFT';
  const unread = !message.isRead && !selected && !isSent;
  const person = isSent ? message.to[0] ?? message.from : message.from;
  const tipSide = index === 0 ? 'bottom' : 'top';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index, 12) * 0.015, ease: [0.16, 1, 0.3, 1] }}
      className="select-none border-b border-[#F0F0F0] dark:border-[#1A1A1A] md:my-1 md:border-none"
    >
      <MailHoverCard message={message} disabled={selected}>
      <div
        role="button"
        tabIndex={-1}
        data-mail-index={index}
        onClick={() => onOpen(message)}
        className={cn(
          'group relative mx-1 flex cursor-pointer flex-col items-start rounded-lg py-2 text-left text-sm transition-colors hover:bg-[#F5F5F5] dark:hover:bg-white/5',
          (selected || focused) && 'bg-black/5 dark:bg-white/5',
          focused && !selected && 'ring-1 ring-black/10 dark:ring-white/10',
        )}
      >
        {/* Hover action bar */}
        <div
          className={cn(
            'absolute right-2 z-20 flex -translate-y-1/2 items-center gap-1 rounded-xl border border-[#E7E7E7] bg-white p-1 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 dark:border-[#252525] dark:bg-[#1A1A1A]',
            index === 0 ? 'top-4' : 'top-[-1px]',
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <RowAction label={message.isStarred ? 'Unstar' : 'Star'} side={tipSide} onClick={() => onStar(message)}>
            <Star2
              className={cn(
                'h-4 w-4',
                message.isStarred
                  ? 'fill-yellow-400 stroke-yellow-400'
                  : 'fill-transparent stroke-[#9D9D9D]',
              )}
            />
          </RowAction>
          {folder !== 'TRASH' && folder !== 'SENT' && folder !== 'DRAFT' && (
            <RowAction label="Archive" side={tipSide} onClick={() => onArchive(message)}>
              <Archive2 className="fill-[#9D9D9D]" />
            </RowAction>
          )}
          {folder !== 'TRASH' && (
            <RowAction
              label="Move to bin"
              side={tipSide}
              onClick={() => onTrash(message)}
              className="hover:bg-[#FDE4E9] dark:hover:bg-[#411D23]"
            >
              <Trash className="fill-[#F43F5E]" />
            </RowAction>
          )}
        </div>

        <div className={cn('relative flex w-full items-center justify-between gap-4 px-6', !unread && 'opacity-60')}>
          <div className="shrink-0">
            <MailAvatar address={person} className={cn('h-8 w-8', !unread && 'border border-[#E7E7E7] dark:border-[#252525]')} />
            {unread && <span className="absolute left-2 top-3.5 size-1.5 rounded bg-[#006FFE]" />}
          </div>

          <div className="flex w-full min-w-0 flex-col">
            <div className="flex w-full min-w-0 items-center justify-between gap-3">
              <div className="flex w-[30%] min-w-0 shrink-0 items-center gap-1 max-xl:w-[38%]">
                <span className={cn('truncate text-sm text-black dark:text-white', unread ? 'font-bold' : 'font-medium')}>
                  {isSent ? `To: ${cleanName(person)}` : cleanName(person)}
                </span>
                {replies > 1 && <span className="shrink-0 text-xs opacity-70">[{replies}]</span>}
                {message.hasAttachments && (
                  <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 stroke-[#8C8C8C]" fill="none" strokeWidth="2">
                    <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                )}
              </div>
              <p className="min-w-0 flex-1 truncate text-start text-sm text-[#8C8C8C]">
                {message.subject || '(no subject)'}
              </p>
              <p
                className={cn(
                  'shrink-0 text-nowrap text-xs font-normal text-[#6D6D6D] opacity-70 transition-opacity group-hover:opacity-100 dark:text-[#8C8C8C]',
                  selected && 'opacity-100',
                )}
              >
                {formatMailDate(message.date)}
              </p>
            </div>
            {message.snippet && (
              <div className="mt-1.5 line-clamp-1 text-xs text-[#6D6D6D] dark:text-[#8C8C8C]">
                {decodeEntities(message.snippet)}
              </div>
            )}
          </div>
        </div>
      </div>
      </MailHoverCard>
    </motion.div>
  );
});

// Hover preview (Zero MailHoverCard): opens after 300ms, portalled so the scrolling list can't clip it.
function MailHoverCard({
  message,
  disabled,
  children,
}: {
  message: MailMessage;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  if (disabled) return <>{children}</>;
  const preview = (message.bodyPlain || decodeEntities(message.snippet || ''))
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return (
    <HoverCardPrimitive.Root openDelay={300} closeDelay={100}>
      <HoverCardPrimitive.Trigger asChild>{children}</HoverCardPrimitive.Trigger>
      <HoverCardPrimitive.Portal>
        <HoverCardPrimitive.Content
          side="bottom"
          align="start"
          sideOffset={4}
          collisionPadding={12}
          className="z-[70] w-[420px] max-w-[90vw] overflow-hidden rounded-xl border border-[#E7E7E7] bg-white p-4 text-left shadow-lg outline-none data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=top]:slide-in-from-bottom-2 dark:border-[#252525] dark:bg-[#1A1A1A]"
        >
          <div className="space-y-2">
            <div className="truncate text-sm font-semibold text-black dark:text-white">
              {message.subject || 'No subject'}
            </div>
            <div className="truncate text-xs text-[#6D6D6D] dark:text-[#8C8C8C]">
              From: {cleanName(message.from)} &lt;{message.from.email}&gt;
            </div>
            <div className="text-xs text-[#6D6D6D] dark:text-[#8C8C8C]">{formatFullDate(message.date)}</div>
            {preview && (
              <div className="line-clamp-5 whitespace-pre-line border-t border-[#E7E7E7] pt-2 text-sm text-[#3F3F46] dark:border-[#252525] dark:text-[#D4D4D8]">
                {preview}
              </div>
            )}
          </div>
        </HoverCardPrimitive.Content>
      </HoverCardPrimitive.Portal>
    </HoverCardPrimitive.Root>
  );
}

function RowAction({
  label,
  side,
  onClick,
  className,
  children,
}: {
  label: string;
  side: 'top' | 'bottom';
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('h-6 w-6 overflow-visible [&_svg]:size-3.5', className)}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side={side} className="mb-1 bg-white text-black dark:bg-[#1A1A1A] dark:text-white">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function decodeEntities(s: string) {
  return s
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

export function MailListSkeleton() {
  return (
    <div className="space-y-1 px-1 pt-1">
      {Array.from({ length: 9 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 rounded-lg px-6 py-3">
          <div className="size-8 shrink-0 animate-pulse rounded-full bg-[#F0F0F0] dark:bg-[#1F1F1F]" />
          <div className="flex w-full flex-col gap-2">
            <div className="flex items-center gap-4">
              <div className="h-3 w-[22%] animate-pulse rounded bg-[#F0F0F0] dark:bg-[#1F1F1F]" />
              <div className="h-3 flex-1 animate-pulse rounded bg-[#F5F5F5] dark:bg-[#1A1A1A]" />
              <div className="h-3 w-10 animate-pulse rounded bg-[#F0F0F0] dark:bg-[#1F1F1F]" />
            </div>
            <div className="h-2.5 w-[60%] animate-pulse rounded bg-[#F5F5F5] dark:bg-[#171717]" />
          </div>
        </div>
      ))}
    </div>
  );
}
