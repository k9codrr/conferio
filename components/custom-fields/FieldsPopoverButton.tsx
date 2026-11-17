'use client';

// Compact "Fields" button that opens a record's custom fields in a popover —
// for full-height editors (docs) where an inline panel would shift the layout.
import { SlidersHorizontal } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import CustomFieldsPanel from './CustomFieldsPanel';

export default function FieldsPopoverButton({
  entity, recordId, teamSlug, className,
}: { entity: 'task' | 'doc' | 'note' | 'reminder' | 'event'; recordId: string; teamSlug?: string; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className={cn('flex h-7 items-center gap-1.5 rounded-md border bg-background/80 px-2 text-xs text-muted-foreground shadow-sm backdrop-blur hover:text-foreground', className)}>
          <SlidersHorizontal className="size-3.5" />Fields
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] p-3">
        <CustomFieldsPanel entity={entity} recordId={recordId} teamSlug={teamSlug} />
      </PopoverContent>
    </Popover>
  );
}
