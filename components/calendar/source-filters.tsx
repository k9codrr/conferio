'use client';

// Sidebar toggles for the unified calendar feed sources.
import { useMemo } from 'react';
import { useCalendarContext } from '@/components/calendar/event-calendar/calendar-context';
import { CALENDAR_SOURCES, SOURCE_META } from '@/lib/calendar/sources';
import { cn } from '@/lib/utils';

const DOT: Record<string, string> = {
  rose: 'bg-rose-500', pink: 'bg-pink-500', fuchsia: 'bg-fuchsia-500', violet: 'bg-violet-500',
  sky: 'bg-sky-500', cyan: 'bg-cyan-500', amber: 'bg-amber-500', teal: 'bg-teal-500',
  emerald: 'bg-emerald-500', lime: 'bg-lime-500', yellow: 'bg-yellow-500', blue: 'bg-blue-500',
  orange: 'bg-orange-500', red: 'bg-red-500', indigo: 'bg-indigo-500',
};

export default function CalendarSourceFilters() {
  const { isSourceVisible, toggleSource, setHiddenSources, hiddenSources } = useCalendarContext();

  const groups = useMemo(() => {
    const m = new Map<string, string[]>();
    CALENDAR_SOURCES.forEach((s) => {
      const g = SOURCE_META[s].group;
      m.set(g, [...(m.get(g) ?? []), s]);
    });
    return Array.from(m.entries());
  }, []);

  return (
    <div className="w-full space-y-3 px-1 py-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Show on calendar</p>
        <button
          type="button"
          className="text-[11px] text-muted-foreground hover:text-foreground"
          onClick={() => setHiddenSources(hiddenSources.length ? [] : [...CALENDAR_SOURCES])}
        >
          {hiddenSources.length ? 'Show all' : 'Hide all'}
        </button>
      </div>
      {groups.map(([group, sources]) => (
        <div key={group} className="space-y-0.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground/70">{group}</p>
          {sources.map((s) => {
            const on = isSourceVisible(s);
            const meta = SOURCE_META[s as keyof typeof SOURCE_META];
            return (
              <button
                key={s}
                type="button"
                onClick={() => toggleSource(s)}
                className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left text-xs hover:bg-white/5"
              >
                <span className={cn('size-3 shrink-0 rounded-sm border transition-colors', on ? `${DOT[meta.color]} border-transparent` : 'border-neutral-600 bg-transparent')} />
                <span className={cn('truncate', on ? 'text-foreground' : 'text-muted-foreground line-through')}>{meta.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
