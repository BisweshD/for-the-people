"use client";

import { FileText } from "lucide-react";
import { useState } from "react";
import { ReceiptSheet, type ReceiptItem } from "@/components/receipt/receipt-sheet";
import { rollCallReceipt } from "@/components/swipe/card-receipt";
import { Button } from "@/components/ui/button";
import type { RollCallView } from "@/lib/views";
import { cn } from "@/lib/utils";

/**
 * A small "Receipt" control that opens the one ReceiptSheet. Server components pass plain data (the
 * items to print) so the page stays static; only this button hydrates.
 */
export function ReceiptButton({
  subject,
  items,
  method,
  fact,
  label = "Receipt",
  inRow = false,
  className,
}: {
  subject: string;
  items: ReceiptItem[];
  method: string;
  /** The data-fact kind this receipt backs. */
  fact: string;
  label?: string;
  /**
   * A 44 px outlined button inside a list row that shows the word "Receipt"; `label` ("Receipt for House
   * roll call 190") is its accessible name, which starts with that visible word.
   */
  inRow?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const first = items[0];
  if (!first) return null;
  return (
    <>
      {/* In a row: a secondary button with the word "Receipt". Elsewhere: a tertiary, underlined link. */}
      <Button
        type="button"
        variant={inRow ? "outline" : "link"}
        onClick={() => setOpen(true)}
        aria-label={inRow ? label : undefined}
        aria-haspopup="dialog"
        className={cn(inRow ? "px-3" : "justify-start px-0 text-left", className)}
        data-fact={fact}
        data-receipt-id={first.receipt.sourceId}
      >
        <FileText className="size-4" aria-hidden />
        {inRow ? "Receipt" : label}
      </Button>
      <ReceiptSheet
        open={open}
        onOpenChange={setOpen}
        subject={subject}
        items={items}
        method={method}
      />
    </>
  );
}

export const ROLL_CALL_METHOD =
  "For The People copies every roll call and each member's vote from the chamber's official record: the House Clerk for the House and the Senate's roll call files for the Senate.";

/** The receipt for one roll call, as a button. */
export function RollCallReceiptButton({
  rollCall,
  subject,
  label,
  inRow,
  className,
}: {
  rollCall: RollCallView;
  subject: string;
  label?: string;
  inRow?: boolean;
  className?: string;
}) {
  return (
    <ReceiptButton
      subject={subject}
      items={[rollCallReceipt(rollCall)]}
      method={ROLL_CALL_METHOD}
      fact="roll-call"
      label={label}
      inRow={inRow}
      className={className}
    />
  );
}
