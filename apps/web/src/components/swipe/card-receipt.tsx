"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { ReceiptSheet, type ReceiptItem } from "@/components/receipt/receipt-sheet";
import { chamberName, formatDate, formatInteger } from "@/lib/format";
import { resultText, thresholdText } from "@/lib/outcomes";
import type { CardView, RollCallView } from "@/lib/views";

export const CARD_METHOD =
  "For The People matched this key vote to the chamber's official roll call and checked the measure, the date, and the vote totals against the official record.";

/** The roll call fields a receipt prints. Key-vote roll calls also carry their verification against the official record. */
export type RollCallReceiptInput = Pick<
  RollCallView,
  | "chamber"
  | "number"
  | "date"
  | "question"
  | "result"
  | "requires"
  | "totals"
  | "tieBreaker"
  | "officialUrl"
  | "measureLabel"
  | "receipt"
> & { verification?: RollCallView["verification"] };

export function rollCallReceipt(rollCall: RollCallReceiptInput): ReceiptItem {
  const lines = [
    { label: "Date", value: formatDate(rollCall.date) },
    { label: "Question", value: rollCall.question },
    { label: "Result", value: resultText(rollCall) },
    {
      label: "Votes",
      value: `${formatInteger(rollCall.totals.yea)} Yea, ${formatInteger(rollCall.totals.nay)} Nay${
        rollCall.totals.present ? `, ${rollCall.totals.present} Present` : ""
      }, ${formatInteger(rollCall.totals.notVoting)} not voting`,
    },
  ];
  const threshold = thresholdText(rollCall);
  if (threshold) lines.splice(3, 0, { label: "Needed to pass", value: threshold });
  if (rollCall.tieBreaker) {
    lines.push({
      label: "Tie broken by",
      value: `${rollCall.tieBreaker.by}, voting ${rollCall.tieBreaker.vote}`,
    });
  }
  if (rollCall.measureLabel) lines.unshift({ label: "Measure", value: rollCall.measureLabel });
  return {
    title: `${chamberName(rollCall.chamber)} roll call ${rollCall.number}`,
    lines,
    receipt: rollCall.receipt,
    href: rollCall.officialUrl,
    verified:
      rollCall.verification?.status === "verified"
        ? { checkedAt: rollCall.verification.checkedAt }
        : null,
  };
}

/** The receipt link on a swipe card: every roll call behind the card, from the official record. */
export function CardReceipt({ card }: { card: CardView }) {
  const [open, setOpen] = useState(false);
  const first = card.rollCalls[0];
  if (!first) return null;
  const label = card.rollCalls
    .map((rollCall) => `${chamberName(rollCall.chamber)} vote ${rollCall.number}`)
    .join(" and ");
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        onPointerDown={(event) => event.stopPropagation()}
        className="inline-flex min-h-11 items-center gap-2 rounded-control text-left text-sm font-semibold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
        data-fact="key-vote-roll-calls"
        data-receipt-id={first.receipt.sourceId}
      >
        <FileText className="size-4 shrink-0" aria-hidden />
        <span>
          Receipt: <span className="font-normal text-ink-2">{label}</span>
        </span>
      </button>
      <ReceiptSheet
        open={open}
        onOpenChange={setOpen}
        subject={card.card.title}
        items={card.rollCalls.map(rollCallReceipt)}
        method={CARD_METHOD}
      />
    </>
  );
}
