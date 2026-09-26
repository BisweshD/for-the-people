/** Name suffixes that are never the surname ("Jr.", "III"). */
const SUFFIX = /^(jr|sr|i{1,3}|iv|v|vi)\.?$/i;
/** Words that begin a multi-word surname ("Van Epps", "De La Cruz"). */
const PARTICLE = /^(van|von|de|del|della|der|di|da|du|la|le|st\.?|mac)$/i;

/**
 * Two letters for a portrait with no photo: the first name's and the surname's. When the surname is
 * known ("Van Epps", "Blunt Rochester") it is used as given; otherwise it is found in the full name,
 * skipping suffixes, nicknames in quotes or brackets, and keeping surname particles ("Matt Van Epps"
 * is MV, "Sanford D. Bishop, Jr." is SB).
 */
export function initials(name: string, lastName?: string): string {
  const words = name
    .replace(/["“”(][^"“”)]*["“”)]/g, " ")
    .split(/[\s,]+/)
    .filter((word) => /^\p{L}/u.test(word));
  while (words.length > 1 && SUFFIX.test(words.at(-1)!)) words.pop();
  const first = words[0]?.[0] ?? "";
  let last = lastName?.trim().split(/\s+/)[0]?.[0];
  if (!last && words.length > 1) {
    let start = words.length - 1;
    while (start > 1 && PARTICLE.test(words[start - 1]!)) start -= 1;
    last = words[start]![0];
  }
  return `${first}${last ?? ""}`.toUpperCase();
}
