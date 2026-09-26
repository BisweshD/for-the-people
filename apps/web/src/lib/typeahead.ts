/**
 * Listbox typeahead (WAI-ARIA APG): the option whose label starts with what was typed. A single letter, or
 * the same letter repeated, moves on from the current option so repeated presses cycle; a longer search can
 * stay on the current option. Returns the current index when nothing matches.
 */
export function typeaheadMatch(labels: readonly string[], current: number, search: string): number {
  const query = search.toLowerCase();
  const repeated = query.length > 1 && [...query].every((char) => char === query[0]);
  const needle = repeated ? query[0]! : query;
  const start = Math.max(current, 0) + (needle.length === 1 && current >= 0 ? 1 : 0);
  for (let step = 0; step < labels.length; step++) {
    const index = (start + step) % labels.length;
    if (labels[index]!.toLowerCase().startsWith(needle)) return index;
  }
  return current;
}
