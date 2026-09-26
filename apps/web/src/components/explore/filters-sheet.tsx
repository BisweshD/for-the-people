"use client";

import type { FilterChange, FilterValues } from "@/components/explore/explore-filters";
import { FilterControls } from "@/components/explore/filter-controls";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useReturnFocus } from "@/hooks/use-return-focus";

/**
 * The phone home for chamber, party, and state: a bottom sheet, loaded the first time it opens.
 * Choices apply as they are made; the button says how many members they leave.
 */
export function FiltersSheet({
  open,
  onOpenChange,
  values,
  onChange,
  onClear,
  resultLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: FilterValues;
  onChange: (next: FilterChange) => void;
  onClear: () => void;
  /** "Show 24 members". */
  resultLabel: string;
}) {
  const returnFocus = useReturnFocus();
  const filtered = Boolean(values.chamber || values.party || values.state);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        {...returnFocus}
        side="bottom"
        className="mx-auto w-full max-w-xl gap-0 pb-[env(safe-area-inset-bottom)] sm:data-[side=bottom]:bottom-4 sm:data-[side=bottom]:rounded-sheet"
      >
        <span aria-hidden className="mx-auto mt-2.5 h-1 w-9 rounded-full bg-hairline" />
        <SheetHeader className="px-5 pt-3 pb-4">
          <SheetTitle className="text-xl font-bold text-ink">Filters</SheetTitle>
          <SheetDescription className="text-sm text-ink-2">
            Narrow the list and the map by chamber, party, or state.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto border-y border-hairline px-5 py-5">
          <FilterControls values={values} onChange={onChange} layout="sheet" />
        </div>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <Button variant="link" size="lg" onClick={onClear} disabled={!filtered}>
            Clear all
          </Button>
          <Button size="lg" onClick={() => onOpenChange(false)} className="tabular-nums">
            {resultLabel}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
