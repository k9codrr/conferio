// lib/theme/presets.ts — client-safe theme engine (shadcn-style tokens).
// A ThemeConfig compiles to CSS that overrides the design tokens in
// pages/globals.css. The default config compiles to nothing, so the stock look
// is unchanged until a user customises it.

export type BaseColor = 'default' | 'zinc' | 'slate' | 'stone' | 'neutral' | 'gray' | 'midnight';
export type ShadowLevel = 'none' | 'subtle' | 'default' | 'strong';
export type FontChoice = 'default' | 'inter' | 'jakarta' | 'dm-sans' | 'manrope' | 'serif' | 'mono';

export interface ThemeConfig {
  base: BaseColor;
  accent: string;          // key of ACCENTS, 'default' or 'custom'
  customPrimary?: string;  // #rrggbb when accent === 'custom'
  radius: number;          // rem
  shadow: ShadowLevel;
  font: FontChoice;
  scale: number;           // root font scale, 0.9–1.15
  reduceMotion?: boolean;
}

export const DEFAULT_THEME: ThemeConfig = {
  base: 'default', accent: 'default', radius: 0.5, shadow: 'default', font: 'default', scale: 1,
};

type Tokens = Record<string, string>;

// ── Accent colors (primary / ring / sidebar-primary) ─────────────────────────
// [light primary, light primary-foreground, dark primary, dark primary-foreground]
export const ACCENTS: Record<string, { label: string; swatch: string; v: [string, string, string, string] }> = {
  blue:    { label: 'Blue',    swatch: '#3b82f6', v: ['221.2 83.2% 53.3%', '210 40% 98%', '217.2 91.2% 59.8%', '222.2 47.4% 11.2%'] },
  violet:  { label: 'Violet',  swatch: '#7c3aed', v: ['262.1 83.3% 57.8%', '210 20% 98%', '263.4 70% 50.4%', '210 20% 98%'] },
  indigo:  { label: 'Indigo',  swatch: '#6366f1', v: ['239 84% 67%', '0 0% 100%', '234 89% 74%', '240 30% 10%'] },
  rose:    { label: 'Rose',    swatch: '#e11d48', v: ['346.8 77.2% 49.8%', '355.7 100% 97.3%', '346.8 77.2% 49.8%', '355.7 100% 97.3%'] },
  pink:    { label: 'Pink',    swatch: '#ec4899', v: ['330 81% 60%', '0 0% 100%', '329 86% 70%', '330 40% 10%'] },
  red:     { label: 'Red',     swatch: '#dc2626', v: ['0 72.2% 50.6%', '0 85.7% 97.3%', '0 72.2% 50.6%', '0 85.7% 97.3%'] },
  orange:  { label: 'Orange',  swatch: '#f97316', v: ['24.6 95% 53.1%', '60 9.1% 97.8%', '20.5 90.2% 48.2%', '60 9.1% 97.8%'] },
  amber:   { label: 'Amber',   swatch: '#f59e0b', v: ['38 92% 50%', '26 83% 14%', '43 96% 56%', '26 83% 14%'] },
  yellow:  { label: 'Yellow',  swatch: '#eab308', v: ['47.9 95.8% 53.1%', '26 83.3% 14.1%', '47.9 95.8% 53.1%', '26 83.3% 14.1%'] },
  green:   { label: 'Green',   swatch: '#16a34a', v: ['142.1 76.2% 36.3%', '355.7 100% 97.3%', '142.1 70.6% 45.3%', '144.9 80.4% 10%'] },
  emerald: { label: 'Emerald', swatch: '#10b981', v: ['160 84% 39%', '0 0% 100%', '158 64% 52%', '160 60% 8%'] },
  teal:    { label: 'Teal',    swatch: '#14b8a6', v: ['173 80% 40%', '0 0% 100%', '172 66% 50%', '175 60% 8%'] },
  cyan:    { label: 'Cyan',    swatch: '#06b6d4', v: ['189 94% 43%', '0 0% 100%', '187 85% 53%', '190 60% 8%'] },
  mono:    { label: 'Mono',    swatch: '#18181b', v: ['240 5.9% 10%', '0 0% 98%', '0 0% 98%', '240 5.9% 10%'] },
};

// ── Base palettes (surfaces, borders, muted text) ────────────────────────────
const BASES: Record<Exclude<BaseColor, 'default'>, { label: string; light: Tokens; dark: Tokens }> = {
  zinc: {
    label: 'Zinc',
    light: { background: '0 0% 100%', foreground: '240 10% 3.9%', card: '0 0% 100%', 'card-foreground': '240 10% 3.9%', popover: '0 0% 100%', 'popover-foreground': '240 10% 3.9%', secondary: '240 4.8% 95.9%', 'secondary-foreground': '240 5.9% 10%', muted: '240 4.8% 95.9%', 'muted-foreground': '240 3.8% 46.1%', accent: '240 4.8% 95.9%', 'accent-foreground': '240 5.9% 10%', border: '240 5.9% 90%', input: '240 5.9% 90%' },
    dark: { background: '240 10% 3.9%', foreground: '0 0% 98%', card: '240 10% 3.9%', 'card-foreground': '0 0% 98%', popover: '240 10% 3.9%', 'popover-foreground': '0 0% 98%', secondary: '240 3.7% 15.9%', 'secondary-foreground': '0 0% 98%', muted: '240 3.7% 15.9%', 'muted-foreground': '240 5% 64.9%', accent: '240 3.7% 15.9%', 'accent-foreground': '0 0% 98%', border: '240 3.7% 15.9%', input: '240 3.7% 15.9%' },
  },
  slate: {
    label: 'Slate',
    light: { background: '0 0% 100%', foreground: '222.2 84% 4.9%', card: '0 0% 100%', 'card-foreground': '222.2 84% 4.9%', popover: '0 0% 100%', 'popover-foreground': '222.2 84% 4.9%', secondary: '210 40% 96.1%', 'secondary-foreground': '222.2 47.4% 11.2%', muted: '210 40% 96.1%', 'muted-foreground': '215.4 16.3% 46.9%', accent: '210 40% 96.1%', 'accent-foreground': '222.2 47.4% 11.2%', border: '214.3 31.8% 91.4%', input: '214.3 31.8% 91.4%' },
    dark: { background: '222.2 84% 4.9%', foreground: '210 40% 98%', card: '222.2 84% 4.9%', 'card-foreground': '210 40% 98%', popover: '222.2 84% 4.9%', 'popover-foreground': '210 40% 98%', secondary: '217.2 32.6% 17.5%', 'secondary-foreground': '210 40% 98%', muted: '217.2 32.6% 17.5%', 'muted-foreground': '215 20.2% 65.1%', accent: '217.2 32.6% 17.5%', 'accent-foreground': '210 40% 98%', border: '217.2 32.6% 17.5%', input: '217.2 32.6% 17.5%' },
  },
  stone: {
    label: 'Stone',
    light: { background: '0 0% 100%', foreground: '20 14.3% 4.1%', card: '0 0% 100%', 'card-foreground': '20 14.3% 4.1%', popover: '0 0% 100%', 'popover-foreground': '20 14.3% 4.1%', secondary: '60 4.8% 95.9%', 'secondary-foreground': '24 9.8% 10%', muted: '60 4.8% 95.9%', 'muted-foreground': '25 5.3% 44.7%', accent: '60 4.8% 95.9%', 'accent-foreground': '24 9.8% 10%', border: '20 5.9% 90%', input: '20 5.9% 90%' },
    dark: { background: '20 14.3% 4.1%', foreground: '60 9.1% 97.8%', card: '20 14.3% 4.1%', 'card-foreground': '60 9.1% 97.8%', popover: '20 14.3% 4.1%', 'popover-foreground': '60 9.1% 97.8%', secondary: '12 6.5% 15.1%', 'secondary-foreground': '60 9.1% 97.8%', muted: '12 6.5% 15.1%', 'muted-foreground': '24 5.4% 63.9%', accent: '12 6.5% 15.1%', 'accent-foreground': '60 9.1% 97.8%', border: '12 6.5% 15.1%', input: '12 6.5% 15.1%' },
  },
  neutral: {
    label: 'Neutral',
    light: { background: '0 0% 100%', foreground: '0 0% 3.9%', card: '0 0% 100%', 'card-foreground': '0 0% 3.9%', popover: '0 0% 100%', 'popover-foreground': '0 0% 3.9%', secondary: '0 0% 96.1%', 'secondary-foreground': '0 0% 9%', muted: '0 0% 96.1%', 'muted-foreground': '0 0% 45.1%', accent: '0 0% 96.1%', 'accent-foreground': '0 0% 9%', border: '0 0% 89.8%', input: '0 0% 89.8%' },
    dark: { background: '0 0% 3.9%', foreground: '0 0% 98%', card: '0 0% 3.9%', 'card-foreground': '0 0% 98%', popover: '0 0% 3.9%', 'popover-foreground': '0 0% 98%', secondary: '0 0% 14.9%', 'secondary-foreground': '0 0% 98%', muted: '0 0% 14.9%', 'muted-foreground': '0 0% 63.9%', accent: '0 0% 14.9%', 'accent-foreground': '0 0% 98%', border: '0 0% 14.9%', input: '0 0% 14.9%' },
  },
  gray: {
    label: 'Gray',
    light: { background: '0 0% 100%', foreground: '224 71.4% 4.1%', card: '0 0% 100%', 'card-foreground': '224 71.4% 4.1%', popover: '0 0% 100%', 'popover-foreground': '224 71.4% 4.1%', secondary: '220 14.3% 95.9%', 'secondary-foreground': '220.9 39.3% 11%', muted: '220 14.3% 95.9%', 'muted-foreground': '220 8.9% 46.1%', accent: '220 14.3% 95.9%', 'accent-foreground': '220.9 39.3% 11%', border: '220 13% 91%', input: '220 13% 91%' },
    dark: { background: '224 71.4% 4.1%', foreground: '210 20% 98%', card: '224 71.4% 4.1%', 'card-foreground': '210 20% 98%', popover: '224 71.4% 4.1%', 'popover-foreground': '210 20% 98%', secondary: '215 27.9% 16.9%', 'secondary-foreground': '210 20% 98%', muted: '215 27.9% 16.9%', 'muted-foreground': '217.9 10.6% 64.9%', accent: '215 27.9% 16.9%', 'accent-foreground': '210 20% 98%', border: '215 27.9% 16.9%', input: '215 27.9% 16.9%' },
  },
  midnight: {
    label: 'Midnight',
    light: { background: '230 40% 98%', foreground: '230 40% 8%', card: '0 0% 100%', 'card-foreground': '230 40% 8%', popover: '0 0% 100%', 'popover-foreground': '230 40% 8%', secondary: '230 30% 94%', 'secondary-foreground': '230 40% 12%', muted: '230 30% 94%', 'muted-foreground': '230 12% 45%', accent: '230 30% 92%', 'accent-foreground': '230 40% 12%', border: '230 25% 88%', input: '230 25% 88%' },
    dark: { background: '232 38% 6%', foreground: '230 30% 96%', card: '232 34% 9%', 'card-foreground': '230 30% 96%', popover: '232 34% 9%', 'popover-foreground': '230 30% 96%', secondary: '232 26% 16%', 'secondary-foreground': '230 30% 96%', muted: '232 26% 16%', 'muted-foreground': '230 14% 66%', accent: '232 26% 18%', 'accent-foreground': '230 30% 96%', border: '232 24% 18%', input: '232 24% 18%' },
  },
};
export const BASE_OPTIONS: { key: BaseColor; label: string }[] = [
  { key: 'default', label: 'Default' },
  ...Object.entries(BASES).map(([key, v]) => ({ key: key as BaseColor, label: v.label })),
];

export const FONTS: Record<FontChoice, { label: string; stack: string | null; google?: string }> = {
  default: { label: 'Default', stack: null },
  inter: { label: 'Inter', stack: "'Inter', ui-sans-serif, system-ui, sans-serif" },
  jakarta: { label: 'Plus Jakarta', stack: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif", google: 'Plus+Jakarta+Sans:wght@400;500;600;700' },
  'dm-sans': { label: 'DM Sans', stack: "'DM Sans', ui-sans-serif, system-ui, sans-serif", google: 'DM+Sans:wght@400;500;600;700' },
  manrope: { label: 'Manrope', stack: "'Manrope', ui-sans-serif, system-ui, sans-serif", google: 'Manrope:wght@400;500;600;700' },
  serif: { label: 'Serif', stack: "ui-serif, Georgia, Cambria, 'Times New Roman', serif" },
  mono: { label: 'Mono', stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" },
};

export const RADII = [0, 0.25, 0.5, 0.75, 1, 1.25];

const SHADOWS: Record<Exclude<ShadowLevel, 'default'>, Tokens> = {
  none: { 'shadow-sm': 'none', shadow: 'none', 'shadow-md': 'none', 'shadow-lg': 'none', 'shadow-xl': 'none', 'shadow-2xl': 'none' },
  subtle: {
    'shadow-sm': '0 1px 1px 0 hsl(var(--shadow-color) / 0.03)',
    shadow: '0 1px 2px 0 hsl(var(--shadow-color) / 0.06)',
    'shadow-md': '0 2px 4px -1px hsl(var(--shadow-color) / 0.06)',
    'shadow-lg': '0 6px 10px -3px hsl(var(--shadow-color) / 0.07)',
    'shadow-xl': '0 12px 18px -6px hsl(var(--shadow-color) / 0.08)',
    'shadow-2xl': '0 18px 36px -12px hsl(var(--shadow-color) / 0.14)',
  },
  strong: {
    'shadow-sm': '0 1px 3px 0 hsl(var(--shadow-color) / 0.12)',
    shadow: '0 2px 6px 0 hsl(var(--shadow-color) / 0.18), 0 1px 3px -1px hsl(var(--shadow-color) / 0.14)',
    'shadow-md': '0 6px 12px -2px hsl(var(--shadow-color) / 0.2), 0 3px 6px -3px hsl(var(--shadow-color) / 0.16)',
    'shadow-lg': '0 14px 24px -4px hsl(var(--shadow-color) / 0.22), 0 6px 10px -6px hsl(var(--shadow-color) / 0.18)',
    'shadow-xl': '0 24px 36px -8px hsl(var(--shadow-color) / 0.26), 0 10px 14px -8px hsl(var(--shadow-color) / 0.2)',
    'shadow-2xl': '0 32px 64px -16px hsl(var(--shadow-color) / 0.4)',
  },
};

// ── Color helpers ────────────────────────────────────────────────────────────
export function hexToHsl(hex: string): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  return `${Math.round(h * 360)} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}
function readableOn(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.45 ? '240 10% 6%' : '0 0% 100%';
}

const block = (sel: string, t: Tokens) =>
  Object.keys(t).length ? `${sel}{${Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';')}}` : '';

/** Compile a theme to CSS. Returns '' for the default theme. */
export function buildThemeCss(c: ThemeConfig): string {
  const light: Tokens = {};
  const dark: Tokens = {};
  const root: Tokens = {};

  if (c.base !== 'default' && BASES[c.base as Exclude<BaseColor, 'default'>]) {
    const b = BASES[c.base as Exclude<BaseColor, 'default'>];
    Object.assign(light, b.light, { 'sidebar-background': b.light.secondary, 'sidebar-border': b.light.border });
    Object.assign(dark, b.dark, { 'sidebar-background': b.dark.card, 'sidebar-border': b.dark.border });
  }

  let accent: [string, string, string, string] | null = null;
  if (c.accent === 'custom' && c.customPrimary) {
    const hsl = hexToHsl(c.customPrimary);
    if (hsl) accent = [hsl, readableOn(c.customPrimary), hsl, readableOn(c.customPrimary)];
  } else if (ACCENTS[c.accent]) {
    accent = ACCENTS[c.accent].v;
  }
  if (accent) {
    Object.assign(light, { primary: accent[0], 'primary-foreground': accent[1], ring: accent[0], 'sidebar-primary': accent[0], 'sidebar-primary-foreground': accent[1], 'sidebar-ring': accent[0] });
    Object.assign(dark, { primary: accent[2], 'primary-foreground': accent[3], ring: accent[2], 'sidebar-primary': accent[2], 'sidebar-primary-foreground': accent[3], 'sidebar-ring': accent[2] });
  }

  if (c.radius !== DEFAULT_THEME.radius) root.radius = `${c.radius}rem`;
  if (c.shadow !== 'default' && SHADOWS[c.shadow as Exclude<ShadowLevel, 'default'>]) Object.assign(root, SHADOWS[c.shadow as Exclude<ShadowLevel, 'default'>]);
  const font = FONTS[c.font]?.stack;
  if (font) root['font-sans'] = font;

  let css = block(':root', { ...root, ...light }) + block('.dark', dark);
  if (c.scale && c.scale !== 1) css += `html{font-size:${Math.round(c.scale * 1000) / 10}%}`;
  if (font && c.font !== 'default') css += `body{font-family:var(--font-sans)}`;
  if (c.reduceMotion) css += `*,*::before,*::after{animation-duration:.001ms!important;transition-duration:.001ms!important}`;
  return css;
}

export function fontHref(c: ThemeConfig): string | null {
  const g = FONTS[c.font]?.google;
  return g ? `https://fonts.googleapis.com/css2?family=${g}&display=swap` : null;
}

export function normalizeTheme(v: unknown): ThemeConfig {
  const t = (v && typeof v === 'object' ? v : {}) as Partial<ThemeConfig>;
  return {
    base: (BASE_OPTIONS.some((b) => b.key === t.base) ? t.base : 'default') as BaseColor,
    accent: typeof t.accent === 'string' && (t.accent === 'default' || t.accent === 'custom' || ACCENTS[t.accent]) ? t.accent : 'default',
    customPrimary: typeof t.customPrimary === 'string' && /^#[0-9a-f]{6}$/i.test(t.customPrimary) ? t.customPrimary : undefined,
    radius: typeof t.radius === 'number' && t.radius >= 0 && t.radius <= 2 ? t.radius : DEFAULT_THEME.radius,
    shadow: (['none', 'subtle', 'default', 'strong'] as const).includes(t.shadow as ShadowLevel) ? (t.shadow as ShadowLevel) : 'default',
    font: (t.font && t.font in FONTS ? t.font : 'default') as FontChoice,
    scale: typeof t.scale === 'number' && t.scale >= 0.85 && t.scale <= 1.2 ? t.scale : 1,
    reduceMotion: !!t.reduceMotion,
  };
}
