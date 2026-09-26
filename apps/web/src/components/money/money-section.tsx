import type { MoneyRecord } from "@for-the-people/data/read/money";
import { sankey, type SankeyLink, type SankeyNode } from "d3-sankey";
import { ChevronDown } from "lucide-react";
import { RiverPaths } from "@/components/money/river-paths";
import {
  formatDate,
  formatDollars,
  formatDollarsCompact,
  formatShare,
  titleCaseName,
} from "@/lib/format";
import { moneyBar, moneyFlows, moneyTakeaway, TRANSFERS_NOTE, type MoneyFlow } from "@/lib/money";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Money: FEC totals for the 2026 cycle, aggregates only, and the money river,
 * a sankey from source types to the campaign.
 */

interface NodeDatum {
  id: string;
}
type Node = SankeyNode<NodeDatum, { value: number }>;
type Link = SankeyLink<NodeDatum, { value: number }>;

/** Chart labels that fit the label column; the table and the receipt keep the full wording. */
const CHART_LABELS: Partial<Record<string, string>> = {
  transfers: "Transfers from committees",
  other: "Other money",
};

/**
 * Rows in pixels. Labels are two lines of 13px text centered on their bar, so bars sit at least 38px apart;
 * the top rows hold the campaign committee's name, which may wrap to two lines.
 */
const HEIGHT = 262;
const TOP = 48;
const BOTTOM = 14;
const NODE_PADDING = 38;

/**
 * The money river. Labels are HTML at their real size in a fixed column and the flows fill the rest of the
 * width, so text never scales with the chart. Only the vertical layout comes from d3-sankey, computed here on
 * the server; the chart reserves its height, so nothing shifts.
 */
function River({
  flows,
  receipts,
  campaign,
  label,
}: {
  flows: MoneyFlow[];
  receipts: number;
  campaign: string;
  label: string;
}) {
  const layout = sankey<NodeDatum, { value: number }>()
    .nodeId((node) => node.id)
    .nodeWidth(1)
    .nodePadding(NODE_PADDING)
    .extent([
      [0, TOP],
      [100, HEIGHT - BOTTOM],
    ])({
    nodes: [...flows.map((flow) => ({ id: flow.key })), { id: "campaign" }],
    links: flows.map((flow) => ({ source: flow.key, target: "campaign", value: flow.amount })),
  });
  const nodes = layout.nodes as Node[];
  const target = nodes.find((node) => node.id === "campaign");
  return (
    <div
      role="img"
      aria-label={label}
      className="grid grid-cols-[7.5rem_minmax(0,1fr)] @min-[30rem]:grid-cols-[13rem_minmax(0,1fr)]"
      style={{ height: HEIGHT }}
    >
      <div className="relative">
        {nodes.map((node) => {
          const flow = flows.find((candidate) => candidate.key === node.id);
          if (!flow) return null;
          return (
            <p
              key={node.id}
              className="absolute right-0 flex -translate-y-1/2 flex-col items-end pr-3 text-right text-sm leading-[1.3]"
              style={{ top: ((node.y0 ?? 0) + (node.y1 ?? 0)) / 2 }}
            >
              <span className="font-bold whitespace-nowrap text-ink">
                <span className="@min-[30rem]:hidden">{flow.short}</span>
                <span className="hidden @min-[30rem]:inline">
                  {CHART_LABELS[flow.key] ?? flow.label}
                </span>
              </span>
              <span className="whitespace-nowrap text-ink-2 tabular-nums">
                {formatDollarsCompact(flow.amount)}, {formatShare(flow.amount, receipts)}
              </span>
            </p>
          );
        })}
      </div>
      <div className="relative">
        <RiverPaths
          height={HEIGHT}
          links={(layout.links as Link[]).map((link) => ({
            key: (link.source as Node).id,
            y0: link.y0 ?? 0,
            y1: link.y1 ?? 0,
            width: link.width ?? 1,
          }))}
        />
        {nodes.map((node) => (
          <span
            key={node.id}
            className={cn(
              "absolute w-2.5 rounded-[3px] bg-ink",
              node.id === "campaign" ? "right-0" : "left-0",
            )}
            style={{
              top: node.y0 ?? 0,
              height: Math.max(2, (node.y1 ?? 0) - (node.y0 ?? 0)),
            }}
          />
        ))}
        {target && (
          // The committee's name at every width (one name for the river's target), up to two lines.
          <p
            className="absolute right-0 line-clamp-2 max-w-full text-right text-sm leading-tight font-bold text-ink"
            style={{ bottom: HEIGHT - (target.y0 ?? TOP) + 6 }}
          >
            {campaign}
          </p>
        )}
      </div>
    </div>
  );
}

/** Fills for the bar's segments, darkest first; the labels beside the bar carry the meaning. */
const SEGMENT_FILLS = [
  "bg-ink",
  "bg-ink-2",
  "bg-ink-3-graphic",
  "bg-hairline",
  "bg-paper ring-1 ring-ink-3-graphic ring-inset",
  "bg-canvas ring-1 ring-ink-2 ring-inset",
];

/**
 * "Where their money came from": one 100% bar split by source, largest first, then each source named
 * with its amount and share of money raised, in the bar's order. The bar repeats what the labels say,
 * so screen readers read the labels only.
 */
function ShareBar({ flows, receipts }: { flows: MoneyFlow[]; receipts: number }) {
  const segments = moneyBar(flows);
  return (
    <div className="flex flex-col gap-3">
      <div aria-hidden className="flex h-6 w-full gap-0.5 overflow-hidden rounded-input">
        {segments.map((segment, index) => (
          <span
            key={segment.key}
            className={cn(
              "h-full min-w-[3px] first:rounded-l-input last:rounded-r-input",
              SEGMENT_FILLS[index % SEGMENT_FILLS.length],
            )}
            style={{ width: `${segment.width}%` }}
          />
        ))}
      </div>
      <ul className="flex flex-col gap-1.5">
        {segments.map((segment, index) => (
          <li
            key={segment.key}
            className="grid grid-cols-[0.875rem_minmax(0,1fr)_auto] items-baseline gap-x-2.5 text-sm"
          >
            <span
              aria-hidden
              className={cn(
                "size-3.5 translate-y-0.5 rounded-[3px]",
                SEGMENT_FILLS[index % SEGMENT_FILLS.length],
              )}
            />
            <span className="font-bold text-ink">{CHART_LABELS[segment.key] ?? segment.label}</span>
            <span className="text-right whitespace-nowrap text-ink-2 tabular-nums">
              {formatDollarsCompact(segment.amount)},{" "}
              <span className="font-bold text-ink">{formatShare(segment.amount, receipts)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MoneySection({ money, name }: { money: MoneyRecord | null; name: string }) {
  if (!money) {
    return (
      <p className="rounded-card bg-paper p-5 text-base text-ink-2">
        No record yet of 2026 campaign money filed with the FEC.
      </p>
    );
  }
  const { summary, committee, source } = money;
  const flows = moneyFlows(summary);
  const figures = [
    { label: "Money raised", value: summary.receipts },
    { label: "Cash on hand", value: summary.cashOnHand },
    { label: "Debts", value: summary.debts },
  ];
  const takeaway = moneyTakeaway(summary, flows);
  const summaryText = `${name}'s campaign reported raising ${formatDollars(summary.receipts)} through ${formatDate(summary.asOf)}.${takeaway ? ` ${takeaway}` : ""}`;
  const campaign = titleCaseName(committee.name);

  return (
    <div
      className="@container flex flex-col gap-5 rounded-card bg-paper p-5 md:p-6"
      data-fact="finance-summary"
      data-receipt-id={source.id}
    >
      {/* Labels share a row and figures share the next, so every figure sits on one baseline. */}
      <dl className="grid grid-cols-3 grid-rows-[auto_auto] divide-x divide-hairline">
        {figures.map((figure) => (
          <div
            key={figure.label}
            className="row-span-2 grid grid-rows-subgrid items-end gap-y-1 px-3 first:pl-0 last:pr-0 @min-[30rem]:px-5"
          >
            <dt className="text-sm leading-snug text-ink-2">{figure.label}</dt>
            <dd
              className="text-xl leading-none font-extrabold tracking-tight text-ink tabular-nums @min-[30rem]:text-2xl @min-[40rem]:text-3xl"
              title={formatDollars(figure.value)}
            >
              {formatDollarsCompact(figure.value)}
            </dd>
          </div>
        ))}
      </dl>
      {flows.length > 0 && summary.receipts > 0 && (
        <figure className="flex flex-col gap-3 border-t border-hairline pt-5">
          <figcaption className="flex flex-col gap-1">
            <span className="text-lg font-bold text-ink">Where their money came from</span>
            {takeaway && <span className="text-base text-ink-2 tabular-nums">{takeaway}</span>}
          </figcaption>
          <ShareBar flows={flows} receipts={summary.receipts} />
          {flows.some((flow) => flow.key === "transfers") && (
            <p className="text-sm text-ink-2">{TRANSFERS_NOTE}</p>
          )}
          <details className="group/river text-sm">
            <summary
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <span className="group-open/river:hidden">See how the money flows</span>
              <span className="hidden group-open/river:inline">Hide the money flow</span>
              <ChevronDown
                className="size-4 text-ink-2 transition-transform duration-200 group-open/river:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="pt-4">
              <River
                flows={flows}
                receipts={summary.receipts}
                campaign={campaign}
                label={summaryText}
              />
            </div>
          </details>
          <details className="group text-sm">
            <summary
              className={cn(
                buttonVariants({ variant: "outline" }),
                "w-fit cursor-pointer list-none [&::-webkit-details-marker]:hidden",
              )}
            >
              <span className="group-open:hidden">View as table</span>
              <span className="hidden group-open:inline">Hide table</span>
              <ChevronDown
                className="size-4 text-ink-2 transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <table className="mt-3 w-full text-left tabular-nums">
              <thead>
                <tr className="border-b border-hairline text-ink-2">
                  <th className="py-1.5 font-bold">Source</th>
                  <th className="py-1.5 text-right font-bold">Amount</th>
                  <th className="py-1.5 text-right font-bold">Share of money raised</th>
                </tr>
              </thead>
              <tbody>
                {flows.map((flow) => (
                  <tr key={flow.key} className="border-b border-hairline">
                    <td className="py-1.5 pr-3 text-ink">{flow.label}</td>
                    <td className="py-1.5 text-right text-ink">{formatDollars(flow.amount)}</td>
                    <td className="py-1.5 text-right text-ink-2">
                      {formatShare(flow.amount, summary.receipts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </figure>
      )}
      <ul className="flex flex-col gap-1 text-sm text-ink-2">
        <li data-fact="small-dollar-share" data-receipt-id="method-small-dollar">
          {summary.smallDollarShare === null
            ? "Share in donations of $200 or less: No record yet."
            : `${formatShare(summary.smallDollarShare * 100_000, 100_000)} of the money from individual donors came in donations of $200 or less each.`}
        </li>
        <li data-fact="in-state-share" data-receipt-id="method-in-state">
          {summary.inStateShare === null
            ? "Share from inside the state: No record yet."
            : `${formatShare(summary.inStateShare * 100_000, 100_000)} of the money from donors listed by name (generally those who gave more than $200) came from inside the state.`}
        </li>
      </ul>
      <p className="text-sm text-ink-2">
        Totals for {campaign}, filed with the FEC, through {formatDate(summary.asOf)}. We never show
        individual donors.
      </p>
    </div>
  );
}
