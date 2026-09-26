import { formatInteger } from "./format";

/**
 * The line over the Explore map's scale: whose numbers it summarizes. When fewer members have a value
 * than are in view, it gives both counts and the reason in words, so "from 529 members" never sits
 * beside "539 members" unexplained. Its own module, so only the map (loaded when it shows) carries it.
 */
export function mapScaleCaption({
  mode,
  scope,
  scored,
  total,
}: {
  mode: "match" | "party";
  /** Who is in view, for example "members" or "Republican senators". */
  scope: string;
  /** Members with a value: a match score, or a party-line record. */
  scored: number;
  /** Members in view. */
  total: number;
}): string {
  const measure =
    mode === "match" ? "Median match with you" : "Median share of votes with their party";
  if (scored >= total) return `${measure}, from ${formatInteger(scored)} ${scope}`;
  const reason = mode === "match" ? "who share a vote with you" : "with votes to count";
  return `${measure}, from the ${formatInteger(scored)} of ${formatInteger(total)} ${scope} ${reason}`;
}
