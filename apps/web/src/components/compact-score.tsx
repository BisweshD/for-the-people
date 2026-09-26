import type { Match } from "@for-the-people/core/client";
import { cn } from "@/lib/utils";

/**
 * The list-row match (Matches, Explore, the Swipe rail), right-aligned and still: the plain count
 * first ("Agrees on 7 of 8"), then the score under it ("Match score 83%"). The count is raw; what the
 * score weighs is said once per page, beside its one "How scores work" link, never per row. No oval:
 * ovals mark answers, progress and agreement, never a score.
 * Its own module, so list pages do not load the rolling headline number.
 */
export function CompactScore({
  match,
  short = false,
  inline = false,
  className,
}: {
  match: Match | null;
  /** "7 of 8" and "83%" alone, for narrow rails; the words are then read to screen readers only. */
  short?: boolean;
  /**
   * Under the name on a narrow row: count and score side by side, left-aligned; stacked and
   * right-aligned once the row's container is 480px wide (MemberRow sets the container).
   */
  inline?: boolean;
  className?: string;
}) {
  if (!match || match.score === null) {
    return (
      <span
        className={cn(
          "text-sm leading-snug text-ink-2",
          inline ? "@min-[30rem]:text-right" : "text-right",
          className,
        )}
        data-fact="match"
        data-receipt-id="method-match"
      >
        No shared <br className={inline ? "hidden @min-[30rem]:inline" : undefined} />
        votes yet
      </span>
    );
  }
  const words = short ? "sr-only" : undefined;
  return (
    <span
      className={cn(
        "tabular-nums",
        inline
          ? "flex flex-wrap items-baseline gap-x-3 @min-[30rem]:flex-col @min-[30rem]:items-end @min-[30rem]:gap-0.5 @min-[30rem]:text-right"
          : "flex flex-col items-end gap-0.5 text-right",
        className,
      )}
      data-fact="match"
      data-receipt-id="method-match"
    >
      <span className="text-[15px] leading-snug whitespace-nowrap text-ink-2">
        {/* The leading space keeps the row's name and "Agrees" apart when the row is read. */}
        <span className={words}>{" Agrees"}</span>
        <span className="sr-only"> with you</span>
        <span className={words}> on </span>
        <span className="font-bold text-ink">
          {match.agreements} of {match.n}
        </span>
        <span className="sr-only">{` ${match.n === 1 ? "vote" : "votes"}.`}</span>
      </span>{" "}
      <span className="text-sm leading-snug whitespace-nowrap text-ink-2">
        <span className={words}>Match score </span>
        {Math.round(match.score * 100)}%<span className="sr-only"> (weighted)</span>
      </span>
    </span>
  );
}
