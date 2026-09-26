import { RollCallId, type Party } from "@for-the-people/core";
import { Info } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Board } from "@/components/rollcall/board";
import { Hemicycle } from "@/components/rollcall/hemicycle";
import { HowYouWouldVote } from "@/components/bills/how-you-would-vote";
import { RollCallReceiptButton } from "@/components/bills/receipt-button";
import { YourMembers } from "@/components/bills/your-members";
import { MemberPositions } from "@/components/rollcall/member-positions";
import { PartySplit } from "@/components/rollcall/party-split";
import { POSITION_LABEL } from "@/components/rollcall/position-cell";
import { ResultBar } from "@/components/rollcall/result-bar";
import { partyPlural } from "@/lib/bill-views";
import { chamberName, formatDateLong, formatInteger } from "@/lib/format";
import { plainVoteTitle } from "@/lib/outcomes";
import { getKeyVoteRollCallIds, getRollCallPage, type RollCallPageView } from "@/server/bills";

export async function generateStaticParams() {
  const ids = await getKeyVoteRollCallIds();
  return (ids.length > 0 ? ids : ["senate-119-1-372"]).map((id) => ({ id }));
}

/**
 * The page's headline: the vote in plain words, naming the measure by its short name or number
 * (lib/outcomes.ts, a fixed lookup), or the official question when there is no plain line for it.
 */
function headline({ board, measure }: RollCallPageView): { text: string; plain: boolean } {
  const plain = plainVoteTitle(
    board.rollCall,
    measure ? (measure.shortName ?? measure.label) : null,
  );
  return plain ? { text: plain, plain: true } : { text: board.rollCall.question, plain: false };
}

export async function generateMetadata({ params }: PageProps<"/votes/[id]">): Promise<Metadata> {
  const { id } = await params;
  const page = RollCallId.safeParse(id).success ? await getRollCallPage(id) : null;
  if (!page) return { title: "Vote not found" };
  const { rollCall } = page.board;
  return {
    title: `${chamberName(rollCall.chamber)} roll call ${rollCall.number}: ${headline(page).text}`,
    description: page.board.summary,
  };
}

const COLUMNS = ["Yea", "Nay", "Present", "NotVoting"] as const;

export default async function VotePage({ params }: PageProps<"/votes/[id]">) {
  const { id } = await params;
  if (!RollCallId.safeParse(id).success) notFound();
  const page = await getRollCallPage(id);
  if (!page) notFound();
  const { board, measure } = page;
  const { rollCall } = board;
  const subject = `${chamberName(rollCall.chamber)} roll call ${rollCall.number}`;
  const title = headline(page);

  return (
    <article className="mx-auto flex w-full max-w-4xl flex-col gap-12">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <p className="text-base font-bold text-ink-2 tabular-nums">
            {subject}, {formatDateLong(rollCall.date)}
          </p>
          <h1 className="text-3xl leading-[1.1] font-extrabold tracking-tight text-ink md:text-5xl">
            {title.text}
          </h1>
          <div className="flex max-w-[68ch] flex-col gap-1 type-meta text-ink-2">
            {title.plain && (
              <p>
                <span className="font-bold">Official question:</span> {rollCall.question}
              </p>
            )}
            {rollCall.title && rollCall.title.toLowerCase() !== measure?.title.toLowerCase() && (
              <p>{rollCall.title}</p>
            )}
          </div>
          {measure ? (
            <p className="text-base text-ink-2">
              On{" "}
              <Link
                href={`/bills/${measure.id}`}
                className="-my-2 inline-block py-2 font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
              >
                {measure.label}: {measure.title}
              </Link>
            </p>
          ) : (
            <p className="text-base text-ink-2">This vote was not on a bill or resolution.</p>
          )}
        </div>

        <div className="flex flex-col gap-8 border-y border-hairline py-6">
          <ResultBar rollCall={rollCall} variant="full" />

          <div
            className="flex flex-col gap-3"
            data-fact="party-totals"
            data-receipt-id={rollCall.receipt.sourceId}
          >
            <p id="by-party" className="type-meta font-bold text-ink-2">
              How each party voted
            </p>
            <PartySplit tallies={board.tallies} />
            <table className="sr-only" aria-labelledby="by-party">
              <thead>
                <tr>
                  <th scope="col">Party</th>
                  {COLUMNS.map((position) => (
                    <th key={position} scope="col">
                      {POSITION_LABEL[position]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {board.tallies.map((tally) => (
                  <tr key={tally.party}>
                    <th scope="row">{partyPlural(tally.party as Party, 2)}</th>
                    {[tally.yea, tally.nay, tally.present, tally.notVoting].map((count, index) => (
                      <td key={index}>{formatInteger(count)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {board.keyVote && (
          <div className="flex max-w-[68ch] items-start gap-3 rounded-card bg-you-soft p-4 md:p-5">
            <Info className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden />
            <p className="text-base text-ink">
              <span className="font-bold">Key vote.</span> For The People asks voters about this
              roll call.{" "}
              {board.keyVote.yeaSupportsMeasure
                ? "A Yea here supported the bill."
                : "A Yea here worked against the bill."}
            </p>
          </div>
        )}
        <RollCallReceiptButton
          rollCall={rollCall}
          subject={subject}
          label="Receipt for this vote"
          className="-mt-3 w-fit"
        />
      </header>

      {board.keyVote && (
        <section aria-labelledby="you" className="flex flex-col gap-4">
          <h2 id="you" className="text-2xl font-bold text-ink">
            How you would vote
          </h2>
          <HowYouWouldVote card={board.keyVote} />
        </section>
      )}

      <a
        href="#members"
        className="sr-only rounded-control bg-ink px-4 py-3 text-sm font-bold text-paper focus:not-sr-only focus:w-fit"
      >
        Skip to how every member voted
      </a>
      <section aria-label="The chamber">
        <Hemicycle
          board={board}
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

      <section aria-label="The Board">
        <Board board={board} repeatsHeader />
      </section>

      <section aria-labelledby="your-members" className="flex flex-col gap-4">
        <h2 id="your-members" className="text-2xl font-bold text-ink">
          How your members voted
        </h2>
        <YourMembers boards={[board]} />
      </section>

      <section aria-labelledby="members" className="flex scroll-mt-24 flex-col gap-4">
        <h2 id="members" tabIndex={-1} className="text-2xl font-bold text-ink outline-none">
          How every member voted
        </h2>
        <MemberPositions board={board} />
      </section>
    </article>
  );
}
