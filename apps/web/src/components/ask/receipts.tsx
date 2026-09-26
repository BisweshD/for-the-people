"use client";

import { FileText } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { ReceiptSheet, type ReceiptItem } from "@/components/receipt/receipt-sheet";
import { CARD_METHOD, rollCallReceipt } from "@/components/swipe/card-receipt";
import { chamberName, formatDate } from "@/lib/format";
import type { RollCallView } from "@/lib/views";
import { cn } from "@/lib/utils";

/** One ReceiptSheet for the whole conversation; any card can open it for its roll calls. */

interface OpenReceipt {
  subject: string;
  items: ReceiptItem[];
  method: string;
}

const ReceiptContext = createContext<(receipt: OpenReceipt) => void>(() => undefined);

export const ROLL_CALL_METHOD =
  "For The People copies every vote from the chamber's official roll call and keeps the file it was read from.";

export function AskReceipts({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState<OpenReceipt | null>(null);
  return (
    <ReceiptContext.Provider value={setOpen}>
      {children}
      <ReceiptSheet
        open={open !== null}
        onOpenChange={(next) => !next && setOpen(null)}
        subject={open?.subject ?? ""}
        items={open?.items ?? []}
        method={open?.method ?? ""}
      />
    </ReceiptContext.Provider>
  );
}

/** Opens the receipt for one roll call. Key-vote roll calls carry their verification. */
export function useRollCallReceipt() {
  const open = useContext(ReceiptContext);
  return useCallback(
    (rollCall: RollCallView, subject: string) =>
      open({
        subject,
        items: [rollCallReceipt(rollCall)],
        method: rollCall.verification.status === "verified" ? CARD_METHOD : ROLL_CALL_METHOD,
      }),
    [open],
  );
}

/** "Senate roll call 7, Jan 20, 2025": a tappable receipt line for one roll call. */
export function RollCallLink({
  rollCall,
  subject,
  className,
  children,
}: {
  rollCall: RollCallView;
  subject: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const openReceipt = useRollCallReceipt();
  const label = useMemo(
    () =>
      `${chamberName(rollCall.chamber)} roll call ${rollCall.number}, ${formatDate(rollCall.date)}`,
    [rollCall],
  );
  return (
    <button
      type="button"
      onClick={() => openReceipt(rollCall, subject)}
      className={cn(
        "inline-flex min-h-11 items-center gap-2 rounded-control text-left text-sm transition-transform duration-150 active:scale-[0.98]",
        className,
      )}
      data-fact="roll-call"
      data-receipt-id={rollCall.receipt.sourceId}
    >
      {children ?? (
        <>
          <FileText className="size-4 shrink-0 text-ink-2" aria-hidden />
          <span className="text-ink-2 tabular-nums underline decoration-hairline underline-offset-4">
            {label}
          </span>
        </>
      )}
    </button>
  );
}
