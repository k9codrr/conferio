import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { DEAL_STAGE_OPTIONS, isLosingStage, type DealStage } from '@/lib/crm/constants';
import { useCrmMutation } from './api';
import { FieldLabel, Spinner, StageBadge } from './primitives';

export function useSetStage(onDone?: () => void) {
  return useCrmMutation<{ id: string; stage: DealStage; closedReason?: string }>(
    (call, input) => call(`/deals/${input.id}/stage`, 'PUT', { stage: input.stage, closedReason: input.closedReason }),
    { onSuccess: () => onDone?.() }
  );
}

export function CloseReasonDialog({
  stage,
  open,
  pending,
  onCancel,
  onConfirm,
}: {
  stage: DealStage | null;
  open: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState('');

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason('');
          onCancel();
        }
      }}
    >
      <DialogContent onClick={(event) => event.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>{stage === 'CLOSED_LOST' ? 'Close as lost' : 'Mark as unqualified'}</DialogTitle>
          <DialogDescription>
            {stage === 'CLOSED_LOST'
              ? 'What did we lose it to? This is the only place that answer gets recorded.'
              : 'Why is this not a fit? It goes on the timeline so nobody re-runs the same deal.'}
          </DialogDescription>
        </DialogHeader>
        <form
          id="crm-close-reason"
          onSubmit={(event) => {
            event.preventDefault();
            if (reason.trim()) onConfirm(reason.trim());
          }}
        >
          <FieldLabel htmlFor="crm-close-reason-text">Reason</FieldLabel>
          <Textarea
            id="crm-close-reason-text"
            value={reason}
            rows={3}
            placeholder="Went with an incumbent vendor"
            onChange={(event) => setReason(event.target.value)}
          />
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" form="crm-close-reason" disabled={pending || reason.trim() === ''}>
            {pending ? <Spinner className="text-current" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DealStageMenu({ dealId, stage, variant = 'inline' }: { dealId: string; stage: DealStage; variant?: 'inline' | 'control' }) {
  const [closing, setClosing] = useState<DealStage | null>(null);
  const setStage = useSetStage(() => setClosing(null));

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {variant === 'control' ? (
            <Button variant="outline" size="sm" disabled={setStage.isPending} onClick={(event) => event.stopPropagation()}>
              <StageBadge stage={stage} />
              <ChevronDown className="text-muted-foreground" />
            </Button>
          ) : (
            <button
              type="button"
              disabled={setStage.isPending}
              onClick={(event) => event.stopPropagation()}
              className="flex min-w-0 items-center rounded px-1 py-0.5 text-left hover:bg-accent disabled:opacity-50"
            >
              <StageBadge stage={stage} />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={variant === 'control' ? 'end' : 'start'} className="min-w-52" onClick={(event) => event.stopPropagation()}>
          <DropdownMenuRadioGroup
            value={stage}
            onValueChange={(next) => {
              const chosen = next as DealStage;
              if (chosen === stage) return;
              if (isLosingStage(chosen)) {
                setClosing(chosen);
                return;
              }
              setStage.mutate({ id: dealId, stage: chosen });
            }}
          >
            {DEAL_STAGE_OPTIONS.map((option) => (
              <DropdownMenuRadioItem key={option.value} value={option.value}>
                <StageBadge stage={option.value} />
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <CloseReasonDialog
        stage={closing}
        open={closing !== null}
        pending={setStage.isPending}
        onCancel={() => setClosing(null)}
        onConfirm={(reason) => closing && setStage.mutate({ id: dealId, stage: closing, closedReason: reason })}
      />
    </>
  );
}

// The stepper on a deal sheet: one click moves the deal along the open stages.
export function StageStepper({ dealId, stage }: { dealId: string; stage: DealStage }) {
  const setStage = useSetStage();
  const steps: DealStage[] = ['DEMO_BOOKED', 'QUALIFIED_TO_BUY', 'DECISION_MAKER_BOUGHT_IN', 'CONTRACT_SENT', 'CLOSED_WON'];
  const current = steps.indexOf(stage);

  return (
    <div className="flex w-full overflow-hidden rounded-md border dark:border-[#2a2a2a]">
      {steps.map((step, index) => {
        const reached = current >= index;
        const option = DEAL_STAGE_OPTIONS.find((entry) => entry.value === step);
        return (
          <button
            key={step}
            type="button"
            disabled={setStage.isPending || step === stage}
            onClick={() => setStage.mutate({ id: dealId, stage: step })}
            className={
              'flex-1 truncate border-r px-2 py-1.5 text-xs last:border-r-0 dark:border-[#2a2a2a] ' +
              (reached
                ? step === 'CLOSED_WON'
                  ? 'bg-green-600 text-white'
                  : 'bg-neutral-900 text-white dark:bg-white dark:text-black'
                : 'hover:bg-accent')
            }
            title={option?.label}
          >
            {option?.label}
          </button>
        );
      })}
    </div>
  );
}
