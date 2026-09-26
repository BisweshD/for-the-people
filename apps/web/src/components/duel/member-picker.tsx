"use client";

import { UserPlus } from "lucide-react";
import dynamic from "next/dynamic";
import { useState } from "react";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import { Button } from "@/components/ui/button";
import type { MemberView } from "@/lib/views";
import { OfficeText } from "@/components/office-text";

const MemberPickerDialog = dynamic(
  () =>
    import("@/components/duel/member-picker-dialog").then((module) => module.MemberPickerDialog),
  { ssr: false },
);

export type RosterMember = Omit<MemberView, "portrait">;

/** One side of the duel: the chosen member, or a button to choose one, plus a searchable picker. */
export function MemberSlot({
  side,
  member,
  roster,
  exclude,
  onPick,
  pending,
}: {
  side: "a" | "b";
  member: MemberView | null;
  roster: RosterMember[];
  exclude: string | null;
  onPick: (id: string) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [used, setUsed] = useState(false);
  const choose = () => {
    setUsed(true);
    setOpen(true);
  };
  const label = side === "a" ? "first" : "second";
  return (
    <div
      data-duel-slot={label}
      className="flex min-w-0 flex-col gap-3 rounded-card bg-paper p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4"
    >
      {member ? (
        <>
          <Portrait
            portrait={member.portrait}
            name={member.name}
            sizes="112px"
            className="w-full max-w-28 shrink-0 sm:w-24"
            priority
          />
          <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
            <p className="text-lg leading-snug font-bold text-ink">{member.name}</p>
            <p className="type-meta text-ink-2">
              <OfficeText member={member} />
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <PartyTag party={member.party} />
              {!member.serving && <span className="type-meta text-ink-2">Former member</span>}
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() => !pending && choose()}
              aria-disabled={pending || undefined}
              className="mt-1"
            >
              Change {member.chamber === "senate" ? "senator" : "representative"}
              <span className="sr-only"> (the {label} member)</span>
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={choose}
          disabled={pending}
          className="flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-card border border-dashed border-ink-3-graphic px-3 text-center text-base font-bold text-ink hover:bg-accent disabled:opacity-60"
        >
          <UserPlus className="size-6 text-ink-2" aria-hidden />
          Choose the {label} member
        </button>
      )}
      {used && (
        <MemberPickerDialog
          open={open}
          onOpenChange={setOpen}
          label={label}
          roster={roster}
          exclude={exclude}
          onPick={onPick}
        />
      )}
    </div>
  );
}
