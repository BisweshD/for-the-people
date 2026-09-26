import { MeasureId } from "@for-the-people/core";
import { ChevronDown, CircleCheck, CircleDashed, CircleX, type LucideIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import {
  CrsReceiptButton,
  CrsSummaryLabel,
  READING_CLASS,
  SummaryBlocks,
} from "@/components/bills/crs-summary";
import { Board } from "@/components/rollcall/board";
import { Hemicycle } from "@/components/rollcall/hemicycle";
import { HowYouWouldVote } from "@/components/bills/how-you-would-vote";
import { ReceiptButton } from "@/components/bills/receipt-button";
import { RollCallList } from "@/components/bills/roll-call-list";
import { YourMembers } from "@/components/bills/your-members";
import { PartyTag } from "@/components/party-tag";
import type { ReceiptItem } from "@/components/receipt/receipt-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  measureStatusLine,
  summaryLead,
  summaryPreviewLength,
  type BillPageView,
  type MeasureView,
} from "@/lib/bill-views";
import { chamberName, formatDate, formatDateLong } from "@/lib/format";
import type { MeasureOutcome } from "@/lib/outcomes";
import { cn } from "@/lib/utils";
import { getBillPage, getKeyVoteMeasureIds } from "@/server/bills";

const MEASURE_METHOD =
  "For The People reads each bill's titles, sponsor, status, and summary from the official bill status file that the Government Publishing Office publishes for Congress.";

export async function generateStaticParams() {
  const ids = await getKeyVoteMeasureIds();
  return (ids.length > 0 ? ids : ["119-hr-1"]).map((id) => ({ id }));
}

export async function generateMetadata({ params }: PageProps<"/bills/[id]">): Promise<Metadata> {
  const { id } = await params;
  const page = MeasureId.safeParse(id).success ? await getBillPage(id) : null;
  if (!page) return { title: "Bill not found" };
  return {
    title: `${page.measure.label}: ${page.measure.title}`,
    description: `What ${page.measure.label} does, every recorded vote on it, and how each member voted, from the official record.`,
  };
}

function measureReceipt(measure: MeasureView): ReceiptItem {
  return {
    title: `${measure.label} bill status`,
    lines: [
      { label: "Status", value: measure.outcome.label },
      { label: "Latest action", value: measure.latestAction },
      { label: "Date", value: formatDate(measure.latestActionDate) },
      ...(measure.introducedDate
        ? [{ label: "Introduced", value: formatDate(measure.introducedDate) }]
        : []),
    ],
    receipt: measure.receipt,
    verified: null,
    href: measure.congressUrl,
  };
}

/** The status as a badge (a label, never a button's look); its mark carries the tone with the words. */
const STATUS_MARK: Record<MeasureOutcome["tone"], LucideIcon> = {
  law: CircleCheck,
  adopted: CircleCheck,
  passed: CircleDashed,
  failed: CircleX,
  pending: CircleDashed,
};

function StatusBadge({ outcome }: { outcome: MeasureOutcome }) {
  const Mark = STATUS_MARK[outcome.tone];
  return (
    <Badge icon={<Mark aria-hidden />} className="text-ink">
      {outcome.label}
    </Badge>
  );
}

/** The link to the full summary page, as a secondary button. */
function FullSummaryLink({ measure, label }: { measure: MeasureView; label: string }) {
  return (
    <Button asChild variant="outline" className="w-fit">
      <Link href={`/bills/${measure.id}/summary`}>{label}</Link>
    </Button>
  );
}

const PLAIN_CLASS = "max-w-[68ch] font-serif text-lg leading-[1.6] text-ink";

/**
 * What the bill does, plain first. A key-vote bill leads with its card's reviewed plain words, with a
 * link to the key vote. Any other bill leads with the first paragraph of the official CRS summary. No
 * summary text is ever written here.
 */
function PlainSummary({ page }: { page: BillPageView }) {
  const { measure, card, featured } = page;
  const crs = measure.crsSummary;
  const keyVote = featured?.keyVote ? featured.rollCall : null;

  if (card) {
    return (
      <div
        className="flex flex-col gap-3"
        data-fact="key-vote-summary"
        data-receipt-id="method-key-votes"
      >
        <p className="type-meta font-bold text-ink-2">In plain words</p>
        <p className={PLAIN_CLASS}>{card.whatItDoes}</p>
        {keyVote && (
          <p className="text-base text-ink-2">
            This is one of the key votes For The People asks voters about.{" "}
            <Link
              href={`/votes/${keyVote.id}`}
              className="-my-2 inline-block py-2 font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
            >
              See the key vote: {chamberName(keyVote.chamber)} roll call {keyVote.number},{" "}
              {formatDateLong(keyVote.date)}
            </Link>
          </p>
        )}
      </div>
    );
  }

  const plain = measure.plainSummary?.reviewed ? measure.plainSummary : null;
  if (plain) {
    return (
      <div className="flex flex-col gap-3">
        <p className="type-meta font-bold text-ink-2">
          In plain words (written with AI, reviewed by a person)
        </p>
        <p className={PLAIN_CLASS}>{plain.text}</p>
      </div>
    );
  }

  const lead = crs ? summaryLead(crs.blocks) : null;
  if (crs && lead) {
    return (
      <div
        className="flex flex-col gap-3"
        data-fact="crs-summary-lead"
        data-receipt-id={crs.receipt.sourceId}
      >
        <p className="type-meta font-bold text-ink-2">
          From the official summary by the Congressional Research Service (CRS)
        </p>
        <p className={PLAIN_CLASS}>{lead}</p>
      </div>
    );
  }

  return (
    <p className="text-base text-ink-2">
      No record yet. The Congressional Research Service, Congress&apos;s nonpartisan research
      office, has not published a summary of this bill.
    </p>
  );
}

/**
 * The official CRS summary behind one disclosure: a preview that stops on a finished paragraph, then the
 * full text on its own page, so the bill page stays light. When the page already led with the CRS's
 * first paragraph, the preview continues after it.
 */
function OfficialSummary({ page }: { page: BillPageView }) {
  const { measure, card } = page;
  const crs = measure.crsSummary;
  if (!crs) return null;
  const lead = card || measure.plainSummary?.reviewed ? null : summaryLead(crs.blocks);
  const leadIndex = crs.blocks.findIndex(
    (block) => lead !== null && block.kind === "paragraph" && block.lines[0] === lead,
  );
  const blocks = crs.blocks.filter((_, index) => index !== leadIndex);
  const shown = summaryPreviewLength(blocks);

  return (
    <details className="group rounded-card border border-hairline bg-paper">
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 rounded-card px-4 py-3 text-base font-bold text-ink md:px-5 [&::-webkit-details-marker]:hidden">
        Official summary from the Congressional Research Service
        <ChevronDown
          className="size-5 shrink-0 transition-transform duration-200 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div
        className="flex flex-col gap-3 border-t border-hairline px-4 pt-4 pb-5 md:px-5"
        data-fact="crs-summary"
        data-receipt-id={crs.receipt.sourceId}
      >
        <CrsSummaryLabel summary={crs} />
        {blocks.length > 0 && (
          <div className={READING_CLASS}>
            <SummaryBlocks blocks={blocks.slice(0, shown)} />
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1">
          {blocks.length > shown && (
            <FullSummaryLink measure={measure} label="Read the full summary" />
          )}
          <CrsReceiptButton measure={measure} summary={crs} />
        </div>
      </div>
    </details>
  );
}

export default async function BillPage({ params }: PageProps<"/bills/[id]">) {
  const { id } = await params;
  if (!MeasureId.safeParse(id).success) notFound();
  const page = await getBillPage(id);
  if (!page) notFound();
  const { measure, sponsor, featured, card } = page;
  const main = card ? "lg:col-start-1" : undefined;
  const hasOfficial = measure.crsSummary !== null;
  /** Rows of the main column, which the sticky answer card spans from the top on wide screens. */
  const mainRows = 4 + (hasOfficial ? 1 : 0) + (featured ? 2 : 0);

  return (
    <article
      className={cn(
        "mx-auto grid w-full gap-12",
        card ? "max-w-6xl lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-14" : "max-w-4xl",
      )}
    >
      <header className={cn("flex flex-col gap-6", main)}>
        <div className="flex flex-col gap-3">
          <p
            className="text-base font-bold text-ink-2"
            data-fact="measure"
            data-receipt-id={measure.receipt.sourceId}
          >
            {measure.label}
          </p>
          <h1 className="text-4xl leading-[1.08] font-extrabold tracking-tight text-ink md:text-5xl">
            {measure.title}
          </h1>
          {measure.officialTitle !== measure.title && (
            <p className="max-w-[68ch] type-meta text-ink-2">
              <span className="font-bold">Official title:</span> {measure.officialTitle}
            </p>
          )}
          {measure.kindNote && (
            <p className="max-w-[68ch] type-meta text-ink-2">{measure.kindNote}</p>
          )}
        </div>
        <dl className="grid gap-x-8 gap-y-5 border-y border-hairline py-5 sm:grid-cols-2">
          <div
            className="flex flex-col gap-1.5"
            data-fact="measure-status"
            data-receipt-id={measure.receipt.sourceId}
          >
            <dt className="type-meta font-bold text-ink-2">Status</dt>
            <dd className="flex flex-col items-start gap-1.5">
              <StatusBadge outcome={measure.outcome} />
              <span className="text-base text-ink tabular-nums">
                {/* Non-breaking characters keep "Public Law 119-21" on one line. */}
                {measureStatusLine(measure)
                  .replace(/(\d)-(\d)/g, "$1‑$2")
                  .replace(/Law (\d)/, "Law $1")}
              </span>
              {measure.outcome.note && (
                <span className="type-meta text-ink-2">{measure.outcome.note}</span>
              )}
            </dd>
          </div>
          <div
            className="flex flex-col gap-1.5"
            data-fact="sponsor"
            data-receipt-id={measure.receipt.sourceId}
          >
            <dt className="type-meta font-bold text-ink-2">Sponsor</dt>
            {sponsor ? (
              <dd className="flex flex-col items-start gap-0.5">
                <span className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/people/${sponsor.slug}`}
                    className="-my-2 py-2 text-base font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                  >
                    {sponsor.name}
                  </Link>
                  <PartyTag party={sponsor.party} />
                </span>
                <span className="type-meta text-ink-2">{sponsor.office}</span>
              </dd>
            ) : (
              <dd className="text-base text-ink-2">No record yet.</dd>
            )}
          </div>
        </dl>
        <ReceiptButton
          subject={`${measure.label}: ${measure.title}`}
          items={[measureReceipt(measure)]}
          method={MEASURE_METHOD}
          fact="measure-status"
          label="Receipt for this bill"
          className="-mt-3 w-fit"
        />
      </header>

      <section aria-labelledby="summary" className={cn("flex flex-col gap-4", main)}>
        <h2 id="summary" className="text-2xl font-bold text-ink">
          What the bill does
        </h2>
        <PlainSummary page={page} />
      </section>

      {card && (
        <section
          aria-labelledby="you"
          className="flex flex-col gap-4 lg:sticky lg:top-24 lg:col-start-2 lg:[grid-row:1/span_var(--main-rows)] lg:self-start"
          style={{ "--main-rows": mainRows } as CSSProperties}
        >
          <h2 id="you" className="text-2xl font-bold text-ink">
            How you would vote
          </h2>
          <HowYouWouldVote card={card} />
        </section>
      )}

      {hasOfficial && (
        <section aria-label="Official summary" className={main}>
          <OfficialSummary page={page} />
        </section>
      )}

      {featured && (
        <>
          <section aria-label="The chamber" className={main}>
            <Hemicycle
              board={featured}
              answerHint={
                <>
                  Answer{" "}
                  <a href="#you" className="font-bold text-ink underline underline-offset-4">
                    How you would vote
                  </a>{" "}
                  and a marigold ring marks the side you would have joined.
                </>
              }
            />
          </section>
          <section aria-label="The Board" className={main}>
            <Board board={featured}>
              <p className="type-meta text-ink-2">
                {featured.keyVote
                  ? "This is the key vote on this bill, the one we ask you to answer. "
                  : "This is the latest vote to pass this bill. "}
                <Link
                  href={`/votes/${featured.rollCall.id}`}
                  className="-my-2 inline-block py-2 font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                >
                  See how every member voted on {chamberName(featured.rollCall.chamber)} roll call{" "}
                  {featured.rollCall.number}
                </Link>
              </p>
            </Board>
          </section>
        </>
      )}

      <section aria-labelledby="your-members" className={cn("flex flex-col gap-4", main)}>
        <h2 id="your-members" className="text-2xl font-bold text-ink">
          How your members voted
        </h2>
        <YourMembers boards={page.chamberBoards} />
      </section>

      <section aria-labelledby="roll-calls" className={cn("flex flex-col gap-4", main)}>
        <div className="flex flex-col gap-1">
          <h2 id="roll-calls" className="text-2xl font-bold text-ink">
            Every recorded vote on this bill
          </h2>
          {page.rollCalls.length > 0 && (
            <p className="type-meta text-ink-2">
              {page.rollCalls.length === 1
                ? "One recorded vote (a roll call), from the official record."
                : `${page.rollCalls.length} recorded votes (roll calls) from the official record, newest first.${page.rollCalls.some((rollCall) => rollCall.keyVote) ? " Key votes are always listed." : ""}`}
            </p>
          )}
        </div>
        {page.rollCalls.length > 0 ? (
          <RollCallList
            rollCalls={page.rollCalls}
            subject={`${measure.label}: ${measure.title}`}
            measureName={measure.shortName ?? measure.label}
          />
        ) : (
          <p className="text-base text-ink-2">No record yet of a roll call on this bill.</p>
        )}
      </section>
    </article>
  );
}
