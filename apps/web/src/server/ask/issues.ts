/**
 * Plain words people use for each issue area, so "tariffs" finds Trade and "stablecoins" finds Tech and
 * crypto. Matching is by whole word (or word prefix for stems ending in "-").
 */
const ISSUE_WORDS: Record<string, readonly string[]> = {
  "health-care": [
    "health",
    "aca",
    "obamacare",
    "affordable care",
    "premium",
    "insurance",
    "medicaid",
  ],
  "taxes-and-spending": ["tax", "taxes", "big beautiful", "obbba", "h.r. 1", "reconciliation"],
  "war-and-foreign-policy": [
    "iran",
    "war powers",
    "war",
    "ukraine",
    "russia",
    "sanction-",
    "foreign policy",
  ],
  immigration: ["immigra-", "laken riley", "border", "detention", "deport-"],
  trade: ["tariff-", "canada", "trade"],
  elections: ["save act", "voter registration", "citizenship", "election-", "voting rights"],
  labor: ["union-", "bargaining", "workforce", "worker-", "labor"],
  "climate-and-energy": [
    "climate",
    "clean car-",
    "electric vehicle-",
    "ev",
    "emission-",
    "california waiver",
    "energy",
  ],
  abortion: ["abortion", "born-alive", "born alive"],
  "tech-and-crypto": ["genius", "stablecoin-", "crypto-", "tech"],
  "education-and-culture": ["sports", "title ix", "girls", "women's sports", "school sports"],
  "crime-and-drugs": ["fentanyl", "drug-", "crime", "opioid-"],
  "government-spending": [
    "rescission-",
    "public broadcasting",
    "npr",
    "pbs",
    "foreign aid",
    "spending cut-",
  ],
  guns: ["gun-", "firearm-", "second amendment"],
};

const escape = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const PATTERNS = Object.entries(ISSUE_WORDS).map(([id, list]) => ({
  id,
  patterns: list.map((word) =>
    word.endsWith("-")
      ? new RegExp(`\\b${escape(word.slice(0, -1))}\\w*`, "i")
      : new RegExp(`\\b${escape(word)}\\b`, "i"),
  ),
}));

export interface IssueRef {
  id: string;
  label: string;
}

/**
 * Finds the issue area a piece of text is about, among the areas that exist: by id or label first,
 * then by everyday words. Returns null when nothing matches.
 */
export function resolveIssue(text: string, areas: readonly IssueRef[]): IssueRef | null {
  const lower = text.toLowerCase().trim();
  if (!lower) return null;
  const direct = areas.find(
    (area) =>
      area.id === lower ||
      area.label.toLowerCase() === lower ||
      lower.includes(area.label.toLowerCase()),
  );
  if (direct) return direct;
  for (const { id, patterns } of PATTERNS) {
    const area = areas.find((candidate) => candidate.id === id);
    if (area && patterns.some((pattern) => pattern.test(lower))) return area;
  }
  return null;
}
