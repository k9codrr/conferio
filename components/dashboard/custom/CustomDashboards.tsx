'use client';

// Customizable dashboard layouts (the original dashboard remains the "Default").
//   Grid  — ClickUp-style 12-column board: drag cards to reorder, drag the corner
//           to resize width/height, add/remove/rename cards.
//   Focus — a "Today" column plus resizable side columns; drag cards between
//           columns, resize card heights, resize the columns themselves.
// Everything is saved to the user's preferences (synced across devices).
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragOverEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext, arrayMove, rectSortingStrategy, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { Check, GripVertical, LayoutDashboard, LayoutGrid, Columns3, Pencil, Plus, RotateCcw, X } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { usePreferences } from 'hooks/usePreferences';
import { DEFAULT_GRID, WIDGETS, WidgetBody, newWidget, useWidgetData, type WidgetInstance, type WidgetType } from './widgets';

export type DashboardLayout = 'default' | 'grid' | 'focus';
const ROW = 72; // px per grid row
const GAP = 12; // px

interface FocusState { columns: WidgetInstance[][]; sizes: number[] }
interface DashboardPrefs { layout?: DashboardLayout; grid?: WidgetInstance[]; focus?: FocusState }

const DEFAULT_FOCUS: FocusState = {
  columns: [
    [{ id: 'f-agenda', type: 'agenda', w: 12, h: 6 }, { id: 'f-tasks', type: 'tasks', w: 12, h: 6 }],
    [{ id: 'f-reminders', type: 'reminders', w: 12, h: 4 }, { id: 'f-docs', type: 'docs', w: 12, h: 4 }, { id: 'f-time', type: 'time', w: 12, h: 3 }],
    [{ id: 'f-clock', type: 'clock', w: 12, h: 2 }, { id: 'f-activity', type: 'activity', w: 12, h: 7 }, { id: 'f-note', type: 'quick_note', w: 12, h: 3 }],
  ],
  sizes: [40, 30, 30],
};

const isWidget = (w: any): w is WidgetInstance => w && typeof w.id === 'string' && w.type in WIDGETS;

export function useDashboardPrefs() {
  const { prefs, update } = usePreferences();
  const d = (prefs.dashboard && typeof prefs.dashboard === 'object' ? prefs.dashboard : {}) as DashboardPrefs;
  const layout: DashboardLayout = d.layout === 'grid' || d.layout === 'focus' ? d.layout : 'default';
  const grid = Array.isArray(d.grid) && d.grid.every(isWidget) ? d.grid : DEFAULT_GRID;
  const focus: FocusState =
    d.focus && Array.isArray(d.focus.columns) && d.focus.columns.length === 3 && d.focus.columns.every((c) => Array.isArray(c) && c.every(isWidget))
      ? { columns: d.focus.columns, sizes: Array.isArray(d.focus.sizes) && d.focus.sizes.length === 3 ? d.focus.sizes : DEFAULT_FOCUS.sizes }
      : DEFAULT_FOCUS;
  const save = useCallback((patch: DashboardPrefs) => update({ dashboard: { ...d, ...patch } }), [d, update]);
  return { layout, grid, focus, save };
}

// ── Layout switcher (also shown on the default dashboard) ────────────────────

export function LayoutSwitcher({ className }: { className?: string }) {
  const { layout, save } = useDashboardPrefs();
  const opts: [DashboardLayout, string, React.ComponentType<{ className?: string }>][] = [
    ['default', 'Default', LayoutDashboard], ['grid', 'Grid', LayoutGrid], ['focus', 'Focus', Columns3],
  ];
  return (
    <div className={cn('flex items-center gap-0.5 rounded-lg border bg-background/80 p-0.5 shadow-sm backdrop-blur', className)} role="radiogroup" aria-label="Dashboard layout">
      {opts.map(([k, label, Icon]) => (
        <button key={k} type="button" role="radio" aria-checked={layout === k} title={`${label} layout`} onClick={() => save({ layout: k })}
          className={cn('flex items-center gap-1 rounded-md px-2 py-1 text-xs', layout === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent')}>
          <Icon className="size-3.5" /><span className="max-sm:hidden">{label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Card frame ───────────────────────────────────────────────────────────────

function WidgetCard({
  widget, data, editing, onRemove, onChange, dragHandle, resizeHandle, style, innerRef, dragging,
}: {
  widget: WidgetInstance;
  data: Record<string, any>;
  editing: boolean;
  onRemove: () => void;
  onChange: (w: WidgetInstance) => void;
  dragHandle?: React.HTMLAttributes<HTMLButtonElement>;
  resizeHandle?: React.ReactNode;
  style?: React.CSSProperties;
  innerRef?: (el: HTMLElement | null) => void;
  dragging?: boolean;
}) {
  const def = WIDGETS[widget.type];
  const Icon = def.icon;
  const [renaming, setRenaming] = useState(false);
  const [title, setTitle] = useState(widget.title ?? def.title);
  useEffect(() => setTitle(widget.title ?? def.title), [widget.title, def.title]);

  return (
    <section ref={innerRef} style={style}
      className={cn('group relative flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm transition-shadow',
        dragging && 'z-30 opacity-80 shadow-2xl ring-2 ring-primary')}>
      <header className="flex h-9 shrink-0 items-center gap-1.5 border-b px-2">
        <button type="button" aria-label="Drag card" {...dragHandle}
          className="cursor-grab touch-none rounded p-0.5 text-muted-foreground opacity-40 hover:bg-accent group-hover:opacity-100 active:cursor-grabbing">
          <GripVertical className="size-3.5" />
        </button>
        <Icon className="size-3.5 text-muted-foreground" />
        {renaming ? (
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)}
            onBlur={() => { setRenaming(false); onChange({ ...widget, title: title.trim() || undefined }); }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            className="h-6 min-w-0 flex-1 rounded border bg-transparent px-1 text-xs outline-none" />
        ) : (
          <h3 className="min-w-0 flex-1 truncate text-xs font-semibold" onDoubleClick={() => setRenaming(true)}>{widget.title ?? def.title}</h3>
        )}
        <div className={cn('flex items-center gap-0.5 transition-opacity', editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          <button type="button" title="Rename" onClick={() => setRenaming(true)} className="rounded p-1 text-muted-foreground hover:bg-accent"><Pencil className="size-3" /></button>
          {widget.type === 'embed' && widget.config?.url && (
            <button type="button" title="Change link" onClick={() => onChange({ ...widget, config: { ...widget.config, url: undefined } })}
              className="rounded p-1 text-muted-foreground hover:bg-accent"><RotateCcw className="size-3" /></button>
          )}
          <button type="button" title="Remove card" onClick={onRemove} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /></button>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <WidgetBody widget={widget} data={data} onConfig={(config) => onChange({ ...widget, config })} />
      </div>
      {resizeHandle}
    </section>
  );
}

// ── Add-card gallery ─────────────────────────────────────────────────────────

function AddWidgetDialog({ open, onClose, onAdd, existing }: { open: boolean; onClose: () => void; onAdd: (t: WidgetType) => void; existing: WidgetType[] }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add a card</DialogTitle>
          <DialogDescription>Cards show live data from across Conferio. You can add the same card more than once.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[60vh] gap-2 overflow-y-auto sm:grid-cols-2">
          {Object.values(WIDGETS).map((w) => {
            const Icon = w.icon;
            const count = existing.filter((x) => x === w.type).length;
            return (
              <button key={w.type} type="button" onClick={() => { onAdd(w.type); onClose(); }}
                className="flex items-start gap-3 rounded-lg border p-3 text-left hover:border-primary hover:bg-accent">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Icon className="size-4" /></span>
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-medium">{w.title}{count > 0 && <span className="text-[10px] text-muted-foreground">({count} on board)</span>}</span>
                  <span className="block text-xs text-muted-foreground">{w.description}</span>
                </span>
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Toolbar({ editing, setEditing, onAdd, onReset, children }: { editing: boolean; setEditing: (v: boolean) => void; onAdd: () => void; onReset: () => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {children}
      <div className="ml-auto flex items-center gap-2">
        <LayoutSwitcher />
        <button type="button" onClick={onAdd} className="flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs text-primary-foreground hover:bg-primary/90">
          <Plus className="size-3.5" />Add card
        </button>
        <button type="button" onClick={() => setEditing(!editing)}
          className={cn('flex h-8 items-center gap-1 rounded-md border px-3 text-xs', editing ? 'border-primary text-primary' : 'text-muted-foreground hover:bg-accent')}>
          {editing ? <><Check className="size-3.5" />Done</> : <><Pencil className="size-3.5" />Customize</>}
        </button>
        {editing && (
          <button type="button" onClick={onReset} title="Reset to the default cards" className="flex h-8 items-center gap-1 rounded-md border px-3 text-xs text-muted-foreground hover:bg-accent">
            <RotateCcw className="size-3.5" />Reset
          </button>
        )}
      </div>
    </div>
  );
}

function Greeting() {
  const h = new Date().getHours();
  return (
    <div>
      <h1 className="text-xl font-semibold">{h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}</h1>
      <p className="text-xs text-muted-foreground">{new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    </div>
  );
}

// ── Grid layout ──────────────────────────────────────────────────────────────

function useIsNarrow() {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(max-width: 767px)');
    const f = () => setNarrow(m.matches);
    f();
    m.addEventListener('change', f);
    return () => m.removeEventListener('change', f);
  }, []);
  return narrow;
}

function SortableGridCard({ widget, data, editing, narrow, colWidth, onChange, onRemove }: {
  widget: WidgetInstance; data: Record<string, any>; editing: boolean; narrow: boolean; colWidth: number;
  onChange: (w: WidgetInstance, persist?: boolean) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const def = WIDGETS[widget.type];

  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const sx = e.clientX, sy = e.clientY, sw = widget.w, sh = widget.h;
    let last = widget;
    const move = (ev: PointerEvent) => {
      const w = Math.max(def.minW ?? 2, Math.min(12, Math.round(sw + (ev.clientX - sx) / (colWidth + GAP))));
      const h = Math.max(def.minH ?? 2, Math.min(16, Math.round(sh + (ev.clientY - sy) / (ROW + GAP))));
      if (w !== last.w || h !== last.h) {
        last = { ...widget, w, h };
        onChange(last, false);
      }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onChange(last, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  return (
    <WidgetCard
      widget={widget} data={data} editing={editing} onRemove={onRemove} onChange={(w) => onChange(w, true)}
      innerRef={setNodeRef} dragging={isDragging}
      dragHandle={{ ...attributes, ...listeners } as any}
      style={{
        gridColumn: `span ${narrow ? 12 : widget.w} / span ${narrow ? 12 : widget.w}`,
        gridRow: `span ${widget.h} / span ${widget.h}`,
        transform: CSS.Translate.toString(transform),
        transition,
      }}
      resizeHandle={!narrow && (
        <div onPointerDown={startResize} title="Drag to resize"
          className={cn('absolute bottom-0 right-0 z-10 size-4 cursor-se-resize touch-none', editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          <svg viewBox="0 0 16 16" className="size-4 text-muted-foreground"><path d="M14 6v8H6" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M14 10v4h-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </div>
      )}
    />
  );
}

export function GridDashboard() {
  const { grid, save } = useDashboardPrefs();
  const [items, setItems] = useState<WidgetInstance[]>(grid);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const narrow = useIsNarrow();
  const ref = useRef<HTMLDivElement>(null);
  const [colWidth, setColWidth] = useState(80);
  const { data } = useWidgetData(items);

  useEffect(() => { setItems(grid); }, [grid]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setColWidth((el.clientWidth - GAP * 11) / 12));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const persist = (next: WidgetInstance[]) => { setItems(next); save({ grid: next }); };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const onDragEnd = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    const from = items.findIndex((i) => i.id === e.active.id);
    const to = items.findIndex((i) => i.id === e.over!.id);
    persist(arrayMove(items, from, to));
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto p-4 thin-scrollbar md:p-6">
      <Toolbar editing={editing} setEditing={setEditing} onAdd={() => setAdding(true)} onReset={() => persist(DEFAULT_GRID)}>
        <Greeting />
      </Toolbar>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={items.map((i) => i.id)} strategy={rectSortingStrategy}>
          <div ref={ref} className={cn('grid grid-cols-12', editing && 'rounded-xl bg-[radial-gradient(hsl(var(--border))_1px,transparent_1px)] [background-size:16px_16px]')}
            style={{ gridAutoRows: `${ROW}px`, gap: GAP }}>
            {items.map((w) => (
              <SortableGridCard key={w.id} widget={w} data={data} editing={editing} narrow={narrow} colWidth={colWidth}
                onRemove={() => persist(items.filter((x) => x.id !== w.id))}
                onChange={(nw, p) => {
                  const next = items.map((x) => (x.id === nw.id ? nw : x));
                  if (p) persist(next); else setItems(next);
                }} />
            ))}
          </div>
        </SortableContext>
      </DndContext>
      {!items.length && (
        <button type="button" onClick={() => setAdding(true)} className="rounded-xl border border-dashed p-10 text-sm text-muted-foreground hover:bg-accent">
          Your board is empty — add your first card
        </button>
      )}
      <AddWidgetDialog open={adding} onClose={() => setAdding(false)} existing={items.map((i) => i.type)} onAdd={(t) => persist([...items, newWidget(t)])} />
    </div>
  );
}

// ── Focus layout ─────────────────────────────────────────────────────────────

function FocusColumn({ id, children, empty }: { id: string; children: React.ReactNode; empty: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div ref={setNodeRef} className={cn('flex h-full min-h-[200px] flex-col gap-3 overflow-y-auto p-1.5 thin-scrollbar', isOver && 'rounded-xl bg-primary/5')}>
      {children}
      {empty && <div className="rounded-xl border border-dashed p-6 text-center text-xs text-muted-foreground">Drop cards here</div>}
    </div>
  );
}

function SortableFocusCard({ widget, data, editing, onChange, onRemove }: {
  widget: WidgetInstance; data: Record<string, any>; editing: boolean;
  onChange: (w: WidgetInstance, persist?: boolean) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id });
  const def = WIDGETS[widget.type];
  const startResize = (e: React.PointerEvent) => {
    e.preventDefault();
    const sy = e.clientY, sh = widget.h;
    let last = widget;
    const move = (ev: PointerEvent) => {
      const h = Math.max(def.minH ?? 2, Math.min(16, Math.round((sh * ROW + (ev.clientY - sy)) / ROW)));
      if (h !== last.h) { last = { ...widget, h }; onChange(last, false); }
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      onChange(last, true);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  return (
    <WidgetCard widget={widget} data={data} editing={editing} onRemove={onRemove} onChange={(w) => onChange(w, true)}
      innerRef={setNodeRef} dragging={isDragging} dragHandle={{ ...attributes, ...listeners } as any}
      style={{ height: widget.h * ROW, flexShrink: 0, transform: CSS.Translate.toString(transform), transition }}
      resizeHandle={
        <div onPointerDown={startResize} title="Drag to resize height"
          className={cn('absolute inset-x-0 bottom-0 z-10 flex h-2 cursor-ns-resize touch-none items-center justify-center', editing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
          <span className="h-1 w-8 rounded-full bg-muted-foreground/40" />
        </div>
      } />
  );
}

export function FocusDashboard() {
  const { focus, save } = useDashboardPrefs();
  const [cols, setCols] = useState<WidgetInstance[][]>(focus.columns);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<number | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const all = useMemo(() => cols.flat(), [cols]);
  const { data } = useWidgetData(all);

  useEffect(() => { setCols(focus.columns); }, [focus.columns]);
  const persist = (next: WidgetInstance[][]) => { setCols(next); save({ focus: { columns: next, sizes: focus.sizes } }); };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const colOf = (id: string) => {
    if (id.startsWith('col-')) return Number(id.slice(4));
    return cols.findIndex((c) => c.some((w) => w.id === id));
  };
  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragOver = (e: DragOverEvent) => {
    if (!e.over) return;
    const a = colOf(String(e.active.id));
    const b = colOf(String(e.over.id));
    if (a < 0 || b < 0 || a === b) return;
    setCols((prev) => {
      const next = prev.map((c) => [...c]);
      const idx = next[a].findIndex((w) => w.id === e.active.id);
      const [moved] = next[a].splice(idx, 1);
      const overIdx = next[b].findIndex((w) => w.id === e.over!.id);
      next[b].splice(overIdx < 0 ? next[b].length : overIdx, 0, moved);
      return next;
    });
  };
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    if (!e.over) return persist(cols);
    const c = colOf(String(e.active.id));
    const from = cols[c]?.findIndex((w) => w.id === e.active.id) ?? -1;
    const to = cols[c]?.findIndex((w) => w.id === e.over!.id) ?? -1;
    if (c >= 0 && from >= 0 && to >= 0 && from !== to) {
      const next = cols.map((x) => [...x]);
      next[c] = arrayMove(next[c], from, to);
      persist(next);
    } else persist(cols);
  };
  const activeWidget = activeId ? all.find((w) => w.id === activeId) : null;

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4 md:p-6">
      <Toolbar editing={editing} setEditing={setEditing} onAdd={() => setAdding(0)} onReset={() => persist(DEFAULT_FOCUS.columns)}>
        <Greeting />
      </Toolbar>
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd}>
        <PanelGroup direction="horizontal" className="min-h-0 flex-1" onLayout={(sizes) => save({ focus: { columns: cols, sizes } })}>
          {cols.map((col, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <PanelResizeHandle className="group mx-1 flex w-2 items-center justify-center">
                  <span className="h-10 w-1 rounded-full bg-border transition-colors group-hover:bg-primary group-data-[resize-handle-state=drag]:bg-primary" />
                </PanelResizeHandle>
              )}
              <Panel defaultSize={focus.sizes[i]} minSize={18} className="flex min-h-0 flex-col">
                <div className="mb-1 flex items-center justify-between px-1.5">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{['Today', 'Work', 'Pulse'][i]}</p>
                  <button type="button" onClick={() => setAdding(i)} className="rounded p-0.5 text-muted-foreground hover:bg-accent" title="Add card to this column">
                    <Plus className="size-3.5" />
                  </button>
                </div>
                <SortableContext id={`col-${i}`} items={col.map((w) => w.id)} strategy={verticalListSortingStrategy}>
                  <FocusColumn id={`col-${i}`} empty={!col.length}>
                    {col.map((w) => (
                      <SortableFocusCard key={w.id} widget={w} data={data} editing={editing}
                        onRemove={() => persist(cols.map((c, j) => (j === i ? c.filter((x) => x.id !== w.id) : c)))}
                        onChange={(nw, p) => {
                          const next = cols.map((c, j) => (j === i ? c.map((x) => (x.id === nw.id ? nw : x)) : c));
                          if (p) persist(next); else setCols(next);
                        }} />
                    ))}
                  </FocusColumn>
                </SortableContext>
              </Panel>
            </React.Fragment>
          ))}
        </PanelGroup>
        <DragOverlay>
          {activeWidget ? (
            <div className="rounded-xl border bg-card px-3 py-2 text-xs font-semibold shadow-2xl ring-2 ring-primary">{activeWidget.title ?? WIDGETS[activeWidget.type].title}</div>
          ) : null}
        </DragOverlay>
      </DndContext>
      <AddWidgetDialog open={adding !== null} onClose={() => setAdding(null)} existing={all.map((w) => w.type)}
        onAdd={(t) => persist(cols.map((c, j) => (j === adding ? [...c, { ...newWidget(t), w: 12 }] : c)))} />
    </div>
  );
}
