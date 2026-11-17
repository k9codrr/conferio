// User UI preferences (theme, dashboard layout, sidebar style), synced to the
// account via /api/me/preferences and cached in localStorage so they apply
// instantly on load and across devices once fetched.
import { useCallback } from 'react';
import useSWR from 'swr';
import { useSession } from 'next-auth/react';

export type Preferences = { theme?: unknown; dashboard?: unknown; sidebar?: unknown; meeting?: unknown };

const LS_KEY = 'conferio:prefs';

export function readLocalPrefs(): Preferences {
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) || '{}');
  } catch {
    return {};
  }
}
function writeLocalPrefs(p: Preferences) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(p));
  } catch {
    /* storage unavailable */
  }
}

export function usePreferences() {
  const { status } = useSession();
  const { data, mutate } = useSWR<Preferences>(
    status === 'authenticated' ? '/api/me/preferences' : null,
    async (url: string) => {
      const r = await fetch(url);
      if (!r.ok) throw new Error('prefs');
      const p = (await r.json()).preferences as Preferences;
      writeLocalPrefs(p);
      return p;
    },
    {
      revalidateOnFocus: false,
      fallbackData: typeof window !== 'undefined' ? readLocalPrefs() : {},
    }
  );

  const update = useCallback(
    async (patch: Partial<Preferences>) => {
      const next = { ...(data ?? {}), ...patch };
      writeLocalPrefs(next);
      await mutate(next, false);
      if (status !== 'authenticated') return;
      try {
        const r = await fetch('/api/me/preferences', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patch),
        });
        if (r.ok) {
          const saved = (await r.json()).preferences as Preferences;
          writeLocalPrefs(saved);
          mutate(saved, false);
        }
      } catch {
        /* keep the local copy; it syncs next time */
      }
    },
    [data, mutate, status]
  );

  return { prefs: data ?? {}, update };
}
