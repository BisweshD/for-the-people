import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { MatchesStep } from "@/components/election/election-actions";
import {
  ElectionCard,
  ElectionCardView,
  ElectionStates,
} from "@/components/election/election-card";
import { NoStateYet, StateKeyDates } from "@/components/election/state-key-dates";
import { SectionNav } from "@/components/trust/section-nav";
import { TrustLayout } from "@/components/trust/trust-layout";
import { formatDateLong } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import { getElectionDates } from "@/server/trust";

export const metadata: Metadata = {
  title: "Election Day 2026",
  description:
    "Days until the November 3, 2026 general election, your state's registration deadlines from vote.gov, and official links to register and check your registration.",
};

/** Each title names where the link goes, so the row reads right on its own and in a list of links. */
const NATIONAL_LINKS = [
  {
    href: "https://vote.gov/register",
    title: "Register to vote on vote.gov",
    body: "Walks you through your state's rules and forms.",
  },
  {
    href: "https://vote.gov/",
    title: "Check your registration on vote.gov",
    body: "Pick your state there, or choose it above for a direct link.",
  },
  {
    href: "https://www.fvap.gov/",
    title: "Military and overseas voting at FVAP.gov",
    body: "The Federal Voting Assistance Program handles absentee ballots.",
  },
] as const;

const CONTENTS = [
  { id: "official-tools", label: "Official tools" },
  { id: "key-dates", label: "Key dates in your state" },
  { id: "ballot", label: "See who votes like you" },
] as const;

export default async function ElectionPage() {
  const file = await getElectionDates();
  const electionDay = formatDateLong(file.electionDay);
  const voteGov = file.states
    .map((entry) => entry.source)
    .reduce((latest, source) => (source.retrievedAt > latest.retrievedAt ? source : latest));

  return (
    <ElectionStates states={file.states}>
      <TrustLayout
        header={
          <header className="flex flex-col gap-6">
            <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink md:text-5xl">
              The general election is Tuesday, {electionDay}
            </h1>
            {/* Until ?state= is read, the card shows with no state chosen, at the same size. */}
            <Suspense fallback={<ElectionCardView electionDay={file.electionDay} />}>
              <ElectionCard electionDay={file.electionDay} />
            </Suspense>
            <p className="max-w-[65ch] text-lg text-ink-2">
              Every seat in the House and about a third of the Senate are on the ballot. Many states
              close registration in early October, so check your deadline now.
            </p>
          </header>
        }
        rail={
          <div className="flex flex-col gap-6">
            <SectionNav items={CONTENTS} />
            <p
              className="border-t border-hairline pt-4 text-sm text-ink-2 tabular-nums"
              data-fact="election-deadlines-source"
              data-receipt-id={voteGov.id}
            >
              Deadlines and state links from vote.gov, read {formatEasternDate(voteGov.retrievedAt)}
              .
            </p>
          </div>
        }
        railClassName="max-xl:hidden"
      >
        <div className="flex flex-col gap-14">
          <section aria-labelledby="official-tools" className="flex flex-col gap-3">
            <h2 id="official-tools" className="scroll-mt-24 text-2xl font-bold text-ink">
              Official tools
            </h2>
            <ul className="flex flex-col border-t border-ink">
              {NATIONAL_LINKS.map((link) => (
                <li key={link.title} className="border-b border-hairline">
                  <a
                    href={link.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="-mx-2 flex min-h-16 w-[calc(100%+1rem)] items-center gap-4 rounded-control px-2 py-3 hover:bg-accent active:scale-[0.99]"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-base font-semibold text-ink">{link.title}</span>
                      <span className="text-sm text-ink-2">{link.body}</span>
                    </span>
                    <ExternalLink className="size-5 shrink-0 text-ink-2" aria-hidden />
                    <span className="sr-only">(opens an official site in a new tab)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <section
            id="key-dates"
            aria-labelledby="key-dates-title"
            className="flex scroll-mt-24 flex-col gap-4"
          >
            <div className="flex flex-col gap-1">
              <h2 id="key-dates-title" className="text-2xl font-bold text-ink">
                Key dates in your state
              </h2>
              <p className="max-w-[65ch] text-base text-ink-2">
                Deadlines use vote.gov&apos;s wording, counted back from Election Day. If one lands
                on a weekend or holiday, your state&apos;s rule decides the exact day.{" "}
                <Link
                  href="/methodology#deadlines"
                  className="font-semibold text-ink underline underline-offset-4"
                >
                  Why we show days, not dates
                </Link>
              </p>
            </div>
            <Suspense fallback={<NoStateYet />}>
              <StateKeyDates />
            </Suspense>
          </section>

          <section
            aria-labelledby="ballot"
            className="flex flex-col items-start gap-3 border-t border-hairline pt-8"
          >
            <h2 id="ballot" className="scroll-mt-24 text-2xl font-bold text-ink">
              See who votes like you
            </h2>
            <MatchesStep />
          </section>
        </div>
      </TrustLayout>
    </ElectionStates>
  );
}
