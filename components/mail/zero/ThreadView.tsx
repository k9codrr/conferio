'use client';

import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import DOMPurify from 'dompurify';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Archive2,
  ArrowsPointingIn,
  Expand,
  Forward,
  PanelLeftOpen,
  Phone,
  Printer,
  Reply,
  ReplyAll,
  Star,
  ThreeDots,
  Trash,
  X,
} from './icons';
import { MailAvatar } from './MailAvatar';
import { MailBody } from './MailBody';
import {
  cleanName,
  formatFullDate,
  formatMailDate,
  isMac,
  postAction,
  toHtmlBody,
  type FolderId,
  type MailMessage,
  type ThreadViewMode,
} from './lib';

// ── Header with close / fullscreen / popup-sidebar toggle (Zero ChatHeader) ─────────────
export function ThreadHeader({
  mode,
  onClose,
  onToggleFullScreen,
  onToggleMode,
}: {
  mode: ThreadViewMode;
  onClose: () => void;
  onToggleFullScreen: () => void;
  onToggleMode: () => void;
}) {
  const isFull = mode === 'fullscreen';
  return (
    <div className="relative flex items-center justify-between px-2.5 pb-[4px] pt-[5px]">
      <HeaderButton label="Close" onClick={onClose}>
        <X className="h-3.5 w-3.5 fill-[#6D6D6D] dark:fill-[#898989]" />
      </HeaderButton>
      <div className="flex items-center gap-1">
        <HeaderButton label={isFull ? 'Exit full screen' : 'Full screen'} onClick={onToggleFullScreen} className="hidden md:flex">
          {isFull ? (
            <ArrowsPointingIn className="fill-[#6D6D6D] dark:fill-[#898989]" />
          ) : (
            <Expand className="h-3.5 w-3.5 fill-[#6D6D6D] dark:fill-[#898989]" />
          )}
        </HeaderButton>
        {!isFull && (
          <HeaderButton label={mode === 'popup' ? 'Dock to side' : 'Pop out'} onClick={onToggleMode} className="hidden md:flex">
            {mode === 'popup' ? (
              <PanelLeftOpen className="fill-[#6D6D6D] dark:fill-[#898989]" />
            ) : (
              <Phone className="h-4 w-3 fill-[#6D6D6D] dark:fill-[#898989]" />
            )}
          </HeaderButton>
        )}
      </div>
    </div>
  );
}

function HeaderButton({
  label,
  onClick,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button onClick={onClick} variant="ghost" className={cn('h-7 px-2', className)}>
          {children}
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

// ── Thread body ────────────────────────────────────────────────────────────────
interface ThreadViewProps {
  message: MailMessage;
  related: MailMessage[];
  folder: FolderId;
  onStar: (m: MailMessage) => void;
  onArchive: (m: MailMessage) => void;
  onTrash: (m: MailMessage) => void;
  onForward: (m: MailMessage) => void;
  onSent: () => void;
}

export function ThreadView({ message, related, folder, onStar, onArchive, onTrash, onForward, onSent }: ThreadViewProps) {
  const [replyMode, setReplyMode] = useState<null | 'reply' | 'replyAll'>(null);
  useEffect(() => setReplyMode(null), [message.id]);

  const people = [message.from, ...message.to].filter(
    (p, i, arr) => p?.email && arr.findIndex((x) => x.email === p.email) === i,
  );
  const thread = related.length ? related : [message];

  const print = () => {
    const w = window.open('', '_blank', 'width=800,height=900');
    if (!w) return;
    w.opener = null;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const content = DOMPurify.sanitize(message.body || `<pre>${esc(message.bodyPlain || '')}</pre>`, {
      FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form'],
    });
    w.document.write(
      `<title>${esc(message.subject || '')}</title><h2>${esc(message.subject || '')}</h2>` +
        `<p><b>${esc(cleanName(message.from))}</b> &lt;${esc(message.from.email)}&gt; · ${esc(formatFullDate(message.date))}</p><hr/>` +
        content,
    );
    w.document.close();
    w.print();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="flex shrink-0 items-center px-3 pb-[11px] pt-[6px]">
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setReplyMode(message.to.length > 1 ? 'replyAll' : 'reply')}
            className="inline-flex h-7 items-center justify-center gap-1 overflow-hidden rounded-lg border border-[#E7E7E7] bg-white px-1.5 transition-colors hover:bg-gray-100 dark:border-none dark:bg-[#313131] dark:hover:bg-[#404040]"
          >
            <ReplyAll className="fill-[#6D6D6D] dark:fill-[#9B9B9B]" />
            <span className="whitespace-nowrap pl-0.5 pr-1 text-sm leading-none text-black dark:text-white">
              {message.to.length > 1 ? 'Reply all' : 'Reply'}
            </span>
          </button>
          <ToolbarIcon label={message.isStarred ? 'Unstar' : 'Star'} onClick={() => onStar(message)}>
            <Star
              className={cn(
                'ml-[2px] mt-[2.4px] h-5 w-5',
                message.isStarred ? 'fill-yellow-400 stroke-yellow-400' : 'fill-transparent stroke-[#9D9D9D]',
              )}
            />
          </ToolbarIcon>
          {folder !== 'TRASH' && folder !== 'SENT' && folder !== 'DRAFT' && (
            <ToolbarIcon label="Archive" onClick={() => onArchive(message)}>
              <Archive2 className="h-4 w-4 fill-[#6D6D6D] dark:fill-[#898989]" />
            </ToolbarIcon>
          )}
          {folder !== 'TRASH' && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => onTrash(message)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#FCCDD5] bg-[#FDE4E9] transition-colors hover:bg-[#fccdd5]/70 dark:border-[#6E2532] dark:bg-[#411D23] dark:hover:bg-[#6E2532]/70"
                >
                  <Trash className="fill-[#F43F5E]" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-white text-black dark:bg-[#313131] dark:text-white">
                Move to bin
              </TooltipContent>
            </Tooltip>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="More actions"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-white transition-colors hover:bg-gray-100 focus:outline-none dark:bg-[#313131] dark:hover:bg-[#404040]"
              >
                <ThreeDots className="fill-[#6D6D6D] dark:fill-[#898989]" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl bg-white dark:bg-[#313131]">
              <DropdownMenuItem onClick={() => setReplyMode('reply')}>
                <Reply className="mr-2 fill-[#6D6D6D] dark:fill-[#898989]" /> Reply
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onForward(message)}>
                <Forward className="mr-2 fill-[#6D6D6D] dark:fill-[#898989]" /> Forward
              </DropdownMenuItem>
              <DropdownMenuItem onClick={print}>
                <Printer className="mr-2 h-4 w-4 fill-[#6D6D6D] dark:fill-[#898989]" /> Print
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Messages */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={message.id}
          initial={{ opacity: 0, x: 25 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -25 }}
          transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
          className="min-h-0 flex-1 overflow-y-auto pb-4 [scrollbar-width:thin]"
        >
          <div className="border-b border-[#E7E7E7] px-4 py-4 dark:border-[#252525]">
            <span className="font-medium text-black dark:text-white">
              {message.subject || '(no subject)'}{' '}
              {thread.length > 1 && <span className="text-[#8C8C8C]">[{thread.length}]</span>}
            </span>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-[#8C8C8C]">
              {message.labelIds
                .filter((l) => ['IMPORTANT', 'STARRED'].includes(l) || l.startsWith('CATEGORY_'))
                .slice(0, 3)
                .map((l) => (
                  <span
                    key={l}
                    className="rounded-md bg-[#F0F0F0] px-1.5 py-0.5 text-[11px] capitalize text-[#6D6D6D] dark:bg-[#262626] dark:text-[#A1A1A1]"
                  >
                    {l.replace('CATEGORY_', '').toLowerCase()}
                  </span>
                ))}
              {people.slice(0, 2).map((p) => (
                <span key={p.email} className="truncate">
                  {cleanName(p)}
                </span>
              ))}
              {people.length > 2 && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span>+{people.length - 2} {people.length - 2 === 1 ? 'other' : 'others'}</span>
                  </TooltipTrigger>
                  <TooltipContent className="flex flex-col gap-1">
                    {people.slice(2).map((p) => (
                      <span key={p.email}>{cleanName(p)}</span>
                    ))}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          </div>

          {thread.map((m, i) => (
            <MessageBlock key={m.id} message={m} collapsedByDefault={i < thread.length - 1} />
          ))}

          <AnimatePresence>
            {replyMode && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 12 }}
                transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
                className="sticky bottom-0 z-10 border-t border-[#E7E7E7] bg-white px-4 py-3 dark:border-[#252525] dark:bg-[#101010]"
              >
                <ReplyComposer
                  message={message}
                  mode={replyMode}
                  onClose={() => setReplyMode(null)}
                  onSent={() => {
                    setReplyMode(null);
                    onSent();
                  }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function ToolbarIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          className="inline-flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white transition-colors hover:bg-gray-100 dark:bg-[#313131] dark:hover:bg-[#404040]"
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="bg-white text-black dark:bg-[#313131] dark:text-white">
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function MessageBlock({ message, collapsedByDefault }: { message: MailMessage; collapsedByDefault: boolean }) {
  const [collapsed, setCollapsed] = useState(collapsedByDefault);
  return (
    <div className="border-b border-[#F0F0F0] last:border-none dark:border-[#1A1A1A]">
      <div className="flex cursor-pointer flex-col pb-2" onClick={() => setCollapsed((c) => !c)}>
        <div className="mt-3 flex w-full items-start gap-4 px-4">
          <MailAvatar address={message.from} className="mt-1 h-8 w-8" />
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex w-full items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1">
                <span className="truncate font-semibold text-black dark:text-white">{cleanName(message.from)}</span>
                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-md p-1.5 hover:bg-[#6D6D6D]/10 dark:hover:bg-[#898989]/20"
                    >
                      <span className="text-xs text-[#8C8C8C] underline">Details</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    onClick={(e) => e.stopPropagation()}
                    className="w-[420px] max-w-[90vw] rounded-lg border p-4 text-left shadow-lg dark:bg-[#1A1A1A]"
                  >
                    <div className="space-y-1 text-sm">
                      <DetailRow label="From" value={`${cleanName(message.from)} <${message.from.email}>`} />
                      <DetailRow label="To" value={message.to.map((t) => t.email).join(', ')} />
                      <DetailRow label="Date" value={formatFullDate(message.date)} />
                      <DetailRow label="Mailed-by" value={message.from.email.split('@')[1] ?? ''} />
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
              <span className="shrink-0 text-xs text-[#8C8C8C]">{formatMailDate(message.date)}</span>
            </div>
            <span className="truncate text-xs text-[#8C8C8C]">
              To: {message.to.map((t) => cleanName(t)).join(', ')}
            </span>
          </div>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-1 text-black dark:text-white">
              <MailBody html={message.body} plain={message.bodyPlain} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex">
      <span className="w-24 shrink-0 text-end text-gray-500">{label}:</span>
      <span className="ml-3 break-all text-[#8C8C8C]">{value}</span>
    </div>
  );
}

// ── Inline reply composer (Zero ReplyCompose) ─────────────────────────────────────
function ReplyComposer({
  message,
  mode,
  onClose,
  onSent,
}: {
  message: MailMessage;
  mode: 'reply' | 'replyAll';
  onClose: () => void;
  onSent: () => void;
}) {
  const recipients =
    mode === 'replyAll'
      ? [message.from, ...message.to].map((p) => p.email).filter((e, i, a) => a.indexOf(e) === i)
      : [message.from.email];
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => ref.current?.focus(), []);

  const send = async () => {
    if (!body.trim()) return setError('Write a message first');
    setSending(true);
    setError(null);
    try {
      await postAction({
        action: 'send',
        to: recipients,
        subject: message.subject?.startsWith('Re:') ? message.subject : `Re: ${message.subject}`,
        emailBody: toHtmlBody(body),
        replyToMessageId: message.id,
        threadId: message.threadId,
      });
      onSent();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[#E7E7E7] bg-[#FFFFFF] dark:border-[#252525] dark:bg-[#1A1A1A]">
      <div className="flex items-center gap-2 border-b border-[#E7E7E7] px-3 py-2 dark:border-[#252525]">
        <p className="text-sm font-medium text-[#8C8C8C]">To:</p>
        <p className="min-w-0 flex-1 truncate text-sm text-black dark:text-white/90">{recipients.join(', ')}</p>
        <button type="button" onClick={onClose} className="rounded p-1 transition-colors hover:bg-gray-50 dark:hover:bg-[#404040]">
          <X className="h-3 w-3 fill-[#9A9A9A]" />
        </button>
      </div>
      <textarea
        ref={ref}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Write your reply…"
        className="min-h-[110px] w-full resize-none bg-transparent px-3 py-3 text-sm text-black outline-none placeholder:text-[#797979] dark:bg-[#202020] dark:text-white/90"
      />
      {error && <p className="px-3 pb-2 text-xs text-[#F43F5E]">{error}</p>}
      <div className="flex items-center justify-between rounded-b-2xl px-3 py-2.5 dark:bg-[#202020]">
        <SendButton onClick={send} sending={sending} />
        <button type="button" onClick={onClose} className="text-sm text-[#8C8C8C] transition-colors hover:text-black dark:hover:text-white">
          Discard
        </button>
      </div>
    </div>
  );
}

export function SendButton({ onClick, sending, label = 'Send' }: { onClick: () => void; sending: boolean; label?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      onClick={onClick}
      disabled={sending}
      className="h-7 gap-1.5 rounded-md bg-black px-2 text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
    >
      <span className="text-sm leading-none">{sending ? 'Sending…' : label}</span>
      <span className="flex h-5 items-center gap-0.5 rounded-sm bg-white/10 px-1 text-[11px] dark:bg-black/10">
        {isMac ? '⌘' : 'Ctrl'} ↵
      </span>
    </Button>
  );
}
