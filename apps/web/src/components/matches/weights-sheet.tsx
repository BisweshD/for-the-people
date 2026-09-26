"use client";

import { WeightsList, type Answered, type ChangeWeight } from "@/components/matches/weights-list";
import { useReturnFocus } from "@/hooks/use-return-focus";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/** The phone and tablet home for the weights: a bottom sheet, loaded the first time it opens. */
export function WeightsSheetPanel({
  open,
  onOpenChange,
  answered,
  onChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  answered: Answered[];
  onChange?: ChangeWeight;
}) {
  const returnFocus = useReturnFocus();
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        {...returnFocus}
        side="bottom"
        className="px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="px-0">
          <SheetTitle>Adjust what matters</SheetTitle>
          <SheetDescription>
            Votes you care more about count more. Your matches update as you change them.
          </SheetDescription>
        </SheetHeader>
        <div className="overflow-y-auto">
          <WeightsList answered={answered} onChange={onChange} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
