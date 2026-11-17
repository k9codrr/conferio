'use client';

// Settings → Appearance → Layouts: sidebar style, dashboard layout and the
// default meeting view. All saved to the user's account.
import { useState } from 'react';
import { Columns3, Flame, LayoutDashboard, LayoutGrid, MonitorPlay, PanelLeft, PanelLeftDashed, Rows3, SlidersHorizontal } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { usePreferences } from 'hooks/usePreferences';
import { useSidebarPrefs } from '@/components/navigation/nav-items';
import { SidebarCustomizeDialog } from '@/components/navigation/CustomSidebar';
import { useDashboardPrefs } from '@/components/dashboard/custom/CustomDashboards';

function Choice({ active, onClick, icon: Icon, label, hint }: { active: boolean; onClick: () => void; icon: React.ComponentType<{ className?: string }>; label: string; hint: string }) {
  return (
    <button type="button" onClick={onClick}
      className={cn('flex flex-1 items-start gap-2 rounded-lg border p-3 text-left transition-colors',
        active ? 'border-primary bg-primary/10 ring-1 ring-primary' : 'hover:bg-accent')}>
      <Icon className={cn('mt-0.5 size-4', active ? 'text-primary' : 'text-muted-foreground')} />
      <span>
        <span className="block text-sm font-medium">{label}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </button>
  );
}

export type MeetingView = 'standard' | 'campfire';
export function useMeetingPrefs() {
  const { prefs, update } = usePreferences();
  const m = (prefs.meeting && typeof prefs.meeting === 'object' ? prefs.meeting : {}) as { defaultView?: MeetingView };
  return {
    defaultView: (m.defaultView === 'campfire' ? 'campfire' : 'standard') as MeetingView,
    setDefaultView: (v: MeetingView) => update({ meeting: { ...m, defaultView: v } }),
  };
}

export default function LayoutPreferences() {
  const { sidebar, save: saveSidebar } = useSidebarPrefs();
  const { layout, save: saveDashboard } = useDashboardPrefs();
  const { defaultView, setDefaultView } = useMeetingPrefs();
  const [customizing, setCustomizing] = useState(false);

  return (
    <Card className="dark:bg-black">
      <CardHeader>
        <CardTitle>Layouts</CardTitle>
        <CardDescription>Choose how the sidebar, dashboard and meetings look for you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">Sidebar</p>
            <button type="button" onClick={() => setCustomizing(true)} className="flex items-center gap-1 text-xs text-primary hover:underline">
              <SlidersHorizontal className="size-3.5" />Reorder, hide & favorite items
            </button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice active={sidebar.variant === 'default'} onClick={() => saveSidebar({ variant: 'default' })} icon={PanelLeftDashed} label="Default" hint="Original compact sidebar" />
            <Choice active={sidebar.variant === 'clickup'} onClick={() => saveSidebar({ variant: 'clickup' })} icon={PanelLeft} label="Expanded" hint="Sections, favorites, hover previews" />
            <Choice active={sidebar.variant === 'rail'} onClick={() => saveSidebar({ variant: 'rail' })} icon={Rows3} label="Rail" hint="Slim icons + labels, hover previews" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Dashboard</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice active={layout === 'default'} onClick={() => saveDashboard({ layout: 'default' })} icon={LayoutDashboard} label="Default" hint="The original dashboard" />
            <Choice active={layout === 'grid'} onClick={() => saveDashboard({ layout: 'grid' })} icon={LayoutGrid} label="Grid" hint="Drag, resize & add cards" />
            <Choice active={layout === 'focus'} onClick={() => saveDashboard({ layout: 'focus' })} icon={Columns3} label="Focus" hint="Today column + resizable panels" />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Meetings — view when a call starts</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice active={defaultView === 'standard'} onClick={() => setDefaultView('standard')} icon={MonitorPlay} label="Standard" hint="Video grid / speaker layouts" />
            <Choice active={defaultView === 'campfire'} onClick={() => setDefaultView('campfire')} icon={Flame} label="Campfire" hint="Everyone in a circle; double-click someone to focus" />
          </div>
        </div>
      </CardContent>
      <SidebarCustomizeDialog open={customizing} onClose={() => setCustomizing(false)} />
    </Card>
  );
}
