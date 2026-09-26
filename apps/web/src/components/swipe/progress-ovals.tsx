import type { Choice } from "@for-the-people/core/client";
import { Oval } from "@/components/oval";

/**
 * Swipe progress as a row of ballot ovals that fills from the left, in the same order and marks as the
 * strip on /you: your answers first (filled for a Yea or Nay, dashed for a skip), then the current vote
 * (an ink ring half-filled with marigold), then the ones ahead (hollow); each group in deck order.
 * The oval for the answer just given inks in with a small pop (1 to 1.12 to 1, 200 ms).
 */
export function ProgressOvals({
  ids,
  answered,
  currentId,
  popId = null,
}: {
  /** Every key vote, in deck order. */
  ids: readonly string[];
  /** The voter's answers by key vote. */
  answered: ReadonlyMap<string, { choice: Choice }>;
  currentId: string | null;
  /** The key vote answered a moment ago, whose oval pops as it fills. */
  popId?: string | null;
}) {
  const order = [...ids.filter((id) => answered.has(id)), ...ids.filter((id) => !answered.has(id))];
  const done = order.filter((id) => answered.has(id)).length;
  const skipped = order.filter((id) => answered.get(id)?.choice === "Skip").length;
  const size = ids.length > 16 ? 13 : 16;
  return (
    <div className="flex flex-col items-center gap-2">
      <ol className="flex justify-center gap-1 sm:gap-1.5" aria-hidden>
        {order.map((id) => {
          const choice = answered.get(id)?.choice;
          return (
            <li key={id} className={id === popId ? "journey-oval-pop" : undefined}>
              {id === currentId ? (
                <Oval size={size} filled={false} fraction={0.5} tone="current" stroke={2.5} />
              ) : (
                <Oval
                  size={size}
                  filled={choice === "Yea" || choice === "Nay"}
                  dashed={choice === "Skip"}
                  stroke={choice ? 1.75 : 1.5}
                  className={choice ? "" : "[&_ellipse]:stroke-ink-3-graphic"}
                />
              )}
            </li>
          );
        })}
      </ol>
      <p className="type-meta text-ink-2" aria-live="polite">
        <span>
          {done} of {ids.length} answered
        </span>
        {/* The same count as Home and /you: a skip is an answer, but only a Yea or Nay is compared. */}
        {skipped > 0 && <span> ({skipped} skipped)</span>}
      </p>
    </div>
  );
}
