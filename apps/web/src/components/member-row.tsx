import { personIdToSlug, type Match } from "@for-the-people/core/client";
import Link from "next/link";
import type { ReactNode } from "react";
import { CompactScore } from "@/components/compact-score";
import { OfficeText } from "@/components/office-text";
import { PartyTag } from "@/components/party-tag";
import { Portrait } from "@/components/portrait";
import { cn } from "@/lib/utils";
import type { MemberView } from "@/lib/views";

export const profileHref = (member: Pick<MemberView, "id">) =>
  `/people/${personIdToSlug(member.id)}` as const;

/**
 * One member in a list (Matches, Explore, the Swipe rail, Compare): portrait with initials under it,
 * the full name with the party letter kept on the line of the last word, the office (short below
 * 640px), and the match: under the name on a narrow row (a phone, a column of two), on the right from
 * 480px of row. Share lives on the top match and the profile, never on a row.
 */
export function MemberRow({
  member,
  match,
  trailing,
  rank,
  yours = false,
  size = "md",
  office = "responsive",
  className,
}: {
  /** One of the voter's own members of Congress: a marigold "Yours" tag after the name. */
  yours?: boolean;
  member: MemberView;
  /** Shows the compact match on the right. Null reads "No shared votes yet"; leave out for none. */
  match?: Match | null;
  /** Replaces the compact match (Compare's You and Friend columns). */
  trailing?: ReactNode;
  /** A rank number before the portrait. */
  rank?: number;
  /** "sm" for narrow rails. */
  size?: "md" | "sm";
  office?: "responsive" | "short";
  className?: string;
}) {
  const words = member.name.split(" ");
  const last = words.pop();
  const small = size === "sm";
  // A full-size row with its own match: on a narrow row (a phone, or a column of two) the match sits
  // under the name, so the name keeps its line; from 480px of row it moves to the right.
  const stacked = !small && trailing === undefined && rank === undefined && match !== undefined;
  const portrait = (
    <Portrait
      portrait={member.portrait}
      name={member.name}
      lastName={member.lastName}
      sizes={small ? "40px" : "56px"}
      decorative
      morph={member.id}
      className={cn(
        "shrink-0 rounded-control transition-transform duration-150 group-active:scale-[0.97]",
        small ? "w-10 rounded-control" : "w-12 sm:w-14",
        stacked && "row-span-2 @min-[30rem]:row-span-1",
      )}
    />
  );
  const who = (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
      <p className={cn("leading-snug font-bold text-ink", small ? "text-sm" : "text-base")}>
        {words.length > 0 && `${words.join(" ")} `}
        <span className="whitespace-nowrap">
          {last}
          <PartyTag party={member.party} className="ml-1.5 align-[1px]" />
        </span>
        {yours && (
          <span className="ml-1.5 inline-flex rounded-full bg-you-soft px-2.5 py-0.5 align-[1px] type-meta font-bold text-ink">
            Yours
          </span>
        )}
      </p>
      <p className={cn("leading-snug text-ink-2", small ? "text-[13px]" : "text-sm")}>
        <OfficeText member={member} form={office} />
      </p>
    </div>
  );
  const rowClass = cn(
    "group min-h-16 py-3 transition-colors duration-150 hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2",
    small ? "px-2" : "px-4 sm:px-5",
    className,
  );
  if (stacked)
    return (
      <Link href={profileHref(member)} className={cn("@container block", rowClass)}>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 @min-[30rem]:grid-cols-[auto_minmax(0,1fr)_auto]">
          {portrait}
          {who}
          <CompactScore
            match={match ?? null}
            inline
            className="col-start-2 @min-[30rem]:col-start-3 @min-[30rem]:row-start-1 @min-[30rem]:pl-1"
          />
        </div>
      </Link>
    );
  return (
    <Link href={profileHref(member)} className={cn("flex items-center gap-3", rowClass)}>
      {rank !== undefined && (
        <span className="w-5 shrink-0 text-center text-sm font-bold text-ink-2 tabular-nums">
          {rank}
        </span>
      )}
      {portrait}
      {who}
      {trailing ??
        (match !== undefined && (
          <CompactScore match={match} short={small} className="shrink-0 pl-1" />
        ))}
    </Link>
  );
}
