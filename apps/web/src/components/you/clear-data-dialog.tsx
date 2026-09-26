"use client";

import { useTheme } from "next-themes";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { toast } from "@/lib/toast";
import { voterActions } from "@/lib/voter-store";

/**
 * The "Clear all your data?" confirmation. Loaded the first time someone asks for it, so /you does
 * not ship the dialog machinery (focus trap, scroll lock, portal) to everyone who only reads the page.
 */
export function ClearDataDialog({
  open,
  onOpenChange,
  answers,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Answers saved on this device, named in the consequence. */
  answers: number;
}) {
  const { setTheme } = useTheme();
  const returnFocus = useReturnFocus();
  const saved =
    answers > 0
      ? `your ${answers} ${answers === 1 ? "answer" : "answers"}, your location, ballot plan, and theme`
      : "your location, ballot plan, and theme";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-sheet bg-paper p-6 shadow-5 sm:max-w-md" {...returnFocus}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-ink">Clear all your data?</DialogTitle>
          <DialogDescription className="text-base text-ink-2">
            This removes {saved} from this device. Your matches will start over, and you can&rsquo;t
            undo this.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="outline">
              Keep my data
            </Button>
          </DialogClose>
          {/* The one danger fill: red only here, where the loss is confirmed. */}
          <button
            type="button"
            onClick={async () => {
              const cleared = voterActions.clearAllData();
              setTheme("system");
              onOpenChange(false);
              await cleared;
              toast.success("Cleared all your data from this device");
            }}
            className="inline-flex h-11 items-center justify-center rounded-control border border-danger bg-danger px-5 text-base font-bold text-paper"
          >
            Clear everything
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
