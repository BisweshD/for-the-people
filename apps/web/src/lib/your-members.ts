/**
 * The voter's own members of Congress: both senators from the saved state and the House member for the
 * saved district in this Congress (the cd119 id; a cd120 id is next year's ballot district).
 */
export function isYourMember(
  member: { state: string; chamber: "house" | "senate"; district: number | null },
  location: { state: string; districts: readonly string[] } | null,
): boolean {
  if (!location || member.state !== location.state) return false;
  if (member.chamber === "senate") return true;
  const house = location.districts
    .map((id) => /^([A-Z]{2})-(\d{1,2})@cd119$/.exec(id))
    .find((match) => match !== null);
  return house !== undefined && member.district === Number(house[2]);
}
