import React, { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  OPEN_DEAL_STAGES,
  STAGE_COLORS,
  dealStageLabel,
  formatMoney,
  formatMoneyCompact,
  isLosingStage,
  type DealStage,
} from '@/lib/crm/constants';
import { toQuery, useCrmApi, useCrmQuery, type Person } from './api';
import { useOpenRecord } from './navigation';
import { CompanyMark, LocalDay, PersonAvatar, Spinner } from './primitives';
import { CloseReasonDialog, useSetStage } from './stage-menu';

type BoardDeal = {
  id: string;
  name: string;
  stage: DealStage;
  currency: string;
  amountCents: number | null;
  baseAmountCents: number | null;
  expectedCloseDate: string | null;
  stageChangedAt: string;
  overdue: boolean;
  openTasks: number;
  company: { id: string; name: string; domain: string | null };
  owner: Person;
};

type Board = { reportingCurrency: string; deals: BoardDeal[] };

const COLUMNS: DealStage[] = [...OPEN_DEAL_STAGES, 'CLOSED_WON', 'CLOSED_LOST'];

function DealCard({ deal, dragging }: { deal: BoardDeal; dragging?: boolean }) {
  return (
    <div className={cn('space-y-2 rounded-lg border bg-white p-3 text-sm shadow-sm dark:border-[#262626] dark:bg-[#141414]', dragging && 'rotate-1 shadow-lg ring-2 ring-blue-500/40')}>
      <div className="flex items-start gap-2">
        <CompanyMark name={deal.company.name} domain={deal.company.domain} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium">{deal.name}</div>
          <div className="truncate text-xs text-muted-foreground">{deal.company.name}</div>
        </div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium tabular-nums">{formatMoney(deal.amountCents, deal.currency)}</span>
        <span className={cn('flex items-center gap-1', deal.overdue ? 'text-red-500' : 'text-muted-foreground')}>
          {deal.overdue ? <AlertCircle className="size-3" /> : null}
          <LocalDay date={deal.expectedCloseDate} empty="No date" />
        </span>
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <PersonAvatar person={deal.owner} size="xs" />
          <span className="truncate">{deal.owner.name}</span>
        </span>
        {deal.openTasks > 0 ? (
          <span className="flex items-center gap-1" title="Open tasks">
            <CheckSquare className="size-3" />
            {deal.openTasks}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function DraggableDeal({ deal, onOpen }: { deal: BoardDeal; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: deal.id, data: { stage: deal.stage } });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} onClick={onOpen} className={cn('cursor-grab touch-none active:cursor-grabbing', isDragging && 'opacity-30')}>
      <DealCard deal={deal} />
    </div>
  );
}

function Column({ stage, deals, currency, onOpen }: { stage: DealStage; deals: BoardDeal[]; currency: string; onOpen: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const total = deals.reduce((sum, deal) => sum + (deal.baseAmountCents ?? 0), 0);
  const closed = stage === 'CLOSED_WON' || stage === 'CLOSED_LOST';

  return (
    <div ref={setNodeRef} className={cn('flex w-72 shrink-0 flex-col rounded-lg border bg-neutral-50 dark:border-[#222] dark:bg-[#0f0f0f]', isOver && 'ring-2 ring-blue-500/50')}>
      <div className="border-b px-3 py-2 dark:border-[#222]">
        <div className="flex items-center gap-1.5 text-sm font-medium">
          <span className="size-2 rounded-full" style={{ backgroundColor: STAGE_COLORS[stage] }} />
          {dealStageLabel(stage)}
          <span className="text-xs font-normal text-muted-foreground">{deals.length}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          {formatMoneyCompact(total, currency)}
          {closed ? ' · last 30 days' : ''}
        </div>
      </div>
      <div className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto p-2">
        {deals.map((deal) => (
          <DraggableDeal key={deal.id} deal={deal} onOpen={() => onOpen(deal.id)} />
        ))}
        {deals.length === 0 ? <p className="py-6 text-center text-xs text-muted-foreground">Drop a deal here</p> : null}
      </div>
    </div>
  );
}

export function PipelineBoard({ q, owner }: { q: string; owner: string }) {
  const { slug } = useCrmApi();
  const client = useQueryClient();
  const openRecord = useOpenRecord();
  const key = ['board', q, owner];
  const board = useCrmQuery<Board>(key, `/deals/board${toQuery({ q, owner })}`, { keepPrevious: true });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [closing, setClosing] = useState<{ id: string; stage: DealStage } | null>(null);
  const setStage = useSetStage(() => setClosing(null));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const byStage = useMemo(() => {
    const groups = new Map<DealStage, BoardDeal[]>();
    COLUMNS.forEach((stage) => groups.set(stage, []));
    (board.data?.deals ?? []).forEach((deal) => {
      const column = groups.get(deal.stage) ?? (deal.stage === 'UNQUALIFIED_TO_BUY' ? groups.get('CLOSED_LOST') : undefined);
      column?.push(deal);
    });
    return groups;
  }, [board.data]);

  const moveLocally = (id: string, stage: DealStage) => {
    client.setQueryData<Board>(['crm', slug, ...key], (current) =>
      current ? { ...current, deals: current.deals.map((deal) => (deal.id === id ? { ...deal, stage } : deal)) } : current
    );
  };

  const onDragStart = (event: DragStartEvent) => setActiveId(String(event.active.id));

  const onDragEnd = (event: DragEndEvent) => {
    setActiveId(null);
    const to = event.over?.id as DealStage | undefined;
    const from = event.active.data.current?.stage as DealStage | undefined;
    if (!to || !from || to === from) return;
    const id = String(event.active.id);
    if (isLosingStage(to)) {
      setClosing({ id, stage: to });
      return;
    }
    moveLocally(id, to);
    setStage.mutate({ id, stage: to });
  };

  if (board.isPending) {
    return <div className="flex justify-center py-16"><Spinner className="size-5" /></div>;
  }

  const active = board.data?.deals.find((deal) => deal.id === activeId) ?? null;
  const currency = board.data?.reportingCurrency ?? 'USD';

  return (
    <>
      <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
        <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 'calc(100vh - 260px)' }}>
          {COLUMNS.map((stage) => (
            <Column key={stage} stage={stage} deals={byStage.get(stage) ?? []} currency={currency} onOpen={(id) => openRecord({ kind: 'deal', id })} />
          ))}
        </div>
        <DragOverlay>{active ? <DealCard deal={active} dragging /> : null}</DragOverlay>
      </DndContext>

      <CloseReasonDialog
        stage={closing?.stage ?? null}
        open={closing !== null}
        pending={setStage.isPending}
        onCancel={() => setClosing(null)}
        onConfirm={(reason) => {
          if (!closing) return;
          moveLocally(closing.id, closing.stage);
          setStage.mutate({ id: closing.id, stage: closing.stage, closedReason: reason });
        }}
      />
    </>
  );
}
