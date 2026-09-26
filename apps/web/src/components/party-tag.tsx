import { PARTY_NAMES, type Party } from "@for-the-people/core/client";
import { cn } from "@/lib/utils";

const STYLES: Record<Party, string> = {
  D: "bg-party-d-soft text-party-d",
  R: "bg-party-r-soft text-party-r",
  I: "bg-party-i-soft text-party-i",
  L: "bg-party-i-soft text-party-i",
  G: "bg-party-i-soft text-party-i",
  O: "bg-party-i-soft text-party-i",
};

/** Party is a tag with its letter, never color alone. `full` adds the party's name after the letter. */
export function PartyTag({
  party,
  className,
  full = false,
}: {
  party: Party;
  className?: string;
  full?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 min-w-6 items-center justify-center gap-1.5 rounded-input px-1.5 text-xs font-bold",
        STYLES[party],
        className,
      )}
      title={PARTY_NAMES[party]}
    >
      <span aria-hidden>{party}</span>
      {full ? (
        <span aria-hidden className="font-semibold">
          {PARTY_NAMES[party]}
        </span>
      ) : null}
      <span className="sr-only">{PARTY_NAMES[party]}</span>
    </span>
  );
}
