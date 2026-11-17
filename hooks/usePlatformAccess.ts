import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import { useTeamSlug } from 'hooks/useTeamSlug';
import { useSSE } from 'hooks/useSSE';
import type { ModuleKey } from '@/lib/platform/modules';

export interface PlatformAccess {
  signedIn: boolean;
  isPlatformAdmin?: boolean;
  /** The user's role in the current team (OWNER / ADMIN / MANAGER / MEMBER / INTERN / CLIENT). */
  teamRole?: string | null;
  suspendedUser?: boolean;
  workspace?: { id: string; name: string; slug: string; status: string } | null;
  planKey?: string | null;
  planName?: string | null;
  modules?: Record<ModuleKey, boolean>;
}

export default function usePlatformAccess() {
  const slug = useTeamSlug();
  const url = `/api/platform/access${slug ? `?teamSlug=${encodeURIComponent(slug)}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<PlatformAccess>(url, fetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 15_000,
  });

  // Plan changes, workspace overrides and platform switches apply live.
  useSSE((evt) => {
    if (evt.type === 'platform:access' || evt.type === 'sse:reconnected') mutate();
  });

  return {
    access: data,
    isLoading,
    error,
    mutate,
    /**
     * Whether a module should be shown. Until access has loaded, gated modules are
     * hidden (prevents a flash of modules that then disappear); if access can't be
     * loaded at all we fail open so the app stays usable.
     */
    isEnabled: (key: ModuleKey | null) => {
      if (!key) return true;
      if (!data) return !!error;
      if (!data.modules) return true;
      return data.modules[key] !== false;
    },
  };
}
