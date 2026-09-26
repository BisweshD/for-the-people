"use client";

import { CircleCheck, CircleX } from "lucide-react";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { RollCallReceiptButton } from "@/components/bills/receipt-button";
import { ShowMore } from "@/components/show-more";
import { Badge } from "@/components/ui/badge";
import { previewRollCalls, rollCallHeadline, type RollCallRow } from "@/lib/bill-views";
import { chamberName, formatDate, formatInteger } from "@/lib/format";
import { plainVoteTitle, thresholdText } from "@/lib/outcomes";
import { resultLabel, resultTone } from "@/lib/vote-margin";

/** Rows before "Show all": every key vote, then the newest others. */
const PREVIEW = 5;

/**
 * Every roll call on a measure, newest first. Each row leads with the vote in plain words, keeps the
 * official question under it, shows the result with a mark for passed or rejected, links to the full
 * roll call, and keeps its receipt one tap away. Key votes are always shown and marked.
 */
export function RollCallList({
  rollCalls,
  subject,
  measureName,
}: {
  rollCalls: RollCallRow[];
  subject: string;
  /** The measure's short name, or its number, for the plain line ("A vote to pass the Laken Riley Act"). */
  measureName: string;
}) {
  const listRef = useRef<HTMLOListElement>(null);
  const [limit, setLimit] = useState(PREVIEW);
  const preview = useMemo(() => previewRollCalls(rollCalls, PREVIEW), [rollCalls]);
  const all = useMemo(() => previewRollCalls(rollCalls, rollCalls.length), [rollCalls]);
  const shown = limit >= rollCalls.length ? all : preview;

  return (
    <div className="flex flex-col gap-4">
      <ol
        ref={listRef}
        className="flex flex-col divide-y divide-hairline rounded-card border border-hairline bg-paper"
      >
        {shown.map((rollCall) => (
          <Row key={rollCall.id} rollCall={rollCall} subject={subject} measureName={measureName} />
        ))}
      </ol>
      <ShowMore
        shown={shown.length}
        total={rollCalls.length}
        noun="roll calls"
        listRef={listRef}
        onShow={setLimit}
      />
    </div>
  );
}

/** Passed or rejected as a mark beside the words, from the chamber's own result text. */
function ResultMark({ result }: { result: string }) {
  const tone = resultTone(result);
  if (tone === "passed") return <CircleCheck className="size-5 shrink-0 text-ink" aria-hidden />;
  if (tone === "failed") return <CircleX className="size-5 shrink-0 text-ink" aria-hidden />;
  return null;
}

function Row({
  rollCall,
  subject,
  measureName,
}: {
  rollCall: RollCallRow;
  subject: string;
  measureName: string;
}) {
  const { yea, nay, present, notVoting } = rollCall.totals;
  const plain = plainVoteTitle(rollCall, measureName);
  const headline = rollCallHeadline(rollCall);
  const primary = plain ?? headline.primary;
  const where = `${chamberName(rollCall.chamber)} roll call ${rollCall.number}`;
  const threshold = thresholdText(rollCall);
  const extra = [
    present ? `${formatInteger(present)} Present` : null,
    notVoting ? `${formatInteger(notVoting)} not voting` : null,
    rollCall.tieBreaker
      ? `tie broken by the ${rollCall.tieBreaker.by}, voting ${rollCall.tieBreaker.vote}`
      : null,
  ].filter(Boolean);
  return (
    <li
      // Phones: the receipt sits under the result, so the words get the row's full width.
      className="relative flex flex-col gap-3 px-4 py-4 transition-colors first:rounded-t-card last:rounded-b-card hover:bg-canvas sm:flex-row sm:items-start sm:gap-4 sm:px-5"
      data-fact="roll-call"
      data-receipt-id={rollCall.receipt.sourceId}
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 type-meta text-ink-2 tabular-nums">
          {rollCall.keyVote && <Badge>Key vote</Badge>}
          <span>
            {where}, {formatDate(rollCall.date)}
          </span>
        </p>
        <p className="text-lg leading-snug font-bold text-ink">
          <Link
            href={`/votes/${rollCall.id}`}
            className="decoration-ink-3 underline-offset-4 outline-none after:absolute after:inset-0 after:rounded-[inherit] after:content-[''] hover:underline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-ink"
          >
            {primary}
            <span className="sr-only">, {where}</span>
          </Link>
        </p>
        <div className="flex flex-col gap-0.5 type-meta text-ink-2">
          {plain ? (
            <>
              <p>
                <span className="font-bold">Official question:</span> {rollCall.question}
              </p>
              {rollCall.title && rollCall.title.toLowerCase() !== measureName.toLowerCase() && (
                <p>{rollCall.title}</p>
              )}
            </>
          ) : (
            headline.secondary && <p>{headline.secondary}</p>
          )}
        </div>
        <p className="flex items-start gap-2 text-base text-ink tabular-nums">
          <ResultMark result={rollCall.result} />
          <span>
            <span className="font-bold">
              {resultLabel(rollCall)}, {formatInteger(yea)} to {formatInteger(nay)}
            </span>
            {extra.length > 0 && <span className="text-ink-2">; {extra.join(", ")}</span>}
            {threshold && <span className="text-ink-2">. {threshold}</span>}
          </span>
        </p>
      </div>
      <RollCallReceiptButton
        rollCall={rollCall}
        subject={subject}
        inRow
        label={`Receipt for ${where}`}
        className="relative z-10 w-fit shrink-0"
      />
    </li>
  );
}
