import type { Position } from "@for-the-people/core/client";
import { cn } from "@/lib/utils";

/**
 * How a VotePosition looks on The Board, everywhere it appears: Yea is a filled ink cell with "Y",
 * Nay a hollow cell with "N", Present a soft cell with "P", and Not voting an empty dashed cell.
 * The letter and the shape carry the meaning, never color alone.
 */

export const POSITION_LETTER: Record<Position, string> = {
  Yea: "Y",
  Nay: "N",
  Present: "P",
  NotVoting: "",
};

export const POSITION_CELL: Record<Position, string> = {
  Yea: "bg-ink text-paper",
  Nay: "border-[1.5px] border-ink bg-paper text-ink",
  Present: "border border-ink-3-graphic bg-canvas text-ink-2",
  NotVoting: "border border-dashed border-ink-3-graphic",
};

/** A small legend or inline glyph: the same cell as The Board, at text size. */
export function PositionGlyph({ position, className }: { position: Position; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-5 shrink-0 items-center justify-center rounded-[4px] text-[11px] leading-none font-extrabold",
        POSITION_CELL[position],
        className,
      )}
    >
      {POSITION_LETTER[position]}
    </span>
  );
}

export const POSITION_LABEL: Record<Position, string> = {
  Yea: "Yea",
  Nay: "Nay",
  Present: "Present",
  NotVoting: "Not voting",
};

/**
 * The plain word beside an official one, for a reader meeting the record's words for the first time. The
 * labels stay the record's own ("Yea", "Nay"); the gloss is shown once per view, in a legend or a note.
 */
export const POSITION_GLOSS: Record<Position, string | null> = {
  Yea: "yes",
  Nay: "no",
  Present: "neither",
  NotVoting: null,
};

/** The same glosses as one sentence, for a table with no legend of its own. */
export const POSITION_KEY =
  "Yea means yes, Nay means no, Present means neither, and Not voting means the member did not vote.";

/** "Yea (yes)", "Present (neither)", "Not voting". */
export const glossedPosition = (position: Position): string => {
  const gloss = POSITION_GLOSS[position];
  return gloss ? `${POSITION_LABEL[position]} (${gloss})` : POSITION_LABEL[position];
};
