"use client";

import { PartyTag } from "@/components/party-tag";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { RosterMember } from "@/components/duel/member-picker";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { officeLine, STATE_NAMES } from "@/lib/format";

/** The searchable member picker, loaded the first time someone opens it. */
export function MemberPickerDialog({
  open,
  onOpenChange,
  label,
  roster,
  exclude,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: string;
  roster: RosterMember[];
  exclude: string | null;
  onPick: (id: string) => void;
}) {
  const setOpen = onOpenChange;
  // After a pick the slot's button is replaced ("Choose" becomes "Change"), so fall back to it.
  const returnFocus = useReturnFocus(() =>
    document.querySelector<HTMLElement>(`[data-duel-slot="${label}"] button`),
  );
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        {...returnFocus}
        className="top-[12%] translate-y-0 gap-0 overflow-hidden rounded-sheet p-0 sm:max-w-lg"
      >
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle className="text-xl font-bold text-ink">
            Choose the {label} member
          </DialogTitle>
          <DialogDescription className="type-meta text-ink-2">
            Search by name, state, or district. Everyone who served in this Congress (2025–2026) is
            here.
          </DialogDescription>
        </DialogHeader>
        <Command className="rounded-none! p-2">
          <CommandInput placeholder="Search a name or state" className="h-11 text-base" />
          <CommandList className="max-h-[min(60vh,420px)]">
            <CommandEmpty>No member matches that search.</CommandEmpty>
            {(["Serving now", "Former members"] as const).map((heading) => (
              <CommandGroup key={heading} heading={heading}>
                {roster
                  .filter(
                    (candidate) =>
                      candidate.serving === (heading === "Serving now") && candidate.id !== exclude,
                  )
                  .map((candidate) => (
                    <CommandItem
                      key={candidate.id}
                      value={candidate.id}
                      keywords={[
                        candidate.name,
                        candidate.state,
                        STATE_NAMES[candidate.state],
                        officeLine(candidate),
                      ]}
                      onSelect={() => {
                        setOpen(false);
                        onPick(candidate.id);
                      }}
                      className="min-h-11 gap-3 rounded-control px-3"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold text-ink">{candidate.name}</span>
                        <span className="block truncate type-meta text-ink-2">
                          {officeLine(candidate)}
                        </span>
                      </span>
                      <PartyTag party={candidate.party} />
                    </CommandItem>
                  ))}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
