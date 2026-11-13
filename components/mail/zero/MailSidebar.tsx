'use client';

import { motion } from 'framer-motion';
import { SendHorizontal } from 'lucide-react';
import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { cn } from '@/lib/utils';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  BellIcon,
  Bin,
  ExclamationTriangle,
  Folder,
  Inbox,
  Lightning,
  MessageSquare,
  OldPhone,
  PencilCompose,
  Search,
  SettingsGear,
  Star,
  Tag,
  Users,
} from './icons';
import { isMac, type FolderId } from './lib';

type IconCmp = (p: { className?: string }) => JSX.Element;

// Sent uses the send-horizontal glyph (as in the Zero nav); stroke follows --icon-color.
const SentIcon: IconCmp = ({ className }) => (
  <SendHorizontal className={cn(className, 'text-[color:var(--icon-color)]')} strokeWidth={2} />
);

interface NavEntry {
  id: string;
  title: string;
  icon: IconCmp;
  folder: FolderId;
  category?: string;
  count?: number;
}

interface MailSidebarProps {
  collapsed: boolean;
  folder: FolderId;
  category: string | null;
  unreadCount: number;
  onNavigate: (folder: FolderId, category?: string | null) => void;
  onCompose: () => void;
  onSearch: () => void;
}

export function MailSidebar({
  collapsed,
  folder,
  category,
  unreadCount,
  onNavigate,
  onCompose,
  onSearch,
}: MailSidebarProps) {
  const { data: session } = useSession();

  const views: NavEntry[] = [
    { id: 'inbox', title: 'Inbox', icon: Inbox, folder: 'INBOX', count: unreadCount },
    { id: 'social', title: 'Social', icon: Users, folder: 'INBOX', category: 'social' },
    { id: 'updates', title: 'Updates', icon: BellIcon, folder: 'INBOX', category: 'updates' },
    { id: 'forums', title: 'Forums', icon: MessageSquare, folder: 'INBOX', category: 'forums' },
    { id: 'promotions', title: 'Promotions', icon: Tag, folder: 'INBOX', category: 'promotions' },
  ];
  const mail: NavEntry[] = [
    { id: 'important', title: 'Important', icon: Lightning, folder: 'IMPORTANT' },
    { id: 'starred', title: 'Starred', icon: Star, folder: 'STARRED' },
    { id: 'sent', title: 'Sent', icon: SentIcon, folder: 'SENT' },
    { id: 'drafts', title: 'Drafts', icon: Folder, folder: 'DRAFT' },
    { id: 'spam', title: 'Spam', icon: ExclamationTriangle, folder: 'SPAM' },
    { id: 'bin', title: 'Bin', icon: Bin, folder: 'TRASH' },
  ];

  const isActive = (e: NavEntry) =>
    e.folder === folder && (e.category ?? null) === (folder === 'INBOX' ? category : null);

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 56 : 256 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="hidden h-screen shrink-0 select-none flex-col overflow-hidden bg-[#FAFAFA] dark:bg-[#080808] md:flex"
    >
      {/* Header: account + compose + search */}
      <div className={cn('flex flex-col gap-2 pt-2.5', collapsed ? 'px-2' : 'px-4')}>
        <div className={cn('flex items-center gap-2 py-1', collapsed && 'justify-center')}>
          <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[#006FFE] text-[13px] font-semibold text-white">
            {session?.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="size-full object-cover" />
            ) : (
              (session?.user?.name?.[0] ?? 'M').toUpperCase()
            )}
          </div>
          {!collapsed && (
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[13px] font-medium text-black dark:text-white">
                {session?.user?.name ?? 'Mail'}
              </p>
              <p className="truncate text-xs text-[#6D6D6D] dark:text-[#898989]">
                {session?.user?.email}
              </p>
            </div>
          )}
        </div>

        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={onCompose}
                className="mb-1.5 inline-flex h-8 w-full items-center justify-center rounded-lg bg-[#006FFE] text-white transition-colors hover:bg-[#0056CC]"
              >
                <PencilCompose className="h-3.5 w-3.5 fill-white" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">New email</TooltipContent>
          </Tooltip>
        ) : (
          <>
            <button
              type="button"
              onClick={onCompose}
              className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#006FFE] text-sm font-medium text-white transition-colors hover:bg-[#0056CC]"
            >
              <PencilCompose className="h-3.5 w-3.5 fill-white" />
              New email
            </button>
            <button
              type="button"
              onClick={onSearch}
              className="relative flex h-8 w-full items-center rounded-lg border border-[#E7E7E7] bg-white/50 pl-3 text-left text-sm text-[#6D6D6D] backdrop-blur-sm transition-all hover:bg-[#F0F0F0] dark:border-[#262626] dark:bg-black dark:text-[#898989] dark:hover:bg-[#141414]"
            >
              <Search className="h-4 w-4 fill-[#6D6D6D] dark:fill-[#898989]" />
              <span className="ml-3 truncate">Search</span>
              <kbd className="pointer-events-none absolute right-2 flex h-4 items-center gap-0.5 rounded border border-[#E7E7E7] bg-[#F5F5F5] px-1 text-[10px] font-medium opacity-80 dark:border-[#262626] dark:bg-[#1A1A1A]">
                {isMac ? '⌘' : 'Ctrl'} K
              </kbd>
            </button>
          </>
        )}
      </div>

      {/* Navigation */}
      <nav
        className={cn(
          'mt-5 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          collapsed ? 'px-2' : 'px-4',
        )}
      >
        <NavSection title="Views" items={views} collapsed={collapsed} isActive={isActive} onNavigate={onNavigate} />
        <NavSection title="Mail" items={mail} collapsed={collapsed} isActive={isActive} onNavigate={onNavigate} />
      </nav>

      {/* Footer */}
      <div className={cn('space-y-1 pb-3', collapsed ? 'px-2' : 'px-4')}>
        <FooterLink collapsed={collapsed} href="/settings/integrations" icon={SettingsGear} title="Settings" />
        <FooterLink collapsed={collapsed} href="mailto:support@conferio.app" icon={OldPhone} title="Support" />
      </div>
    </motion.aside>
  );
}

function NavSection({
  title,
  items,
  collapsed,
  isActive,
  onNavigate,
}: {
  title: string;
  items: NavEntry[];
  collapsed: boolean;
  isActive: (e: NavEntry) => boolean;
  onNavigate: (folder: FolderId, category?: string | null) => void;
}) {
  return (
    <div>
      {collapsed ? (
        <div className="mx-2 mb-3 mt-2 h-[0.5px] bg-[#6D6D6D]/50 dark:bg-[#262626]" />
      ) : (
        <p className="mx-2 mb-2 text-[13px] text-[#6D6D6D] dark:text-[#898989]">{title}</p>
      )}
      <div className="space-y-1">
        {items.map((item) => {
          const active = isActive(item);
          const btn = (
            <button
              type="button"
              onClick={() => onNavigate(item.folder, item.category ?? null)}
              className={cn(
                'relative flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] text-[#3F3F46] transition-colors hover:bg-[#EAEAEA] dark:text-[#D4D4D8] dark:hover:bg-[#202020]',
                active && 'font-medium text-black [--icon-color:#000] dark:text-white dark:[--icon-color:#fff]',
                collapsed && 'justify-center px-0',
              )}
            >
              {active && (
                <motion.span
                  layoutId="mail-nav-active"
                  className="absolute inset-0 rounded-lg bg-[#EAEAEA] dark:bg-[#202020]"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative flex size-4 shrink-0 items-center justify-center [&>svg]:max-h-4 [&>svg]:max-w-4">
                <item.icon
                  className={cn(
                    'h-4 w-4 shrink-0 fill-[#6D6D6D] dark:fill-[#898989]',
                    active && 'fill-black dark:fill-white',
                  )}
                />
              </span>
              {!collapsed && (
                <>
                  <span className="relative min-w-0 flex-1 truncate">{item.title}</span>
                  {!!item.count && (
                    <span className="relative ml-auto shrink-0 text-xs text-[#6D6D6D] dark:text-[#898989]">
                      {item.count.toLocaleString()}
                    </span>
                  )}
                </>
              )}
            </button>
          );
          return collapsed ? (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{btn}</TooltipTrigger>
              <TooltipContent side="right">{item.title}</TooltipContent>
            </Tooltip>
          ) : (
            <div key={item.id}>{btn}</div>
          );
        })}
      </div>
    </div>
  );
}

function FooterLink({
  collapsed,
  href,
  icon: Icon,
  title,
}: {
  collapsed: boolean;
  href: string;
  icon: IconCmp;
  title: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-[#3F3F46] transition-colors hover:bg-[#EAEAEA] dark:text-[#D4D4D8] dark:hover:bg-[#202020]',
        collapsed && 'justify-center px-0',
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center [&>svg]:max-h-4 [&>svg]:max-w-4">
        <Icon className="h-4 w-4 shrink-0 fill-[#8F8F8F]" />
      </span>
      {!collapsed && <span className="truncate">{title}</span>}
    </Link>
  );
}
