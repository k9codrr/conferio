import useSWR from 'swr';
import fetcher from '@/lib/fetcher';
import { useTeamSlug } from 'hooks/useTeamSlug';
import type { ModuleKey } from '@/lib/platform/modules';

export interface PlatformAccess {
  signedIn: boolean;
  isPlatformAdmin?: boolean;
  suspendedUser?: boolean;
  workspace?: { id: string; name: string; slug: string; status: string } | null;
  planKey?: string | null;
  planName?: string | null;
  modules?: Record<ModuleKey, boolean>;
}

// Which modules the user can use in the current team's workspace.
export default function usePlatformAccess() {
  const slug = useTeamSlug();
  const url = `/api/platform/access${slug ? `?teamSlug=${encodeURIComponent(slug)}` : ''}`;
  const { data, error, isLoading, mutate } = useSWR<PlatformAccess>(url, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 30_000,
  });
  return {
    access: data,
    isLoading,
    error,
    mutate,
    // Unknown until loaded → treat as enabled so the UI doesn't flicker.
    isEnabled: (key: ModuleKey | null) => !key || !data?.modules || data.modules[key] !== false,
  };
}
