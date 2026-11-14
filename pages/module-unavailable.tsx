import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { Lock } from 'lucide-react';
import Mainsidebar from '@/components/ui/mainSideBar';
import usePlatformAccess from 'hooks/usePlatformAccess';
import { isModuleKey, MODULE_BY_KEY } from '@/lib/platform/modules';

// Where the module gate (middleware.ts) sends people when a module is off for their workspace.
export default function ModuleUnavailable() {
  const router = useRouter();
  const key = router.query.module;
  const mod = isModuleKey(key) ? MODULE_BY_KEY[key] : null;
  const { access } = usePlatformAccess();
  const suspended = access?.workspace?.status === 'SUSPENDED' || access?.suspendedUser;

  return (
    <div className="flex h-screen bg-[#F9F9F9] dark:bg-[#090909]">
      <Mainsidebar />
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-gray-100 dark:bg-neutral-900">
          <Lock className="size-5 text-gray-500" />
        </div>
        <h1 className="text-xl font-semibold">{mod ? `${mod.label} isn't available` : "This module isn't available"}</h1>
        <p className="max-w-md text-sm text-gray-500 dark:text-neutral-400">
          {suspended
            ? 'Your workspace is suspended, so its modules are turned off. Contact support to restore access.'
            : `${mod?.label ?? 'This module'} isn't part of the ${access?.planName ?? 'current'} plan for ${
                access?.workspace?.name ?? 'your workspace'
              }, or it has been turned off by an administrator.`}
        </p>
        <div className="mt-2 flex gap-2">
          {!suspended ? (
            <Link
              href="/workspace?tab=billing"
              className="rounded-lg bg-yellow-400 px-4 py-2 text-sm font-medium text-black hover:bg-yellow-300 dark:bg-[#2647eb] dark:text-white"
            >
              See plans
            </Link>
          ) : null}
          <Link href="/dashboard" className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-white dark:border-[#2a2a2a] dark:hover:bg-[#111]">
            Back to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
