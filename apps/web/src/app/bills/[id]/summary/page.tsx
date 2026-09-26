import { MeasureId } from "@for-the-people/core";
import { ChevronLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  CrsReceiptButton,
  CrsSummaryLabel,
  READING_CLASS,
  SummaryBlocks,
} from "@/components/bills/crs-summary";
import { SummaryBar } from "@/components/bills/summary-bar";
import { SummaryAnchors, SummaryExpandAll } from "@/components/bills/summary-expand";
import { SummarySections } from "@/components/bills/summary-sections";
import { SectionNav } from "@/components/trust/section-nav";
import { formatInteger } from "@/lib/format";
import { sectionShares, shortHeading, summaryOutline } from "@/lib/summary-sections";
import { getBillPage, getKeyVoteMeasureIds } from "@/server/bills";

/**
 * The full Congressional Research Service summary of one bill, as a reading page. The bill page shows a
 * preview and links here, so a long summary (H.R. 1's runs to hundreds of paragraphs) never weighs on
 * the bill page itself. A long summary opens as its titles, each a closed section with the CRS's own
 * one-line description; a short one reads straight through.
 */

export async function generateStaticParams() {
  const ids = await getKeyVoteMeasureIds();
  return (ids.length > 0 ? ids : ["119-hr-1"]).map((id) => ({ id }));
}

export async function generateMetadata({
  params,
}: PageProps<"/bills/[id]/summary">): Promise<Metadata> {
  const { id } = await params;
  const page = MeasureId.safeParse(id).success ? await getBillPage(id) : null;
  if (!page?.measure.crsSummary) return { title: "Summary not found" };
  return {
    title: `${page.measure.label} summary: ${page.measure.title}`,
    description: `The Congressional Research Service's summary of ${page.measure.label}, ${page.measure.title}.`,
  };
}

/** "title" or "division": what the top-level sections are, in the bill's own word. */
function sectionNoun(sections: ReturnType<typeof summaryOutline>["sections"]): string {
  const kinds = new Set(sections.map((section) => section.kind));
  return (kinds.size === 1 ? [...kinds][0] : null) ?? "section";
}

export default async function BillSummaryPage({ params }: PageProps<"/bills/[id]/summary">) {
  const { id } = await params;
  if (!MeasureId.safeParse(id).success) notFound();
  const page = await getBillPage(id);
  const summary = page?.measure.crsSummary;
  if (!page || !summary) notFound();
  const { measure } = page;
  const outline = summaryOutline(summary.blocks);
  const sectioned = outline.sections.length > 0;
  const noun = sectionNoun(outline.sections);
  const shares = sectionShares(outline.sections);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 xl:grid-cols-[minmax(0,48rem)_15rem] xl:justify-between">
      <article className="flex min-w-0 flex-col gap-8 xl:col-start-1 xl:row-start-1">
        {/* Below 1280 px a slim bar stays under the site header: the way back and, for a long
            summary, "Expand all". From 1280 px it is a plain row and the rail takes over. */}
        <div className="sticky top-14 z-30 -mx-4 -mt-5 flex min-h-14 items-center justify-between gap-3 border-b border-hairline bg-background px-4 md:top-16 md:-mx-6 md:-mt-10 md:px-6 xl:static xl:mx-0 xl:mt-0 xl:min-h-0 xl:border-0 xl:bg-transparent xl:px-0">
          <Link
            href={`/bills/${measure.id}`}
            className="-ml-1 inline-flex min-h-11 min-w-0 items-center gap-1 rounded-control pr-2 text-sm font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
          >
            <ChevronLeft className="size-4 shrink-0" aria-hidden />
            <span className="truncate">Back to {measure.label}</span>
          </Link>
          {sectioned && <SummaryExpandAll className="xl:hidden" />}
        </div>
        <header className="flex flex-col gap-4">
          <h1 className="text-3xl leading-[1.1] font-extrabold tracking-tight text-ink md:text-4xl">
            {measure.label}: the official summary
          </h1>
          <p className="max-w-[68ch] text-lg text-ink-2">{measure.title}</p>
          <div
            className="flex flex-col gap-2 border-y border-hairline py-4"
            data-fact="crs-summary"
            data-receipt-id={summary.receipt.sourceId}
          >
            <CrsSummaryLabel summary={summary} />
            <CrsReceiptButton measure={measure} summary={summary} />
          </div>
        </header>
        {outline.lead.length > 0 && (
          <div className={READING_CLASS}>
            <SummaryBlocks blocks={outline.lead} heading="h2" />
          </div>
        )}
        {shares && (
          <SummaryBar
            total={shares.total}
            rows={shares.rows}
            noun={noun}
            receiptId={summary.receipt.sourceId}
          />
        )}
        {sectioned && (
          <div className="flex flex-col gap-3">
            <p className="type-meta text-ink-2 tabular-nums">
              The full summary, in {formatInteger(outline.sections.length)} {noun}
              {outline.sections.length === 1 ? "" : "s"} (the bill&apos;s main parts). Open one to
              read it, or expand all.
            </p>
            <SummarySections sections={outline.sections} />
            <SummaryAnchors />
          </div>
        )}
      </article>
      {sectioned && (
        <aside className="hidden xl:sticky xl:top-24 xl:col-start-2 xl:row-start-1 xl:flex xl:max-h-[calc(100dvh-7rem)] xl:flex-col xl:gap-4 xl:self-start xl:overflow-y-auto xl:pt-14">
          <SectionNav
            items={outline.sections.map((section) => ({
              id: section.id,
              label: shortHeading(section.heading),
            }))}
          />
          <SummaryExpandAll className="w-fit" />
        </aside>
      )}
    </div>
  );
}
