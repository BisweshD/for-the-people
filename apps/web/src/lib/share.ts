import { shareCardToSearchParams, type ShareCard } from "@for-the-people/core/client";

/** Helpers for ShareCards: image URLs and the plain-language line that goes with each card. */

export type ShareFormat = "og" | "story";

export const SHARE_FORMATS: Record<ShareFormat, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  story: { width: 1080, height: 1920 },
};

/** The image route for a card. Only public ids and counts go in the query (never stances). */
export function shareImagePath(card: ShareCard, format: ShareFormat = "og"): string {
  const params = shareCardToSearchParams(card);
  if (format !== "og") params.set("format", format);
  return `/api/share/${card.kind}?${params.toString()}`;
}

/** "Rep.", "Sen.", or "Del." before a member's name, as newsrooms write it. */
export function honorific(member: { chamber: "house" | "senate"; title: string }): string {
  if (member.chamber === "senate") return "Sen.";
  if (member.title === "Delegate") return "Del.";
  if (member.title === "Resident Commissioner") return "Res. Comm.";
  return "Rep.";
}

export const plural = (count: number, one: string, many = `${one}s`): string =>
  `${count} ${count === 1 ? one : many}`;

/** "I match Rep. Jane Doe on 7 of 9 key votes" */
export const matchLine = (name: string, agreements: number, n: number): string =>
  `I match ${name} on ${agreements} of ${plural(n, "key vote")}`;

/** "I have a plan for 2 of 3 races on my ballot" (counts only, never the choices). */
export const ballotLine = (decided: number, races: number): string =>
  `I have a plan for ${decided} of ${plural(races, "race")} on my ballot`;
