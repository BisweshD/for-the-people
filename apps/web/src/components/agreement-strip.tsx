import type { MatchComparison } from "@for-the-people/core/client";
import { AgreementOval } from "@/components/agreement-glyph";
import { cn } from "@/lib/utils";

/**
 * One small oval per compared vote: filled green where the member voted your way, hollow and slashed
 * where they did not. Meaning never rests on color alone.
 */
export function AgreementStrip({
  comparisons,
  className,
}: {
  comparisons: readonly MatchComparison[];
  className?: string;
}) {
  if (comparisons.length === 0) return null;
  const ordered = comparisons.toSorted((a, b) => Number(b.agree) - Number(a.agree));
  const agree = comparisons.filter((comparison) => comparison.agree).length;
  return (
    <span
      role="img"
      aria-label={`Agrees on ${agree}, differs on ${comparisons.length - agree}`}
      className={cn("inline-flex flex-wrap items-center gap-1", className)}
    >
      {ordered.map((comparison) => (
        <AgreementOval key={comparison.keyVoteId} agree={comparison.agree} size={16} />
      ))}
    </span>
  );
}
