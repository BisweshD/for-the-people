import { ReceiptButton } from "@/components/bills/receipt-button";
import type { MeasureView, SummaryBlock } from "@/lib/bill-views";
import { formatDate } from "@/lib/format";

/** The Congressional Research Service summary, shared by the bill page preview and the full summary page. */

type CrsSummary = NonNullable<MeasureView["crsSummary"]>;

const CRS_METHOD =
  "The Congressional Research Service writes these nonpartisan summaries for Congress. For The People shows the latest one as published, without edits.";

export const READING_CLASS =
  "flex max-w-[68ch] flex-col gap-4 font-serif text-lg leading-[1.6] text-ink";

/** CRS text as reading copy: serif paragraphs and lists, with its title lines as small sans headings. */
export function SummaryBlocks({
  blocks,
  heading: Heading = "h3",
}: {
  blocks: SummaryBlock[];
  heading?: "h2" | "h3" | "h4" | "h5" | "h6";
}) {
  return blocks.map((block, index) =>
    block.kind === "list" ? (
      <ul key={index} className="list-disc space-y-2 pl-6">
        {block.lines.map((line, item) => (
          <li key={item}>{line}</li>
        ))}
      </ul>
    ) : block.kind === "heading" ? (
      <Heading key={index} className="pt-2 font-sans text-base leading-snug font-bold text-ink">
        {block.lines[0]}
      </Heading>
    ) : (
      <p key={index}>{block.lines[0]}</p>
    ),
  );
}

/**
 * "Official summary by the Congressional Research Service (CRS), Congress's nonpartisan research office.
 * This version: Passed Senate, Jul 1, 2025."
 */
export function CrsSummaryLabel({ summary }: { summary: CrsSummary }) {
  return (
    <p className="type-meta font-bold text-ink-2">
      Official summary by the Congressional Research Service (CRS), Congress&apos;s nonpartisan
      research office.
      <span className="font-normal text-ink-2">
        {" "}
        This version: {summary.versionLabel}, {formatDate(summary.date)}.
      </span>
    </p>
  );
}

export function CrsReceiptButton({
  measure,
  summary,
}: {
  measure: Pick<MeasureView, "label" | "congressUrl">;
  summary: CrsSummary;
}) {
  return (
    <ReceiptButton
      subject={`${measure.label} summary`}
      items={[
        {
          title: "Congressional Research Service summary",
          lines: [
            { label: "Version", value: summary.versionLabel },
            { label: "Date", value: formatDate(summary.date) },
          ],
          receipt: summary.receipt,
          verified: null,
          href: measure.congressUrl,
        },
      ]}
      method={CRS_METHOD}
      fact="crs-summary"
      label="Receipt for this summary"
      className="w-fit"
    />
  );
}
