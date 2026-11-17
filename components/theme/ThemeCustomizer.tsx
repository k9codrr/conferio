'use client';

// Appearance settings: shadcn-style theme builder. Changes preview instantly and
// are saved to the user's account (synced across devices).
import { useEffect, useMemo, useState } from 'react';
import { useTheme } from 'next-themes';
import { HexColorPicker } from 'react-colorful';
import { Check, Monitor, Moon, RotateCcw, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { usePreferences } from 'hooks/usePreferences';
import {
  ACCENTS, BASE_OPTIONS, DEFAULT_THEME, FONTS, RADII, buildThemeCss, fontHref, normalizeTheme,
  type ThemeConfig,
} from '@/lib/theme/presets';
import { applyThemeCss } from './ThemeStyle';

const BASE_SWATCH: Record<string, string> = {
  default: 'linear-gradient(135deg,#0f172a 50%,#f8fafc 50%)', zinc: '#71717a', slate: '#64748b', stone: '#78716c',
  neutral: '#737373', gray: '#6b7280', midnight: '#312e81',
};

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Pill({ active, onClick, children, className }: { active: boolean; onClick: () => void; children: React.ReactNode; className?: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs transition-colors',
        active ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary' : 'border-border text-muted-foreground hover:bg-accent', className)}>
      {children}
    </button>
  );
}

export default function ThemeCustomizer() {
  const { prefs, update } = usePreferences();
  const saved = useMemo(() => normalizeTheme(prefs.theme), [prefs.theme]);
  const [draft, setDraft] = useState<ThemeConfig>(saved);
  const [hex, setHex] = useState(saved.customPrimary ?? '#7c3aed');
  const { theme: mode, setTheme } = useTheme();

  useEffect(() => { setDraft(saved); }, [saved]);

  // Live preview while editing; persisted with a short debounce.
  useEffect(() => {
    applyThemeCss(buildThemeCss(draft), fontHref(draft));
    if (JSON.stringify(draft) === JSON.stringify(saved)) return;
    const t = setTimeout(() => update({ theme: draft }), 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  const set = (patch: Partial<ThemeConfig>) => setDraft((d) => ({ ...d, ...patch }));

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
      <Card className="dark:bg-black">
        <CardHeader className="flex flex-row items-start justify-between space-y-0">
          <div>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Customise colours, corners, shadows and type across Conferio. Saved to your account.</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => { setDraft(DEFAULT_THEME); setTheme('dark'); }}>
            <RotateCcw className="size-3.5" /> Reset
          </Button>
        </CardHeader>
        <CardContent className="space-y-6">
          <Section title="Mode">
            <div className="flex flex-wrap gap-2">
              {([['light', 'Light', Sun], ['dark', 'Dark', Moon], ['system', 'System', Monitor]] as const).map(([k, label, Icon]) => (
                <Pill key={k} active={mode === k} onClick={() => setTheme(k)}><Icon className="size-3.5" />{label}</Pill>
              ))}
            </div>
          </Section>

          <Section title="Base colour" hint="Backgrounds, cards, borders and muted text">
            <div className="flex flex-wrap gap-2">
              {BASE_OPTIONS.map((b) => (
                <Pill key={b.key} active={draft.base === b.key} onClick={() => set({ base: b.key })}>
                  <span className="size-3.5 rounded-full border" style={{ background: BASE_SWATCH[b.key] }} />{b.label}
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Accent colour" hint="Buttons, links, focus rings, active states">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => set({ accent: 'default' })} title="Default"
                className={cn('flex h-8 items-center rounded-full border px-3 text-xs', draft.accent === 'default' ? 'ring-2 ring-primary ring-offset-2 ring-offset-background' : '')}>
                Default
              </button>
              {Object.entries(ACCENTS).map(([k, a]) => (
                <button key={k} type="button" title={a.label} onClick={() => set({ accent: k })}
                  className={cn('flex size-8 items-center justify-center rounded-full border border-black/10',
                    draft.accent === k && 'ring-2 ring-offset-2 ring-offset-background')}
                  style={{ background: a.swatch, ['--tw-ring-color' as any]: a.swatch }}>
                  {draft.accent === k && <Check className="size-4 text-white mix-blend-difference" />}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-start gap-4 pt-2">
              <HexColorPicker color={hex} onChange={(c) => { setHex(c); set({ accent: 'custom', customPrimary: c }); }} style={{ width: 180, height: 140 }} />
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Any brand colour</p>
                <Input value={hex} className="h-8 w-28 font-mono text-xs"
                  onChange={(e) => {
                    setHex(e.target.value);
                    if (/^#[0-9a-f]{6}$/i.test(e.target.value)) set({ accent: 'custom', customPrimary: e.target.value });
                  }} />
                {draft.accent === 'custom' && <Badge variant="secondary">Custom in use</Badge>}
              </div>
            </div>
          </Section>

          <Section title="Corner radius">
            <div className="flex flex-wrap gap-2">
              {RADII.map((r) => (
                <Pill key={r} active={draft.radius === r} onClick={() => set({ radius: r })}>
                  <span className="size-4 border-l-2 border-t-2 border-foreground/60" style={{ borderTopLeftRadius: `${r * 12}px` }} />
                  {r === 0.5 ? `${r} (default)` : r}
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Shadows">
            <div className="flex flex-wrap gap-2">
              {(['none', 'subtle', 'default', 'strong'] as const).map((s) => (
                <Pill key={s} active={draft.shadow === s} onClick={() => set({ shadow: s })} className="capitalize">{s}</Pill>
              ))}
            </div>
          </Section>

          <Section title="Font">
            <div className="flex flex-wrap gap-2">
              {Object.entries(FONTS).map(([k, f]) => (
                <Pill key={k} active={draft.font === k} onClick={() => set({ font: k as ThemeConfig['font'] })}>
                  <span style={{ fontFamily: f.stack ?? undefined }}>{f.label}</span>
                </Pill>
              ))}
            </div>
          </Section>

          <Section title="Interface size">
            <div className="flex flex-wrap gap-2">
              {[[0.9, 'Compact'], [1, 'Default'], [1.06, 'Comfortable'], [1.12, 'Large']].map(([v, label]) => (
                <Pill key={v as number} active={draft.scale === v} onClick={() => set({ scale: v as number })}>{label as string}</Pill>
              ))}
            </div>
          </Section>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Reduce motion</p>
              <p className="text-xs text-muted-foreground">Turn off animations and transitions</p>
            </div>
            <Switch checked={!!draft.reduceMotion} onCheckedChange={(v) => set({ reduceMotion: v })} />
          </div>
        </CardContent>
      </Card>

      {/* Live preview */}
      <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>How components look with your theme</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button size="sm">Primary</Button>
              <Button size="sm" variant="secondary">Secondary</Button>
              <Button size="sm" variant="outline">Outline</Button>
              <Button size="sm" variant="ghost">Ghost</Button>
              <Button size="sm" variant="destructive">Delete</Button>
            </div>
            <Input placeholder="Type something…" />
            <div className="flex gap-2">
              <Badge>Badge</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
            </div>
            <div className="rounded-lg border bg-card p-4 shadow-md">
              <p className="text-sm font-semibold">Sprint planning</p>
              <p className="text-xs text-muted-foreground">Tomorrow · 10:00 – 11:00</p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                <div className="h-full w-2/3 rounded-full bg-primary" />
              </div>
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted p-3">
              <span className="text-sm">Notifications</span>
              <Switch defaultChecked />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
