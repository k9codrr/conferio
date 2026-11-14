import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface Team {
  id: string;
  name: string;
  slug: string;
}

interface TeamState {
  selectedTeam: Team | null;
  setSelectedTeam: (team: Team) => void;
  getTeamSlug: () => string | undefined;
  getTeamId: () => string | undefined;
  clearTeam: () => void;
}

// Mirrors the selected team into a cookie so the server-side module gate knows which
// workspace the user is working in (keep the name in sync with MODULE_COOKIE).
function syncTeamCookie(slug: string | null | undefined) {
  if (typeof document === 'undefined') return;
  try {
    document.cookie = slug
      ? `conferio-team=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`
      : 'conferio-team=; path=/; max-age=0; samesite=lax';
  } catch {
    /* ignore */
  }
}

export const useTeamStore = create<TeamState>()(
  persist(
    (set, get) => ({
      selectedTeam: null,
      setSelectedTeam: (team) => {
        syncTeamCookie(team?.slug);
        set({ selectedTeam: team });
      },
      getTeamSlug: () => get().selectedTeam?.slug,
      getTeamId: () => get().selectedTeam?.id,
      clearTeam: () => {
        syncTeamCookie(null);
        set({ selectedTeam: null });
      },
    }),
    {
      name: 'conferio-selected-team',
      onRehydrateStorage: () => (state) => syncTeamCookie(state?.selectedTeam?.slug),
    }
  )
);
