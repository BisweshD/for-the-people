"use client";

import { LOW_CONFIDENCE_N, MATCH_PRIOR_K } from "@for-the-people/core/client";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useId, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AgreementOval } from "@/components/agreement-glyph";
import { Oval } from "@/components/oval";
import { POSITION_LABEL, PositionGlyph } from "@/components/rollcall/position-cell";
import { SwitchTrack } from "@/components/switch-track";
import { useHydrated } from "@/hooks/use-hydrated";
import { STATE_NAMES } from "@/lib/format";
import { positionsFor } from "@/lib/matching";
import { cn } from "@/lib/utils";
import { useVoter } from "@/lib/voter-store";
import {
  pickSenator,
  SAMPLE,
  workExample,
  type ExampleData,
  type Worked,
  type WorkedRow,
} from "@/lib/worked-example";
import type { StateCode } from "@for-the-people/core/client";

/**
 * The worked example that leads the match section: each key vote as one line of marks (your answer,
 * the member's vote, and whether they agree), then the score those marks make. Off by default it scores
 * six made-up key votes; with "Use my answers" it scores this voter's answers against one senator, on
 * this device, with the same computeMatch that Matches uses. Nothing is sent anywhere.
 *
 * `rules` (what counts) sits under the score; `formula` opens the "The exact formula" disclosure, above
 * this example's own arithmetic.
 */
export function WorkedExample({
  data,
  rules,
  formula,
}: {
  data: ExampleData;
  rules: ReactNode;
  formula: ReactNode;
}) {
  const voter = useVoter();
  const hydrated = useHydrated();
  const [mine, setMine] = useState(false);
  const helpId = useId();
  const decided = hydrated ? voter.stances.filter((stance) => stance.choice !== "Skip").length : 0;
  const state = voter.location?.state ?? null;

  const picked = useMemo(
    () => (mine && decided > 0 ? pickSenator(voter.stances, state, data) : null),
    [mine, decided, voter.stances, state, data],
  );
  const worked = useMemo(
    () =>
      picked
        ? workExample(
            voter.stances,
            data.keyVotes,
            picked.senator.id,
            positionsFor(data.record, picked.senator.id),
            "senate",
          )
        : workExample(SAMPLE.stances, SAMPLE.keyVotes, SAMPLE.memberId, SAMPLE.positions),
    [picked, voter.stances, data],
  );
  const live = picked !== null;
  const who = picked ? `Sen. ${picked.senator.name}` : "the member";

  return (
    <div className="flex flex-col gap-5 font-sans">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-xl font-bold text-ink">A worked example</h3>
        <button
          type="button"
          role="switch"
          aria-checked={mine}
          aria-describedby={helpId}
          disabled={!hydrated || decided === 0}
          onClick={() => setMine((value) => !value)}
          className="-ml-2 inline-flex min-h-11 w-fit items-center gap-2.5 rounded-control px-2 text-base font-semibold text-ink hover:bg-accent disabled:text-ink-2 disabled:hover:bg-transparent sm:ml-0"
        >
          <SwitchTrack on={mine} />
          Use my answers
        </button>
      </div>
      <p id={helpId} className="text-base text-ink-2" aria-live="polite">
        {live && picked ? (
          <>
            Your {decided} {decided === 1 ? "answer" : "answers"} compared with{" "}
            <strong className="font-semibold text-ink">{who}</strong> of{" "}
            {STATE_NAMES[picked.senator.state as StateCode]},{" "}
            {picked.why === "your-senator"
              ? "one of your senators"
              : "the senator whose votes are closest to your answers"}
            . Worked out on this device; your answers are not sent anywhere.
          </>
        ) : mine && decided > 0 ? (
          "None of your answers can be compared with a senator yet, so this is still the made-up example."
        ) : hydrated && decided === 0 ? (
          <>
            Six made-up key votes and a made-up member, so no real record is implied.{" "}
            <Link href="/swipe" className="font-semibold text-ink underline underline-offset-4">
              Answer key votes
            </Link>{" "}
            to see it with your own answers.
          </>
        ) : (
          "Six made-up key votes and a made-up member, so no real record is implied. Switch on Use my answers to see your own."
        )}
      </p>

      {/* Keyed by what is compared, so the marks and the score settle in again when it changes. */}
      <div key={live ? `live-${picked?.senator.id}` : "sample"} className="flex flex-col gap-5">
        <ExampleTable worked={worked} live={live} />
        <Score worked={worked} live={live} who={who} />
      </div>

      <div className="flex max-w-[65ch] flex-col gap-4 font-serif text-lg leading-[1.6] text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">
        {rules}
      </div>

      <details className="group/formula border-t border-hairline pt-2">
        <summary className="-ml-2 inline-flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-control px-2 text-lg font-bold text-ink hover:bg-accent [&::-webkit-details-marker]:hidden">
          <ChevronRight
            className="size-5 shrink-0 transition-transform duration-200 ease-out group-open/formula:rotate-90 motion-reduce:transition-none"
            aria-hidden
          />
          The exact formula
        </summary>
        <div className="flex flex-col gap-5 pt-3 pb-2">
          <div className="flex max-w-[65ch] flex-col gap-4 font-serif text-lg leading-[1.6] text-ink-2 [&_strong]:font-semibold [&_strong]:text-ink">
            {formula}
          </div>
          <Explanation worked={worked} live={live} />
          <Arithmetic worked={worked} live={live} who={who} />
        </div>
      </details>
    </div>
  );
}

const countsLine = (row: WorkedRow) =>
  row.countsAs === "Not compared"
    ? "Not compared."
    : `Counts as ${row.countsAs === "Supports" ? "supporting" : "opposing"} the bill.`;

const factProps = (row: WorkedRow) =>
  row.receiptId ? { "data-fact": "vote-position", "data-receipt-id": row.receiptId } : {};

/** A column of one mark over its word, the same at every width. */
function Mark({ children, word }: { children: ReactNode; word: ReactNode }) {
  return (
    <span className="flex flex-col items-center gap-1 text-center">
      <span className="grid h-6 place-items-center">{children}</span>
      <span className="text-sm leading-tight font-semibold text-ink">{word}</span>
    </span>
  );
}

/**
 * The comparison, one key vote per row: the key vote, then three columns of marks. The voter's answer
 * is a marigold oval with an ink edge (dashed and empty for a skip), the member's vote is its Board cell,
 * and the result is the agree or split oval, or "Left out". The words under each mark carry the meaning;
 * the line under each key vote says what the member's vote counted as.
 */
function ExampleTable({ worked, live }: { worked: Worked; live: boolean }) {
  const them = live ? "They voted" : "Member voted";
  return (
    <div className="rounded-card border border-hairline bg-paper px-4 py-2 md:px-6">
      <table className="w-full border-collapse text-left text-base">
        <caption className="sr-only">
          {live
            ? "Your answers and how the senator voted on each key vote, and whether each counts toward the match"
            : "Six example key votes and whether each counts toward the match"}
        </caption>
        <thead>
          <tr className="border-b border-hairline text-sm text-ink-2">
            <th scope="col" className="py-2 pr-3 font-semibold">
              Key vote
            </th>
            <th scope="col" className="w-14 px-1 py-2 text-center font-semibold sm:w-20">
              You
            </th>
            <th scope="col" className="w-16 px-1 py-2 text-center font-semibold sm:w-24">
              {live ? "They voted" : "Member"}
            </th>
            <th scope="col" className="w-16 py-2 pl-1 text-center font-semibold sm:w-20">
              Result
            </th>
          </tr>
        </thead>
        <tbody className="align-top text-ink tabular-nums">
          {worked.rows.map((row, index) => (
            <tr key={row.id} className="border-b border-hairline last:border-0">
              <th
                scope="row"
                className={cn(
                  "py-3 pr-3",
                  live ? "text-[15px] leading-snug font-medium" : "font-semibold",
                )}
              >
                {row.title}
                <span className="mt-1 block text-sm font-normal text-ink-2" {...factProps(row)}>
                  {them} {row.memberVoted}. {countsLine(row)}
                </span>
              </th>
              <td className="px-1 py-3">
                <Mark
                  word={
                    <>
                      {row.you}
                      {row.weight !== null && (
                        <span className="block font-normal text-ink-2">
                          <span aria-hidden>w = </span>
                          <span className="sr-only">weight </span>
                          {row.weight}
                        </span>
                      )}
                    </>
                  }
                >
                  <Oval
                    filled={row.you !== "Skip"}
                    dashed={row.you === "Skip"}
                    tone="current"
                    size={24}
                    stroke={2.2}
                    animate={false}
                  />
                </Mark>
              </td>
              <td className="px-1 py-3">
                <Mark word={row.position ? POSITION_LABEL[row.position] : "No record"}>
                  {row.position ? (
                    <PositionGlyph position={row.position} className="size-6 text-xs" />
                  ) : (
                    <span className="size-6" aria-hidden />
                  )}
                </Mark>
              </td>
              <td className="py-3 pl-1">
                <Mark word={row.agree === null ? "Left out" : row.agree ? "Agree" : "Split"}>
                  {row.agree === null ? (
                    <span className="h-0.5 w-5 rounded-full bg-ink-3-graphic" aria-hidden />
                  ) : (
                    <span
                      className="inline-flex animate-oval-in motion-reduce:animate-none"
                      style={{ "--row": index } as CSSProperties}
                    >
                      <AgreementOval agree={row.agree} size={24} />
                    </span>
                  )}
                </Mark>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** What the marks add up to: the score, the count behind it, and one oval per compared vote. */
function Score({ worked, live, who }: { worked: Worked; live: boolean; who: string }) {
  const { match, percent } = worked;
  const left = worked.rows.filter((row) => row.agree === null).length;
  if (percent === null)
    return (
      <p className="rounded-card border-2 border-ink bg-paper p-5 text-lg font-semibold text-ink">
        No shared votes yet, so there is no score.
      </p>
    );
  const compared = worked.rows.filter((row) => row.agree !== null);
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 rounded-card border-2 border-ink bg-paper p-5">
      <span
        className="inline-block origin-bottom-left animate-figure-in text-5xl leading-none font-extrabold tracking-tight text-ink tabular-nums motion-reduce:animate-none"
        {...(live ? { "data-fact": "match", "data-receipt-id": "method-match" } : {})}
      >
        {percent}%
      </span>
      <span className="flex min-w-0 flex-col gap-1.5">
        <span className="text-lg leading-snug font-bold text-ink tabular-nums">
          {live ? who : "The member"} agrees with you on {match.agreements} of {match.n}{" "}
          {match.n === 1 ? "vote" : "votes"}
        </span>
        <span
          className="inline-flex flex-wrap items-center gap-1"
          role="img"
          aria-label={`${match.agreements} agree, ${match.n - match.agreements} split`}
        >
          {compared.map((row) => (
            <AgreementOval key={row.id} agree={row.agree === true} size={18} />
          ))}
        </span>
        <span className="text-sm text-ink-2 tabular-nums">
          {left === 0
            ? "Every answer is compared."
            : `${left} left out, so ${left === 1 ? "it does" : "they do"} not count.`}{" "}
          Votes you care more about count more.
        </span>
      </span>
    </div>
  );
}

function Explanation({ worked, live }: { worked: Worked; live: boolean }) {
  const { n } = worked.match;
  if (!live)
    return (
      <p className="max-w-[65ch] font-serif text-lg leading-[1.6] text-ink-2">
        Votes E and F are left out: you skipped E, and the member did not vote on F. That leaves{" "}
        <strong className="font-semibold text-ink">n = {n}</strong>. Vote C shows which side is
        which: the member voted Nay on a motion to table the bill (a vote to set it aside). That
        counts as supporting the bill, the same side you took.
      </p>
    );
  const left = worked.rows.filter((row) => row.agree === null).length;
  return (
    <p className="max-w-[65ch] font-serif text-lg leading-[1.6] text-ink-2">
      {left === 0
        ? "Every answer is compared. "
        : `${left} ${left === 1 ? "key vote is" : "key votes are"} left out: ones you skipped, ones the Senate never voted on, and ones where the senator did not vote Yea or Nay. `}
      That leaves <strong className="font-semibold text-ink">n = {n}</strong>.
    </p>
  );
}

function Arithmetic({ worked, live, who }: { worked: Worked; live: boolean; who: string }) {
  const { match, percent, rawPercent, agreeTerms, weightTerms } = worked;
  if (percent === null)
    return (
      <div className="border-l-2 border-ink pl-5 text-lg text-ink">
        <p>No shared votes yet, so there is no score.</p>
      </div>
    );
  const agreed = agreeTerms.reduce<number>((sum, weight) => sum + weight, 0);
  const total = weightTerms.reduce<number>((sum, weight) => sum + weight, 0);
  const numerator = agreed + MATCH_PRIOR_K * 0.5;
  const denominator = total + MATCH_PRIOR_K;
  return (
    <div className="border-l-2 border-ink pl-5 text-lg text-ink tabular-nums">
      <p>
        Σ w·agree = {agreeTerms.length > 0 ? agreeTerms.join(" + ") : "0"}
        {agreeTerms.length > 1 && (
          <>
            {" "}
            = <strong>{agreed}</strong>
          </>
        )}
        , and Σ w = {weightTerms.join(" + ")}
        {weightTerms.length > 1 && (
          <>
            {" "}
            = <strong>{total}</strong>
          </>
        )}
        .
      </p>
      <p className="mt-2">
        score = ({agreed} + {MATCH_PRIOR_K}·0.5) ÷ ({total} + {MATCH_PRIOR_K}) = {numerator} ÷{" "}
        {denominator} = <strong>{percent}%</strong>
      </p>
      <p className="mt-2 text-base text-ink-2">
        Shown as “{percent}%, agrees with you on {match.agreements} of {match.n}{" "}
        {match.n === 1 ? "vote" : "votes"}”{live ? ` for ${who}` : ""}
        {match.n < LOW_CONFIDENCE_N
          ? `, with a low-confidence label because ${match.n} is under ${LOW_CONFIDENCE_N}`
          : ""}
        . Without the two made-up half agreements that keep scores near 50%, it would read{" "}
        {rawPercent}%.
      </p>
    </div>
  );
}
