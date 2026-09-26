import { formatInteger } from "@/lib/format";
import { sharesSummary, shortHeading, type SectionShare } from "@/lib/summary-sections";

/**
 * How a long bill's sections split across its titles: one bar per title, in the bill's order, every bar
 * starting at zero so their lengths compare directly, each with its name and count beside it. The
 * track is all of the bill's sections. Every row links to its title's disclosure (SummaryAnchors opens
 * it). Ink and hairline only: the bar measures length, not a side.
 */
export function SummaryBar({
  total,
  rows,
  noun,
  receiptId,
}: {
  total: number;
  rows: readonly SectionShare[];
  /** What the rows are, in the bill's own word: "title" or "division". */
  noun: string;
  /** The CRS summary's Receipt: the counts are read from its text. */
  receiptId: string;
}) {
  const percent = (fraction: number) => `${(fraction * 100).toFixed(2)}%`;
  return (
    <nav
      aria-labelledby="summary-bar"
      aria-describedby="summary-bar-summary"
      data-fact="summary-section-counts"
      data-receipt-id={receiptId}
      className="flex flex-col gap-2"
    >
      <p id="summary-bar" className="type-meta font-bold text-ink-2 tabular-nums">
        {formatInteger(total)} sections, by {noun}
      </p>
      <p id="summary-bar-summary" className="sr-only">
        {sharesSummary({ total, rows }, noun)}
      </p>
      <ol className="flex flex-col">
        {rows.map((row) => (
          <li key={row.id}>
            <a
              href={`#${row.id}`}
              aria-label={`${shortHeading(row.heading)}, ${formatInteger(row.count)} of ${formatInteger(total)} sections`}
              className="group grid min-h-11 grid-cols-[minmax(0,1fr)_auto] content-center items-center gap-x-4 gap-y-1 rounded-control md:min-h-8 md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)_4.5rem]"
            >
              <span className="truncate type-meta text-ink-2 underline decoration-transparent underline-offset-4 group-hover:text-ink group-hover:decoration-ink">
                {row.name}
              </span>
              <span className="text-right type-meta text-ink-2 tabular-nums md:order-last">
                {formatInteger(row.count)} of {formatInteger(total)}
              </span>
              <span
                aria-hidden
                className="relative col-span-2 h-1.5 rounded-full bg-hairline md:col-span-1"
              >
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-ink-3-graphic group-hover:bg-ink"
                  style={{
                    width: percent(row.share),
                    // A one-section title still shows a mark on a phone.
                    minWidth: row.count > 0 ? 3 : 0,
                  }}
                />
              </span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
