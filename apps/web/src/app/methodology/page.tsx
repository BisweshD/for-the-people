import { LOW_CONFIDENCE_N, MATCH_PRIOR_K, WEIGHT_LABELS } from "@for-the-people/core";
import { ArrowLeftRight, ChevronRight, Gauge, Weight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, ProseSection } from "@/components/trust/page-header";
import { SectionNav } from "@/components/trust/section-nav";
import { TrustLayout } from "@/components/trust/trust-layout";
import { WorkedExample } from "@/components/trust/worked-example";
import type { ExampleData } from "@/lib/worked-example";
import { getDeckCards, getKeyVoteRecord, getMemberIndex } from "@/server/data";
import { getKeyVoteSelection, getReviewSummary } from "@/server/trust";

export const metadata: Metadata = {
  title: "How For The People works",
  description:
    "How match scores work, down to the exact formula, how key votes are chosen and checked, how we count votes with party and missed votes, and what we never do.",
};

const CONTENTS = [
  { id: "match", label: "How the match score works" },
  { id: "never", label: "What we never do" },
  { id: "key-votes", label: "How key votes are chosen" },
  { id: "review", label: "How key votes are checked and reviewed" },
  { id: "voting-record", label: "Voting with party, and missed votes" },
  { id: "money", label: "Campaign money" },
  { id: "vote-duel", label: "Vote Duel" },
  { id: "compare", label: "Comparing members in Ask" },
  { id: "districts", label: "How we find your districts" },
  { id: "deadlines", label: "Registration deadlines" },
] as const;

/**
 * What the live worked example needs: the key votes with their roll calls and receipts, and the key-vote
 * VotePositions of every sitting senator (about 100 rows), so a voter's own senator or closest senator
 * can be scored on the device.
 */
async function workedExampleData(): Promise<ExampleData> {
  const [cards, record, members] = await Promise.all([
    getDeckCards(),
    getKeyVoteRecord(),
    getMemberIndex(),
  ]);
  const senators = members.filter((member) => member.serving && member.chamber === "senate");
  return {
    keyVotes: cards.map((card) => ({
      id: card.id,
      issueArea: card.issue.id,
      title: card.card.title,
      rollCalls: card.rollCalls.map((rollCall) => ({
        id: rollCall.id,
        date: rollCall.date,
        yeaSupportsMeasure: rollCall.yeaSupportsMeasure,
        decisive: rollCall.decisive,
        motionToTable: /\btable\b/i.test(rollCall.question),
        receiptId: rollCall.receipt.sourceId,
      })),
    })),
    senators: senators.map((senator) => ({
      id: senator.id,
      name: senator.name,
      lastName: senator.lastName,
      state: senator.state,
    })),
    record: {
      rollCallIds: record.rollCallIds,
      positions: Object.fromEntries(
        senators.flatMap((senator) => {
          const codes = record.positions[senator.id];
          return codes ? [[senator.id, codes]] : [];
        }),
      ),
    },
  };
}

export default async function MethodologyPage() {
  const [selection, reviews, example] = await Promise.all([
    getKeyVoteSelection(),
    getReviewSummary(),
    workedExampleData(),
  ]);
  const aiReviewers = reviews.reviewers.filter((reviewer) => reviewer.kind === "ai");

  return (
    <TrustLayout
      header={
        <PageHeader
          title="How For The People works"
          lede="Every number on For The People comes from a rule written down here. If something looks wrong, choose Report a mistake at the bottom of any page and we will check it against the official record."
        />
      }
      rail={<SectionNav items={CONTENTS} compact />}
      stickyRail
    >
      <div className="flex flex-col gap-16 md:gap-24">
        <ShortVersion />

        {/* The worked example leads, then the rules; the formula and its fine print open on request. */}
        <ProseSection id="match" title="How the match score works">
          <WorkedExample
            data={example}
            rules={
              <p>
                Each recorded vote in Congress is called a roll call. A match compares your answers
                on the key votes with how a member actually voted on the official roll call behind
                each one. We only compare a key vote when{" "}
                <strong>you chose Yea (yes) or Nay (no)</strong> and{" "}
                <strong>the member voted Yea or Nay</strong> on a roll call in their own chamber.
                Skips never count. Neither do Present (the member answered but took neither side)
                and Not Voting.
              </p>
            }
            formula={<Formula />}
          />
          <p>
            The match is worked out on your device. Your answers are never sent to our servers to
            compute it.
          </p>
        </ProseSection>

        <NeverSection />

        <ProseSection id="key-votes" title="How key votes are chosen">
          <p>
            The key votes are a short list of real roll calls from the 119th Congress, the one
            serving in 2025 and 2026. A vote makes the list only if it meets every rule below
            (selection rule version {selection.version}). The rules can be checked in any order.
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-ink-2">
            {selection.criteria.map((criterion) => (
              <li key={criterion}>{criterion}</li>
            ))}
          </ul>
          {selection.gaps.length > 0 && (
            <>
              <h3 className="pt-2 font-sans text-xl font-bold text-ink">Known gaps</h3>
              <ul className="flex flex-col gap-2">
                {selection.gaps.map((gap) => (
                  <li key={gap.issueArea}>
                    {gap.finding} {gap.productRule}
                  </li>
                ))}
              </ul>
            </>
          )}
          {selection.excluded.length > 0 && (
            <>
              <h3 className="pt-2 font-sans text-xl font-bold text-ink">Votes we left out</h3>
              <p>
                {selection.excluded.length} votes people might expect were left out on purpose. Open
                one to see why.
              </p>
              {/* One disclosure per vote, titled by the vote itself; the reason opens under it. */}
              <ul className="flex flex-col border-t border-hairline font-sans">
                {selection.excluded.map((item) => (
                  <li key={item.measure} className="border-b border-hairline">
                    <details className="group/left">
                      <summary className="-mx-2 flex min-h-12 cursor-pointer list-none items-start gap-2 rounded-control px-2 py-3 text-base leading-snug font-semibold text-ink hover:bg-accent [&::-webkit-details-marker]:hidden">
                        <ChevronRight
                          className="mt-0.5 size-5 shrink-0 text-ink-2 transition-transform duration-200 ease-out group-open/left:rotate-90 motion-reduce:transition-none"
                          aria-hidden
                        />
                        {item.measure}
                      </summary>
                      <p className="pb-4 pl-7 font-serif text-lg leading-[1.6] text-ink-2">
                        {item.reason}
                      </p>
                    </details>
                  </li>
                ))}
              </ul>
            </>
          )}
        </ProseSection>

        <ProseSection id="review" title="How key votes are checked and reviewed">
          <p>A key vote is published only after three kinds of checks pass.</p>
          <ol className="flex list-decimal flex-col gap-2 pl-6 marker:font-sans marker:text-ink-2">
            <li>
              <strong>An automated check against the official record.</strong> Every roll call on
              the key vote must exist in the House Clerk or Senate record we downloaded. It must be
              a vote on the key vote&apos;s bill and match the curator&apos;s date and Yea and Nay
              counts. It must also be a real contest: the smaller side needs at least 15% of the
              votes cast. And each roll call must say which side supports the bill.
            </li>
            <li>
              <strong>A data-steward check.</strong> The person maintaining the key-vote file
              confirms the bill, the roll calls, and the decisive vote before proposing the key
              vote.
            </li>
            <li>
              <strong>Two reviewers with different political leanings</strong> must both approve the
              key vote&apos;s wording.
            </li>
          </ol>
          <p>
            <strong>Who the reviewers are today.</strong>{" "}
            {aiReviewers.length > 0 ? (
              <>
                The two reviewers with different leanings are AI reviewers, each prompted to read
                the key vote from a different political leaning (
                {aiReviewers.map((reviewer) => reviewer.leaning).join(" and ")}). They approved all{" "}
                {reviews.publishedCards} published key votes.{" "}
              </>
            ) : null}
            {reviews.humanReviewedCards === 0
              ? "No key vote has had a human review yet. Human reviewers with different leanings are pending, and this page will say so when they sign off."
              : `${reviews.humanReviewedCards} of ${reviews.publishedCards} published key votes also have a human review.${
                  reviews.reviewers.some(
                    (reviewer) => reviewer.kind === "human" && reviewer.leaning === "unstated",
                  )
                    ? " The human reviewer did not state a political leaning, so that review is in addition to the two leanings above, not in place of one."
                    : ""
                }`}
          </p>
          <p>
            Every proposal, check, approval, and publication is logged. You can read them in order
            on the <TrustLink href="/changelog">changelog</TrustLink>.
          </p>
        </ProseSection>

        <ProseSection id="voting-record" title="Voting with party, and missed votes">
          <p>
            Both numbers on a member&apos;s profile are counted from every roll call in the official
            House Clerk or Senate record for the 119th Congress, not only the key votes.
          </p>
          <p>
            <strong>Voted with their party.</strong> We look only at roll calls where most Democrats
            voted one way and most Republicans voted the other. On those, we count how often the
            member voted Yea or Nay with most of their own party. Independents count with the party
            they caucus with, meaning the party they join for its meetings and committee seats.
            Present and Not Voting are left out.
          </p>
          <p>
            <strong>Missed votes.</strong> Roll calls where the member is recorded as Not Voting,
            out of the roll calls on which the official record lists them while they were serving.
            The House Clerk and the Senate list every Representative and senator on every roll call,
            so for them this is every roll call held while they served. Days after a seat became
            vacant do not count against anyone.
          </p>
          <p>
            <strong>Two exceptions.</strong> The Speaker of the House votes only when they choose
            to, and the Clerk lists the Speaker only on roll calls where they vote. So we show no
            missed-vote share for the Speaker. The House members from Washington, D.C., and the U.S.
            territories (the delegates and the Resident Commissioner of Puerto Rico) may vote only
            on amendments, in what the House calls the Committee of the Whole. The Clerk lists them
            only on those votes, so we show how many of those they missed instead of a share of all
            House roll calls.
          </p>
          <p>
            Percentages never round up to 100% or down to 0% unless the count is exact, so 767 of
            768 reads 99.9%.
          </p>
        </ProseSection>

        <ProseSection id="money" title="Campaign money">
          <p>
            Money figures come from the Federal Election Commission (FEC), which collects every
            federal campaign&apos;s money reports. Totals for the 2026 election cover 2025 and 2026,
            a two-year period the FEC calls the 2026 cycle. They come from the FEC&apos;s “all
            candidates” file, built from each campaign&apos;s own reports:
          </p>
          <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-ink-2">
            <li>
              <strong>Money raised</strong> (the FEC calls it total receipts): all money the
              campaign committee took in.
            </li>
            <li>
              <strong>Individuals</strong>: donations from people.
            </li>
            <li>
              <strong>PACs and other committees</strong>: money from political action committees
              (PACs) and other political committees.
            </li>
            <li>
              <strong>Party committees</strong>.
            </li>
            <li>
              <strong>Self-funding</strong>: the candidate&apos;s own contributions plus loans the
              candidate made to the campaign.
            </li>
            <li>
              <strong>Transfers</strong> from joint fundraising committees and the candidate&apos;s
              other authorized committees. Those committees raise money from people and political
              committees and pass it on, so this is not a separate kind of donor.
            </li>
            <li>
              <strong>Other money</strong>: money raised minus everything named above, such as
              refunds and loans from others. It is what is left over, so we never call it a source
              of the campaign&apos;s money.
            </li>
            <li>
              <strong>Cash on hand</strong> and <strong>debts</strong> at the end of the latest
              report.
            </li>
          </ul>
          <p>
            <strong>Small-dollar share.</strong> The share of the money from individual donors that
            came in donations of $200 or less each, from the FEC&apos;s totals by donation size for
            the two-year period. It counts donations, not people: someone who gave $150 three times
            ($450 in all) is counted here. So this is not the share from people who gave $200 or
            less in total.
          </p>
          <p>
            <strong>In-state share.</strong> The share of the money from donors listed by name that
            came from inside the member&apos;s state. Campaigns must list a donor by name (the FEC
            calls this itemizing) once the donor&apos;s gifts add up to more than $200 in the
            two-year period. Smaller donors are usually not listed, so they are mostly left out of
            this share.
          </p>
          <p>
            <strong>We never show individual donors.</strong> Federal law limits how names from
            these reports may be used (52 U.S.C. 30111(a)(4)), so For The People stores and shows
            totals only.
          </p>
        </ProseSection>

        <ProseSection id="vote-duel" title="Vote Duel: how two members compare">
          <p>
            Vote Duel counts every roll call in the 119th Congress where both members voted Yea or
            Nay, and how many of those they voted the same way. Present and Not Voting are left out
            and shown as a separate count.
          </p>
          <p>
            Members of different chambers never vote on the same roll call. For them, Vote Duel
            compares only the key-vote bills. It uses each member&apos;s roll call in their own
            chamber and reads each vote as support for or opposition to the bill, the same “which
            side is which” rule the match score uses.
          </p>
        </ProseSection>

        <ProseSection id="compare" title="Comparing members in Ask For The People">
          <p>
            When you ask Ask For The People to compare two members, it lists the key votes where
            both voted Yea or Nay and says whether they took the same side on the measure. A Yea on
            a motion to table (a vote to set the measure aside) counts as opposing the measure, as
            in the match score. Key votes where either member did not vote are left out, and the
            answer says so.
          </p>
        </ProseSection>

        <ProseSection id="districts" title="How we find your districts">
          <p>
            When you enter an address on the ballot page, it goes to the U.S. Census Bureau&apos;s
            address lookup (its geocoder), an official and free service. It returns two districts:
            the one your member of Congress serves now (the 119th Congress district), and the one on
            your 2026 ballot (the 120th Congress district). They differ where a state redrew its
            map. We keep only the district numbers, never the address.
          </p>
          <p>
            Some states publish an official file that assigns each census block to a district. Where
            that file disagrees with the Census Bureau&apos;s map, the state&apos;s file wins. Where
            a state&apos;s 2026 map is still being decided in court, as in Missouri, we show both
            possible districts and say the ballot district is not confirmed. District outlines come
            from the Census Bureau&apos;s TIGERweb map service.
          </p>
        </ProseSection>

        <ProseSection id="deadlines" title="Registration deadlines">
          <p>
            Deadlines on the <TrustLink href="/election">election page</TrustLink> come from each
            state&apos;s page on vote.gov, run by the U.S. Election Assistance Commission. We keep
            vote.gov&apos;s wording, such as “29 days before Election Day,” and do not turn it into
            a calendar date. When a deadline lands on a weekend or holiday, each state&apos;s own
            rule decides the day. If a date is not on an official page, we leave it out and link to
            your state&apos;s election office instead.
          </p>
        </ProseSection>
      </div>
    </TrustLayout>
  );
}

const SHORT_VERSION = [
  {
    icon: ArrowLeftRight,
    text: "We compare your Yea and Nay answers with each member's real votes.",
  },
  { icon: Weight, text: "Votes you care about count more." },
  { icon: Gauge, text: "With few shared votes, scores stay near 50%." },
] as const;

/** The whole method in three plain lines, before any detail. */
function ShortVersion() {
  return (
    <section
      aria-labelledby="short-version"
      className="flex max-w-[65ch] flex-col gap-4 rounded-card border-2 border-ink bg-paper p-5 md:p-7"
    >
      <h2 id="short-version" className="text-xl font-bold text-ink md:text-2xl">
        The short version
      </h2>
      <ul className="flex flex-col gap-4">
        {SHORT_VERSION.map(({ icon: Icon, text }) => (
          <li key={text} className="flex items-start gap-3 text-lg leading-snug text-ink">
            <Icon className="mt-0.5 size-6 shrink-0 text-ink-2" strokeWidth={1.75} aria-hidden />
            {text}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** The formula, its terms, and the rules that decide each term: opened from the worked example. */
function Formula() {
  return (
    <>
      <figure className="flex flex-col gap-4 border-y border-ink py-6 font-sans">
        <figcaption className="text-sm font-semibold text-ink-2">The formula</figcaption>
        {/* The whole formula as text for screen readers; the set version is for the eye. */}
        <p className="sr-only">score = (Σ w·agree + k·0.5) ÷ (Σ w + k)</p>
        <p
          className="font-serif text-2xl text-ink tabular-nums md:text-[34px] md:leading-tight"
          aria-hidden
        >
          <V>score</V> = (Σ <V>w</V>·<V>agree</V> + <V>k</V>·0.5) ÷ (Σ <V>w</V> + <V>k</V>)
        </p>
        <dl className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-base text-ink-2">
          <dt className="font-serif text-ink">
            <V>agree</V>
          </dt>
          <dd>1 when you and the member took the same side, 0 when you did not.</dd>
          <dt className="font-serif text-ink">
            <V>w</V>
          </dt>
          <dd>
            How much you care about that key vote: 1 ({WEIGHT_LABELS[1]}), 2 ({WEIGHT_LABELS[2]}),
            or 3 ({WEIGHT_LABELS[3]}).
          </dd>
          <dt className="font-serif text-ink">
            <V>k</V> = {MATCH_PRIOR_K}
          </dt>
          <dd>
            Two made-up votes that each count as half an agreement. They keep a score built on very
            few votes close to 50%.
          </dd>
          <dt className="font-serif text-ink">
            <V>n</V>
          </dt>
          <dd>The number of key votes compared, always shown next to the score.</dd>
        </dl>
      </figure>
      <p>
        When n is 0 there is <strong>no score at all</strong>. You will see “No shared votes yet”
        instead of a number. When n is under {LOW_CONFIDENCE_N}, the score carries a{" "}
        <strong>low-confidence</strong> badge, because a handful of votes can swing it a lot.
      </p>
      <p>
        <strong>Which side is which.</strong> Some roll calls are votes against a bill, such as a
        motion to table it (a vote to set it aside). On those, a Yea counts as opposing the bill and
        a Nay counts as supporting it. That way we always compare what you and the member did to the
        bill itself.
      </p>
      <p>
        <strong>One roll call per chamber.</strong> Some key votes had several votes in one chamber.
        We use the one that decided the bill, usually the final vote to pass it. A member who voted
        on a key vote in both chambers is judged on the later vote.
      </p>
      <p>
        <strong>Agreement by issue</strong> uses the same formula, with the same k = {MATCH_PRIOR_K}
        , on only the key votes in that issue. So an issue with one or two shared votes also stays
        close to 50%.
      </p>
    </>
  );
}

function NeverSection() {
  return (
    <ProseSection id="never" title="What we never do">
      <ul className="flex list-disc flex-col gap-2 pl-6 marker:text-ink-2">
        <li>
          <strong>We never guess.</strong> Missing data reads “No record yet.”
        </li>
        <li>
          <strong>We never infer a position from party.</strong> A candidate without a voting record
          shows “No voting record yet,” not their party&apos;s average. A former member who was not
          in the 119th Congress shows “No votes in the 119th Congress,” with a link to their earlier
          service in the Biographical Directory of the U.S. Congress.
        </li>
        <li>
          <strong>We never store your address.</strong> An address is used once to find your
          districts and then thrown away. Only the district numbers stay, on your device.
        </li>
        <li>
          <strong>We never store your answers.</strong> Your stances live on this device. They leave
          it only if you tap “Use my answers” for a single Ask question.
        </li>
        <li>
          <strong>We never endorse or predict.</strong> For The People shows records and matches,
          not recommendations.
        </li>
      </ul>
      <p>
        See every publisher we use on the <TrustLink href="/sources">sources page</TrustLink>, and{" "}
        <TrustLink href="/corrections">report a mistake</TrustLink> if something looks wrong.
      </p>
    </ProseSection>
  );
}

/** A variable in the formula: set in Source Serif italic, the way a formula is printed. */
function V({ children }: { children: React.ReactNode }) {
  return <i className="font-serif italic">{children}</i>;
}

function TrustLink({
  href,
  children,
}: {
  href: "/changelog" | "/election" | "/sources" | "/corrections";
  children: React.ReactNode;
}) {
  return (
    <Link href={href} className="font-semibold text-ink underline underline-offset-4">
      {children}
    </Link>
  );
}
