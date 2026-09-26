"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { ReceiptSheetProps } from "@/components/receipt/receipt-sheet-panel";

export type { ReceiptItem, ReceiptSheetProps } from "@/components/receipt/receipt-sheet-panel";

const Panel = dynamic(
  () =>
    import("@/components/receipt/receipt-sheet-panel").then((module) => module.ReceiptSheetPanel),
  { ssr: false },
);

/**
 * The one Receipt surface. The sheet and its dialog code load the first
 * time a receipt opens, then stay mounted so later opens and closes animate normally.
 */
export function ReceiptSheet(props: ReceiptSheetProps) {
  const [used, setUsed] = useState(false);
  if (props.open && !used) setUsed(true);
  return used ? <Panel {...props} /> : null;
}
