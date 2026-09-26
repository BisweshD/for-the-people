import { ShieldCheck } from "lucide-react";
import { AnswerFirstLink } from "@/components/home/answer-first-link";
import { ElectionCountdown } from "@/components/home/election-countdown";
import { RecordSection } from "@/components/home/record-section";
import { MILESTONE_ANSWERS } from "@/components/swipe/thresholds";
import { FetchedMatchData } from "@/components/swipe/match-data";
import { SwipeDeck } from "@/components/swipe/swipe-deck";
import { HomeBallot } from "@/components/home/home-ballot";
import { usesDemoModel } from "@/server/ask/model";
import { getBallotDistrictOptions } from "@/server/ballot";
import { getDeckCards, getRollCallTally, getStatus } from "@/server/data";
import { getCountReceipts } from "@/server/trust";

const HOW_IT_WORKS = [
  {
    title: "Answer the key votes",
    body: "Choose Yea or Nay, or skip. Each one is a vote this Congress really held.",
  },
  {
    title: "See who voted like you",
    body: "Every member of Congress, ranked by how often they voted your way.",
  },
  {
    title: "Check any number",
    body: "Each number opens a receipt that shows where it came from in the official record.",
  },
];

export default async function HomePage() {
  const [cards, status, districtOptions, tally, receipts] = await Promise.all([
    getDeckCards(),
    getStatus(),
    getBallotDistrictOptions(),
    getRollCallTally(),
    getCountReceipts(),
  ]);
  return (
    <div className="flex flex-col gap-12 md:gap-16">
      <section className="mx-auto grid w-full max-w-[640px] items-start gap-8 lg:max-w-none lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:gap-14">
        <div className="flex max-w-2xl flex-col gap-3 sm:gap-5 lg:pt-6">
          <h1 className="text-[32px] leading-[1.08] font-extrabold tracking-tight text-balance text-ink sm:text-5xl xl:text-6xl">
            See how Congress voted and find who votes like you.
          </h1>
          <p className="max-w-xl text-base text-ink-2 sm:text-lg">
            Free and nonpartisan. Answer real votes from this Congress, then see which members voted
            your way.
          </p>
          {/* On phones this line sits in the ballot, beside the Receipt it describes. */}
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-ink-2 max-lg:hidden">
            <ShieldCheck className="size-4 text-agree" aria-hidden />
            Every vote is checked against the official roll call.
          </p>
          {/* Desktop only: the ballot beside the headline is taller than the pitch, so the space
              under it explains the three steps. Phones reach the ballot first. */}
          <ol className="mt-3 hidden max-w-lg flex-col border-t border-hairline lg:flex">
            {HOW_IT_WORKS.map((step, i) => (
              <li key={step.title} className="flex gap-4 border-b border-hairline py-3">
                <span className="w-5 shrink-0 pt-0.5 text-sm font-bold text-ink-3 tabular-nums">
                  {i + 1}
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-base font-semibold text-ink">{step.title}</span>
                  <span className="text-sm text-ink-2">{step.body}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>
        <section aria-label="Try the first vote" className="w-full">
          {/* A returning voter with enough answers sees their closest match here; only then is the
              ranking data fetched. */}
          <FetchedMatchData minDecided={MILESTONE_ANSWERS}>
            <SwipeDeck cards={cards} variant="hero" talk={!usesDemoModel()} />
          </FetchedMatchData>
        </section>
      </section>

      <section
        aria-labelledby="election-heading"
        className="mx-auto grid w-full max-w-[640px] gap-8 border-t border-hairline pt-10 lg:max-w-none lg:grid-cols-2 lg:gap-12"
      >
        <div className="flex flex-col gap-4">
          <h2 id="election-heading" className="text-2xl font-bold text-ink">
            The 2026 election
          </h2>
          <ElectionCountdown />
          <p className="max-w-md text-base text-ink-2">
            Every House seat and about a third of the Senate seats are on the ballot. See who is
            running where you vote, and how the ones already in Congress voted.
          </p>
        </div>
        <div className="flex flex-col justify-end gap-3">
          <HomeBallot districtOptions={districtOptions} />
          <AnswerFirstLink keyVoteIds={cards.map((card) => card.id)} />
        </div>
      </section>

      <RecordSection counts={status.counts} receipts={receipts} tally={tally} cards={cards} />
    </div>
  );
}
