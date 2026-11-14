import React, { useState } from 'react';
import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { SWRConfig } from 'swr';
import {
  Activity,
  ArrowLeft,
  Blocks,
  Building2,
  CreditCard,
  LayoutDashboard,
  Menu,
  ScrollText,
  Settings,
  ShieldCheck,
  Tags,
  Users,
  UsersRound,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AppShell from '@/components/shared/shell/AppShell';
import usePlatformAccess from 'hooks/usePlatformAccess';
import { Spinner } from './ui';

const NAV = [
  { href: '/admin', label: 'Overview', icon: LayoutDashboard, exact: true },
  { href: '/admin/activity', label: 'Live activity', icon: Activity },
  { href: '/admin/workspaces', label: 'Workspaces', icon: Building2 },
  { href: '/admin/teams', label: 'Teams', icon: UsersRound },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/plans', label: 'Plans', icon: Tags },
  { href: '/admin/modules', label: 'Modules', icon: Blocks },
  { href: '/admin/payments', label: 'Payments', icon: CreditCard },
  { href: '/admin/audit', label: 'Audit log', icon: ScrollText },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

function Guard({ children }: { children: React.ReactNode }) {
  const { access, isLoading } = usePlatformAccess();
  if (isLoading && !access) return <Spinner className="h-screen" />;
  if (!access?.isPlatformAdmin) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-[#F9F9F9] px-6 text-center dark:bg-[#090909]">
        <ShieldCheck className="size-8 text-gray-400" />
        <h1 className="text-lg font-semibold">Platform admins only</h1>
        <p className="max-w-sm text-sm text-gray-500">
          Your account does not have access to the admin console. Ask an existing platform admin to grant it.
        </p>
        <Link href="/dashboard" className="text-sm font-medium text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

export function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const active = (href: string, exact?: boolean) =>
    exact ? router.pathname === href : router.pathname === href || router.pathname.startsWith(`${href}/`);

  const nav = (
    <nav className="flex flex-col gap-0.5 p-3">
      {NAV.map(({ href, label, icon: Icon, exact }) => (
        <Link
          key={href}
          href={href}
          onClick={() => setMobileOpen(false)}
          className={cn(
            'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
            active(href, exact)
              ? 'bg-yellow-400/90 font-medium text-black dark:bg-[#2647eb] dark:text-white'
              : 'text-gray-600 hover:bg-gray-100 hover:text-black dark:text-neutral-400 dark:hover:bg-[#161616] dark:hover:text-white'
          )}
        >
          <Icon className="size-4" />
          {label}
        </Link>
      ))}
    </nav>
  );

  return (
    <SWRConfig value={{ revalidateOnFocus: false }}>
      <AppShell>
        <Guard>
          <Head>
            <title>Admin · Conferio</title>
          </Head>
          <div className="flex h-screen bg-[#F9F9F9] text-black dark:bg-[#090909] dark:text-white">
            <aside className="hidden w-56 flex-shrink-0 flex-col border-r bg-white dark:border-[#1d1d1d] dark:bg-[#0d0d0d] md:flex">
              <div className="flex h-14 items-center gap-2 border-b px-4 dark:border-[#1d1d1d]">
                <ShieldCheck className="size-5 text-yellow-500 dark:text-[#5b7cff]" />
                <span className="text-sm font-semibold">Platform Admin</span>
              </div>
              <div className="flex-1 overflow-y-auto">{nav}</div>
              <Link
                href="/dashboard"
                className="flex items-center gap-2 border-t px-5 py-3 text-xs font-medium text-gray-500 hover:text-black dark:border-[#1d1d1d] dark:hover:text-white"
              >
                <ArrowLeft className="size-3.5" /> Back to app
              </Link>
            </aside>

            {mobileOpen ? (
              <div className="fixed inset-0 z-50 md:hidden">
                <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
                <aside className="absolute left-0 top-0 h-full w-64 bg-white dark:bg-[#0d0d0d]">
                  <div className="flex h-14 items-center justify-between border-b px-4 dark:border-[#1d1d1d]">
                    <span className="text-sm font-semibold">Platform Admin</span>
                    <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                      <X className="size-4" />
                    </button>
                  </div>
                  {nav}
                </aside>
              </div>
            ) : null}

            <main className="flex min-w-0 flex-1 flex-col">
              <div className="flex h-14 flex-shrink-0 items-center gap-3 border-b bg-white px-4 dark:border-[#1d1d1d] dark:bg-[#0d0d0d] md:hidden">
                <button type="button" onClick={() => setMobileOpen(true)} aria-label="Open menu">
                  <Menu className="size-5" />
                </button>
                <span className="text-sm font-semibold">Platform Admin</span>
              </div>
              <div className="flex-1 overflow-y-auto">{children}</div>
            </main>
          </div>
        </Guard>
      </AppShell>
    </SWRConfig>
  );
}

export function PageHeader({ title, description, actions, back }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="border-b bg-white px-6 py-5 dark:border-[#1d1d1d] dark:bg-[#0d0d0d]">
      {back ? (
        <Link href={back.href} className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-black dark:hover:text-white">
          <ArrowLeft className="size-3" /> {back.label}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
          {description ? <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}

export const adminLayout = (page: React.ReactElement) => <AdminLayout>{page}</AdminLayout>;
