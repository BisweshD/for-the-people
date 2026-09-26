/**
 * Method receipts: for derived numbers (a match score, party-line %, missed votes), the receipt is the
 * published method plus the official records it is computed from. Every id here has a section on /methodology.
 */
export const METHOD_RECEIPTS = {
  "method-match": {
    title: "How the match score works",
    anchor: "match",
    summary:
      "Compares your Yea or Nay on each key vote with how the member voted on the official roll call. Votes you care more about count more, and scores stay near 50% when you share only a few votes.",
  },
  "method-key-votes": {
    title: "How key votes are chosen and checked",
    anchor: "review",
    summary:
      "A key vote is a real roll call from the 119th Congress that meets every rule of the published selection criteria. It is published only after its roll calls are checked against the House Clerk or Senate record, a data steward confirms the bill and the decisive vote, and two reviewers with different political leanings approve its wording.",
  },
  "method-party-unity": {
    title: "How we count voting with their party",
    anchor: "voting-record",
    summary:
      "Among roll calls where most Democrats and most Republicans voted opposite ways, the share where the member voted with most of their own party. Independents count with the party they caucus with.",
  },
  "method-district-lookup": {
    title: "How we find your districts",
    anchor: "districts",
    summary:
      "Your address goes to the U.S. Census Bureau's address lookup (its geocoder). It returns the district your member of Congress serves now (119th Congress) and the district on your 2026 ballot (120th Congress). We keep only the district numbers, never the address. Outlines come from the Census Bureau's TIGERweb map service.",
  },
  "method-missed-votes": {
    title: "How we count missed votes",
    anchor: "voting-record",
    summary:
      "Roll calls where the member is recorded as Not Voting, out of the roll calls the official record lists them on while they served. The Speaker, who votes only when they choose to, and delegates, who vote only in the Committee of the Whole, get no missed-vote share.",
  },
  "method-small-dollar": {
    title: "How we count small-dollar giving",
    anchor: "money",
    summary:
      "From the FEC's totals by donation size for the campaign's two-year period: the share of the money from individual donors that came in donations of $200 or less each. It counts donations, not people: three gifts of $150 from one person ($450 in all) are all counted here.",
  },
  "method-in-state": {
    title: "How we count in-state giving",
    anchor: "money",
    summary:
      "From the FEC's totals by state: the share of the money from donors listed by name (itemized) that came from inside the member's state. Campaigns must list a donor by name once the donor's gifts add up to more than $200 in the two-year period, so smaller donors are mostly left out.",
  },
  "method-compare": {
    title: "How we compare two members",
    anchor: "compare",
    summary:
      "For each key vote where both members voted Yea or Nay, we check whether they took the same side on the measure. Members of different chambers are compared through each one's roll call in their own chamber, reading a vote against the measure (such as a motion to table it) the same way the match score does.",
  },
  "method-duel": {
    title: "How Vote Duel counts agreement",
    anchor: "vote-duel",
    summary:
      "Among roll calls in the 119th Congress where both members voted Yea or Nay, the number where they voted the same way. Present and Not Voting are left out. Members of different chambers are compared only on key-vote bills, reading each vote as support for or opposition to the bill.",
  },
} as const;

export type MethodReceiptId = keyof typeof METHOD_RECEIPTS;

/** Own keys only, so prototype names such as "constructor" or "__proto__" never resolve. */
export const isMethodReceipt = (id: string): id is MethodReceiptId =>
  Object.hasOwn(METHOD_RECEIPTS, id);
