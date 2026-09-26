"use client";

import { personIdToSlug, type Match } from "@for-the-people/core/client";
import { ShareButton } from "@/components/share/share-button";
import { honorific, matchLine } from "@/lib/share";

/** Shares one match as a ShareCard: the member's id and the counts, never the answers behind them. */
export function MatchShareButton({
  member,
  match,
  iconOnly = false,
  label,
  className,
}: {
  /** Chamber and title add "Rep." or "Sen." before the name when known. */
  member: { id: string; name: string; chamber?: "house" | "senate"; title?: string };
  match: Match;
  iconOnly?: boolean;
  /** Visible text for the full button; defaults to "Share this match". */
  label?: string;
  className?: string;
}) {
  if (match.score === null || match.n === 0) return null;
  const name =
    member.chamber && member.title
      ? `${honorific({ chamber: member.chamber, title: member.title })} ${member.name}`
      : member.name;
  return (
    <ShareButton
      card={{
        kind: "match",
        personId: member.id,
        score: match.score,
        n: match.n,
        agreements: match.agreements,
      }}
      title="My match on For The People"
      text={`${matchLine(name, match.agreements, match.n)}.`}
      href={`/people/${personIdToSlug(member.id)}`}
      label={iconOnly ? `Share your match with ${member.name}` : (label ?? "Share this match")}
      accessibleName={iconOnly ? undefined : `Share your match with ${member.name}`}
      iconOnly={iconOnly}
      className={className}
    />
  );
}
