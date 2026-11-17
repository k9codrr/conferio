'use client';

// Applies the user's custom theme (lib/theme/presets) by injecting CSS token
// overrides. The compiled CSS is also cached in localStorage so _document's
// inline script can apply it before first paint (no flash of the stock theme).
import { useEffect, useMemo } from 'react';
import { usePreferences } from 'hooks/usePreferences';
import { buildThemeCss, fontHref, normalizeTheme } from '@/lib/theme/presets';

export const THEME_CSS_KEY = 'conferio:theme-css';

export function applyThemeCss(css: string, fontUrl: string | null) {
  if (typeof document === 'undefined') return;
  let el = document.getElementById('conferio-theme') as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
    el.id = 'conferio-theme';
    document.head.appendChild(el);
  }
  if (el.textContent !== css) el.textContent = css;

  let link = document.getElementById('conferio-theme-font') as HTMLLinkElement | null;
  if (fontUrl) {
    if (!link) {
      link = document.createElement('link');
      link.id = 'conferio-theme-font';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== fontUrl) link.href = fontUrl;
  } else {
    link?.remove();
  }
  try {
    if (css) localStorage.setItem(THEME_CSS_KEY, css);
    else localStorage.removeItem(THEME_CSS_KEY);
  } catch {
    /* storage unavailable */
  }
}

export default function ThemeStyle() {
  const { prefs } = usePreferences();
  const theme = useMemo(() => normalizeTheme(prefs.theme), [prefs.theme]);
  useEffect(() => {
    applyThemeCss(buildThemeCss(theme), fontHref(theme));
  }, [theme]);
  return null;
}
