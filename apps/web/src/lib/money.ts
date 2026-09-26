import type { FinanceSummary } from "@for-the-people/core/client";
import { formatDollarsCompact, formatShare } from "./format";

/**
 * Splits total receipts into source types for the money river. Transfers from joint fundraising and the
 * campaign's other authorized committees are their own source (FEC TRANS_FROM_AUTH); "Other receipts" is
 * only what no named type covers, such as refunds and loans from others.
 */
export interface MoneyFlow {
  key: "individual" | "pacs" | "party" | "self" | "transfers" | "other";
  label: string;
  /** Fits beside the river on a phone. */
  short: string;
  amount: number;
}

export function moneyFlows(summary: FinanceSummary): MoneyFlow[] {
  const named: MoneyFlow[] = [
    { key: "individual", label: "Individuals", short: "Individuals", amount: summary.individual },
    { key: "pacs", label: "PACs and other committees", short: "PACs", amount: summary.pacs },
    { key: "party", label: "Party committees", short: "Party", amount: summary.party },
    { key: "self", label: "The candidate", short: "Candidate", amount: summary.selfFunding },
    {
      key: "transfers",
      label: "Transfers from joint fundraising and other campaign committees",
      short: "Transfers",
      amount: summary.transfers,
    },
  ];
  const namedTotal = named.reduce((sum, flow) => sum + Math.max(0, flow.amount), 0);
  const other = summary.receipts - namedTotal;
  const flows = named.filter((flow) => flow.amount > 0);
  if (other > 0.5)
    flows.push({
      key: "other",
      label: "Other money (refunds, loans from others, and the like)",
      short: "Other",
      amount: other,
    });
  return flows;
}

/**
 * "Where their money came from": the same flows as the river, largest first with "Other money" (a
 * remainder, never a source) last, each with its width in a 100% bar. Widths divide the flows' own
 * total, so the bar is always full; the labels beside it give each share of money raised.
 */
export function moneyBar(flows: readonly MoneyFlow[]): Array<MoneyFlow & { width: number }> {
  const total = flows.reduce((sum, flow) => sum + flow.amount, 0);
  if (total <= 0) return [];
  return flows
    .toSorted(
      (a, b) => Number(a.key === "other") - Number(b.key === "other") || b.amount - a.amount,
    )
    .map((flow) => ({ ...flow, width: (flow.amount / total) * 100 }));
}

/**
 * One line above the chart: the share of receipts from the largest named source. "Other receipts" is a
 * remainder, never a source, so it is never the takeaway.
 */
export const TRANSFERS_NOTE =
  "Transfers are money that joint fundraising committees and the candidate's other authorized committees raised from individuals and political committees and passed on to this campaign.";

export function moneyTakeaway(summary: FinanceSummary, flows: readonly MoneyFlow[]): string | null {
  const largest = flows
    .filter((flow) => flow.key !== "other")
    .toSorted((a, b) => b.amount - a.amount)[0];
  if (!largest || summary.receipts <= 0) return null;
  const percent = formatShare(largest.amount, summary.receipts);
  const share = percent.charAt(0).toUpperCase() + percent.slice(1);
  const total = formatDollarsCompact(summary.receipts);
  if (largest.key === "transfers")
    return `${share} of the ${total} arrived as transfers from joint fundraising and other committees the candidate authorized.`;
  const from: Record<Exclude<MoneyFlow["key"], "transfers" | "other">, string> = {
    individual: "individuals",
    pacs: "PACs and other committees",
    party: "party committees",
    self: "the candidate",
  };
  return `${share} of the ${total} came from ${from[largest.key as keyof typeof from]}.`;
}

/**
 * One name for the money section on every profile: the FEC's two-year reporting period, read from the
 * summary's cycle. Whether the FEC lists a candidacy that year is a note under it, never a second name.
 * An FEC candidacy is a filing, not ballot status (the FEC records no primary results or withdrawals),
 * so the note says so and points to the Ballot page; `ballotLink` is the part of the note that links there.
 */
export function moneyPeriod({
  cycle,
  hasFecCandidacy,
  lastName,
}: {
  cycle: number;
  hasFecCandidacy: boolean;
  lastName: string;
}): { period: string; note: string; ballotLink: string | null } {
  const start = String(cycle - 1);
  const end = String(cycle);
  const period = `${start}–${start.slice(0, 2) === end.slice(0, 2) ? end.slice(2) : end}`;
  if (!hasFecCandidacy)
    return {
      period,
      note: `The filings we hold from the Federal Election Commission (FEC) do not list ${lastName} as a ${cycle} candidate. The campaign still reports its money for each two-year period.`,
      ballotLink: null,
    };
  const ballotLink = "Ballot page";
  return {
    period,
    note: `The Federal Election Commission (FEC) lists ${lastName} as a ${cycle} candidate. FEC filings do not show who won a primary or who dropped out, so check the ${ballotLink} for who is on the November ballot.`,
    ballotLink,
  };
}
