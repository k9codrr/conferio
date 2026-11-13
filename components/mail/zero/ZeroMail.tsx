'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Geist, Geist_Mono } from 'next/font/google';
import toast from 'react-hot-toast';
import { cn } from '@/lib/utils';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import ThinSidebar from '@/components/ui/thinSidebar';
import { PanelLeftOpen, Search, X } from './icons';
import { MailSidebar } from './MailSidebar';
import { MailList } from './MailList';
import { ThreadHeader, ThreadView } from './ThreadView';
import { ComposeDialog, type ComposeDraft } from './ComposeDialog';
import {
  API,
  CATEGORY_COLORS,
  cleanName,
  formatFullDate,
  isMac,
  postAction,
  type FolderId,
  type MailMessage,
  type ThreadViewMode,
} from './lib';

const geist = Geist({ subsets: ['latin'], variable: '--font-geist-sans' });
const geistMono = Geist_Mono({ subsets: ['latin'], variable: '--font-geist-mono' });

const FOLDER_TITLES: Record<FolderId, string> = {
  INBOX: 'Inbox',
  IMPORTANT: 'Important',
  STARRED: 'Starred',
  SENT: 'Sent',
  DRAFT: 'Drafts',
  SPAM: 'Spam',
  TRASH: 'Bin',
};

function useIsDesktop() {
  const [desktop, setDesktop] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);
  return desktop;
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName);
}

export default function ZeroMail() {
  const isDesktop = useIsDesktop();

  // ── navigation state ──
  const [folder, setFolder] = useState<FolderId>('INBOX');
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [viewMode, setViewMode] = useState<ThreadViewMode>('sidebar');

  // ── data state ──
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [listReady, setListReady] = useState(false); // first inbox page has arrived

  // ── compose ──
  const [composeOpen, setComposeOpen] = useState(false);
  const [draft, setDraft] = useState<ComposeDraft | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();
  const requestId = useRef(0);

  // persisted UI preferences
  useEffect(() => {
    setCollapsed(localStorage.getItem('mail-sidebar-collapsed') === 'true');
    const vm = localStorage.getItem('mail-thread-view') as ThreadViewMode | null;
    if (vm === 'sidebar' || vm === 'popup') setViewMode(vm);
  }, []);
  useEffect(() => localStorage.setItem('mail-sidebar-collapsed', String(collapsed)), [collapsed]);
  useEffect(() => {
    if (viewMode !== 'fullscreen') localStorage.setItem('mail-thread-view', viewMode);
  }, [viewMode]);

  const fetchMessages = useCallback(
    async (opts: { folder: FolderId; category: string | null; q: string; pageToken?: string }) => {
      const id = ++requestId.current;
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ label: opts.folder });
        const query = [opts.category ? `category:${opts.category}` : '', opts.q.trim()].filter(Boolean).join(' ');
        if (query) params.set('q', query);
        if (opts.pageToken) params.set('pageToken', opts.pageToken);
        const res = await fetch(`${API}?${params}`);
        const data = await res.json();
        if (id !== requestId.current) return; // a newer request superseded this one
        if (!res.ok) throw new Error(data.error ?? 'Failed to load mail');
        setMessages((prev) => (opts.pageToken ? [...prev, ...(data.messages ?? [])] : data.messages ?? []));
        setNextPageToken(data.nextPageToken);
        setListReady(true);
      } catch (e) {
        if (id === requestId.current) setError(e instanceof Error ? e.message : 'Unknown error');
      } finally {
        if (id === requestId.current) setIsLoading(false);
      }
    },
    [],
  );

  const fetchUnread = useCallback(async () => {
    try {
      const res = await fetch(`${API}?unreadCount=true`);
      const data = await res.json();
      if (res.ok) setUnreadCount(data.unreadCount ?? 0);
    } catch {
      /* non-critical */
    }
  }, []);

  useEffect(() => {
    void fetchUnread();
  }, [fetchUnread]);

  useEffect(() => {
    setSelectedId(null);
    setFocusedIndex(-1);
    void fetchMessages({ folder, category, q: search });
    // search is debounced separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder, category, fetchMessages]);

  const refresh = useCallback(() => {
    void fetchMessages({ folder, category, q: search });
    void fetchUnread();
  }, [fetchMessages, fetchUnread, folder, category, search]);

  const handleSearch = (value: string) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void fetchMessages({ folder, category, q: value });
    }, 350);
  };

  const navigate = (f: FolderId, c?: string | null) => {
    setFolder(f);
    setCategory(f === 'INBOX' ? c ?? null : null);
    setSearch('');
  };

  // ── derived ──
  const selected = useMemo(() => messages.find((m) => m.id === selectedId) ?? null, [messages, selectedId]);
  const threadCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const m of messages) counts[m.threadId] = (counts[m.threadId] ?? 0) + 1;
    return counts;
  }, [messages]);
  const related = useMemo(
    () =>
      selected
        ? messages
            .filter((m) => m.threadId === selected.threadId)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        : [],
    [messages, selected],
  );

  // ── actions (optimistic) ──
  const openMessage = useCallback(
    (m: MailMessage) => {
      setSelectedId(m.id);
      setFocusedIndex(messages.findIndex((x) => x.id === m.id));
      if (!m.isRead) {
        setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, isRead: true } : x)));
        if (folder === 'INBOX') setUnreadCount((c) => Math.max(0, c - 1));
        postAction({ action: 'read', messageId: m.id }).catch(() => undefined);
      }
    },
    [messages, folder],
  );

  // Deep link: /mail?id=<gmailMessageId> (used by the dashboard activity feed) opens that message.
  const deepLinkId = useRef<string | null>(null);
  useEffect(() => {
    deepLinkId.current = new URLSearchParams(window.location.search).get('id');
  }, []);
  useEffect(() => {
    const id = deepLinkId.current;
    if (!id || !listReady || isLoading || folder !== 'INBOX') return;
    deepLinkId.current = null;
    const clearParam = () => window.history.replaceState(null, '', window.location.pathname);

    const inList = messages.find((m) => m.id === id);
    if (inList) {
      openMessage(inList);
      clearParam();
      return;
    }
    // Not on the first page: fetch it on its own (the API marks it read) and put it on top.
    void (async () => {
      try {
        const res = await fetch(`${API}?messageId=${encodeURIComponent(id)}`);
        const data = await res.json();
        if (!res.ok || !data.message) throw new Error(data.error ?? 'Message not found');
        setMessages((prev) => [{ ...data.message, isRead: true }, ...prev.filter((m) => m.id !== id)]);
        setSelectedId(id);
        setFocusedIndex(0);
      } catch {
        toast.error('Could not open that email');
      } finally {
        clearParam();
      }
    })();
  }, [listReady, isLoading, messages, folder, openMessage]);

  const toggleStar = useCallback(async (m: MailMessage) => {
    const starred = !m.isStarred;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, isStarred: starred } : x)));
    try {
      await postAction({ action: 'star', messageId: m.id, starred });
    } catch {
      setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, isStarred: !starred } : x)));
      toast.error('Could not update star');
    }
  }, []);

  const removeOptimistic = useCallback(
    async (m: MailMessage, action: 'archive' | 'trash') => {
      const snapshot = messages;
      setMessages((prev) => prev.filter((x) => x.id !== m.id));
      if (selectedId === m.id) setSelectedId(null);
      try {
        await postAction({ action, messageId: m.id });
        toast.success(action === 'archive' ? 'Archived' : 'Moved to bin');
      } catch (e) {
        setMessages(snapshot);
        toast.error(e instanceof Error ? e.message : 'Action failed');
      }
    },
    [messages, selectedId],
  );

  const openCompose = (d: ComposeDraft | null = null) => {
    setDraft(d);
    setComposeOpen(true);
  };

  const forward = (m: MailMessage) =>
    openCompose({
      subject: m.subject?.startsWith('Fwd:') ? m.subject : `Fwd: ${m.subject}`,
      body: `\n\n---------- Forwarded message ----------\nFrom: ${cleanName(m.from)} <${m.from.email}>\nDate: ${formatFullDate(m.date)}\nSubject: ${m.subject}\n\n${m.bodyPlain || m.snippet}`,
    });

  const closeThread = useCallback(() => {
    setSelectedId(null);
    if (viewMode === 'fullscreen') setViewMode('sidebar');
  }, [viewMode]);

  // ── keyboard shortcuts (Zero-style) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (collapsed) setCollapsed(false);
        searchRef.current?.focus();
        return;
      }
      if (composeOpen || isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      const current = focusedIndex >= 0 ? messages[focusedIndex] : selected;
      switch (e.key) {
        case '/':
          e.preventDefault();
          searchRef.current?.focus();
          break;
        case 'c':
          e.preventDefault();
          openCompose();
          break;
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          setFocusedIndex((i) => Math.min(messages.length - 1, i + 1));
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          setFocusedIndex((i) => Math.max(0, i - 1));
          break;
        case 'Enter':
        case 'o':
          if (focusedIndex >= 0 && messages[focusedIndex]) openMessage(messages[focusedIndex]);
          break;
        case 'Escape':
          if (selectedId) closeThread();
          else setFocusedIndex(-1);
          break;
        case 's':
          if (current) void toggleStar(current);
          break;
        case 'e':
          if (current && !['TRASH', 'SENT', 'DRAFT'].includes(folder)) void removeOptimistic(current, 'archive');
          break;
        case '#':
          if (current && folder !== 'TRASH') void removeOptimistic(current, 'trash');
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [collapsed, composeOpen, focusedIndex, messages, selected, selectedId, folder, openMessage, toggleStar, removeOptimistic, closeThread]);

  // keep the keyboard-focused row in view
  useEffect(() => {
    if (focusedIndex < 0) return;
    document.querySelector(`[data-mail-index="${focusedIndex}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [focusedIndex]);

  const progressColor = CATEGORY_COLORS[category ?? 'primary'] ?? '#006FFE';
  const title = category ? category[0].toUpperCase() + category.slice(1) : FOLDER_TITLES[folder];
  const showDocked = !!selected && isDesktop && viewMode === 'sidebar';

  const threadProps = selected && {
    message: selected,
    related,
    folder,
    onStar: toggleStar,
    onArchive: (m: MailMessage) => void removeOptimistic(m, 'archive'),
    onTrash: (m: MailMessage) => void removeOptimistic(m, 'trash'),
    onForward: forward,
    onSent: () => {
      toast.success('Reply sent');
      refresh();
    },
  };
  const header = (
    <ThreadHeader
      mode={viewMode}
      onClose={closeThread}
      onToggleFullScreen={() => setViewMode((v) => (v === 'fullscreen' ? 'sidebar' : 'fullscreen'))}
      onToggleMode={() => setViewMode((v) => (v === 'popup' ? 'sidebar' : 'popup'))}
    />
  );

  return (
    <TooltipProvider delayDuration={0}>
      <div
        className={cn(
          geist.variable,
          geistMono.variable,
          'flex h-screen w-full overflow-hidden bg-[#FAFAFA] text-black antialiased [--icon-color:#6D6D6D] dark:bg-[#080808] dark:text-white dark:[--icon-color:#898989]',
        )}
        style={{ fontFamily: 'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif' }}
      >
        <ThinSidebar />
        <MailSidebar
          collapsed={collapsed}
          folder={folder}
          category={category}
          unreadCount={unreadCount}
          onNavigate={navigate}
          onCompose={() => openCompose()}
          onSearch={() => searchRef.current?.focus()}
        />

        <main className="relative flex min-w-0 flex-1 md:pr-1 md:pt-1">
          <ResizablePanelGroup direction="horizontal" autoSaveId="conferio-mail-layout" className="min-w-0">
            <ResizablePanel
              id="mail-list"
              order={1}
              defaultSize={showDocked ? 45 : 100}
              minSize={30}
              className="mb-1 flex min-w-0 flex-col overflow-hidden border-[#E7E7E7] bg-white shadow-sm dark:border-[#27272A] dark:bg-[#101010] md:ml-1 md:rounded-2xl md:border"
            >
              {/* List header */}
              <div className="sticky top-0 z-10 shrink-0 p-2 pb-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-1">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={() => setCollapsed((c) => !c)}
                          className="hidden h-8 w-8 items-center justify-center rounded-lg transition-colors hover:bg-[#F0F0F0] dark:hover:bg-[#1F1F1F] md:inline-flex"
                        >
                          <PanelLeftOpen className="fill-[#6D6D6D] dark:fill-[#898989]" />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">{collapsed ? 'Expand sidebar' : 'Collapse sidebar'}</TooltipContent>
                    </Tooltip>
                    <motion.h1
                      key={title}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="truncate px-1 text-sm font-medium text-black dark:text-white"
                    >
                      {title}
                    </motion.h1>
                  </div>

                  <div className="flex min-w-0 flex-1 items-center justify-end gap-2">
                    <div className="relative w-full max-w-[340px]">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 fill-[#6D6D6D] dark:fill-[#898989]" />
                      <input
                        ref={searchRef}
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            handleSearch('');
                            e.currentTarget.blur();
                          }
                        }}
                        placeholder={`Search ${title.toLowerCase()}`}
                        className="h-8 w-full rounded-lg border border-[#E7E7E7] bg-[#FAFAFA] pl-8 pr-14 text-sm text-black outline-none transition-colors placeholder:text-[#8C8C8C] focus:border-[#006FFE]/50 dark:border-[#262626] dark:bg-[#0A0A0A] dark:text-white"
                      />
                      {search ? (
                        <button
                          type="button"
                          onClick={() => handleSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
                        >
                          <X className="h-2.5 w-2.5 fill-[#8C8C8C]" />
                        </button>
                      ) : (
                        <kbd className="pointer-events-none absolute right-2 top-1/2 flex h-4 -translate-y-1/2 items-center rounded border border-[#E7E7E7] bg-white px-1 text-[10px] text-[#8C8C8C] dark:border-[#262626] dark:bg-[#1A1A1A]">
                          {isMac ? '⌘' : 'Ctrl'} K
                        </kbd>
                      )}
                    </div>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          type="button"
                          onClick={refresh}
                          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors hover:bg-[#F0F0F0] dark:hover:bg-[#1F1F1F]"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            strokeWidth="2"
                            className={cn('h-4 w-4 stroke-[#6D6D6D] dark:stroke-[#898989]', isLoading && 'animate-spin')}
                          >
                            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                            <path d="M3 3v5h5" />
                            <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                            <path d="M16 16h5v5" />
                          </svg>
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom">Refresh</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {/* Fetch progress line */}
              <div className="shrink-0 px-4 pt-2">
                <div
                  className={cn('h-0.5 w-full rounded-full transition-opacity', isLoading ? 'opacity-100' : 'opacity-0')}
                  style={{ backgroundColor: progressColor }}
                />
              </div>

              <div className="relative min-h-0 flex-1 overflow-hidden">
                <MailList
                  messages={messages}
                  folder={folder}
                  selectedId={selectedId}
                  focusedIndex={focusedIndex}
                  isLoading={isLoading}
                  error={error}
                  hasMore={!!nextPageToken}
                  searchQuery={search}
                  threadCounts={threadCounts}
                  onOpen={openMessage}
                  onStar={toggleStar}
                  onArchive={(m) => void removeOptimistic(m, 'archive')}
                  onTrash={(m) => void removeOptimistic(m, 'trash')}
                  onLoadMore={() => void fetchMessages({ folder, category, q: search, pageToken: nextPageToken })}
                />
              </div>
            </ResizablePanel>

            {showDocked && threadProps && (
              <>
                <ResizableHandle className="w-1 bg-transparent opacity-0" />
                <ResizablePanel
                  id="mail-thread"
                  order={2}
                  defaultSize={55}
                  minSize={30}
                  className="mb-1 ml-0.5 flex min-w-0 flex-col overflow-hidden rounded-2xl border border-[#E7E7E7] bg-white shadow-sm dark:border-[#27272A] dark:bg-[#101010]"
                >
                  <motion.div
                    initial={{ opacity: 0, x: 24 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="flex h-full min-h-0 flex-col"
                  >
                    {header}
                    <div className="min-h-0 flex-1">
                      <ThreadView {...threadProps} />
                    </div>
                  </motion.div>
                </ResizablePanel>
              </>
            )}
          </ResizablePanelGroup>
        </main>

        {/* Popup / fullscreen thread (desktop) and drawer (mobile) */}
        <AnimatePresence>
          {selected && threadProps && (!isDesktop || viewMode !== 'sidebar') && (
            <motion.div
              key="thread-floating"
              initial={!isDesktop ? { x: '100%' } : { opacity: 0, y: 24, scale: 0.98 }}
              animate={!isDesktop ? { x: 0 } : { opacity: 1, y: 0, scale: 1 }}
              exit={!isDesktop ? { x: '100%' } : { opacity: 0, y: 24, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className={cn(
                'fixed z-50 flex flex-col overflow-hidden bg-white dark:bg-[#1A1A1A]',
                !isDesktop && 'inset-0',
                isDesktop && viewMode === 'popup' &&
                  'bottom-4 right-4 h-[640px] max-h-[85vh] w-[520px] max-w-[96vw] rounded-2xl border border-[#E7E7E7] shadow-2xl dark:border-[#252525]',
                isDesktop && viewMode === 'fullscreen' && 'inset-0',
              )}
            >
              {header}
              <div className="min-h-0 flex-1">
                <ThreadView {...threadProps} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <ComposeDialog
          open={composeOpen}
          draft={draft}
          onClose={() => setComposeOpen(false)}
          onSent={refresh}
        />
      </div>
    </TooltipProvider>
  );
}
