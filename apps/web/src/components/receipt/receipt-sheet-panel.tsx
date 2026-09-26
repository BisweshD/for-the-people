"use client";

import { ExternalLink, ShieldCheck } from "lucide-react";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import * as m from "motion/react-m";
import { useRef } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { MotionRoot } from "@/components/motion-root";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useReturnFocus } from "@/hooks/use-return-focus";
import { formatEasternDate } from "@/lib/time";
import { duration, easeOut, spring, stagger } from "@/lib/motion";
import type { ReceiptView } from "@/lib/views";

/**
 * The one Receipt surface: a bottom sheet under 768 px, a side panel above.
 * Every line names the official source, when we retrieved it, and how we checked it.
 */

export interface ReceiptItem {
  title: string;
  lines: Array<{ label: string; value: string }>;
  receipt: ReceiptView;
  verified: { checkedAt: string | null } | null;
  /** The human-readable official page for this fact (the Source may be the machine-readable file behind it). */
  href: string;
}

export interface ReceiptSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  subject: string;
  items: ReceiptItem[];
  method: string;
}

const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.6;

function ReceiptSheetInner({ open, onOpenChange, subject, items, method }: ReceiptSheetProps) {
  const desktop = useMediaQuery("(min-width: 768px)");
  const reduce = useReducedMotion();
  const returnFocus = useReturnFocus();
  const contentRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ startY: number; startTime: number; offset: number } | null>(null);

  const setOffset = (offset: number) => {
    if (contentRef.current)
      contentRef.current.style.transform = offset ? `translateY(${offset}px)` : "";
  };

  const onPointerDown = (event: React.PointerEvent) => {
    if (desktop) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { startY: event.clientY, startTime: performance.now(), offset: 0 };
  };
  const onPointerMove = (event: React.PointerEvent) => {
    if (!drag.current) return;
    drag.current.offset = Math.max(0, event.clientY - drag.current.startY);
    setOffset(drag.current.offset);
  };
  const onPointerUp = () => {
    const state = drag.current;
    drag.current = null;
    if (!state) return;
    const velocity = state.offset / Math.max(1, performance.now() - state.startTime);
    if (state.offset > DISMISS_DISTANCE || velocity > DISMISS_VELOCITY) onOpenChange(false);
    else setOffset(0);
  };

  let line = 0;
  const printed = () => {
    const index = line++;
    return reduce
      ? {}
      : {
          initial: { opacity: 0, y: 4 },
          animate: { opacity: 1, y: 0 },
          transition: {
            delay: 0.12 + index * stagger.receipt,
            duration: duration.base,
            ease: easeOut,
          },
        };
  };
  const allVerified = items.length > 0 && items.every((item) => item.verified);
  const checkedAt = items.map((item) => item.verified?.checkedAt).find(Boolean);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        {...returnFocus}
        ref={contentRef}
        side={desktop ? "right" : "bottom"}
        className="gap-0 overflow-hidden"
        aria-describedby="receipt-method"
      >
        {!desktop && (
          <div
            className="flex cursor-grab touch-none justify-center pt-3 pb-1 active:cursor-grabbing"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            aria-hidden
          >
            <span className="h-1.5 w-10 rounded-full bg-hairline" />
          </div>
        )}
        <SheetHeader className="px-6 pt-4 pb-2">
          <SheetTitle className="text-xl font-bold">Receipt</SheetTitle>
          <SheetDescription className="text-base text-ink-2">{subject}</SheetDescription>
          <p className="text-sm text-ink-3">
            Where this comes from in the official record, and when we read it.
          </p>
        </SheetHeader>
        <div className="flex flex-col gap-4 overflow-y-auto px-6 pb-6">
          {items.map((item) => (
            <section
              key={`${item.receipt.sourceId}-${item.title}`}
              className="rounded-card border border-hairline bg-canvas p-4"
              data-receipt-id={item.receipt.sourceId}
            >
              <m.h3 className="text-base font-bold text-ink" {...printed()}>
                {item.title}
              </m.h3>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {item.lines.map((entry) => (
                  <m.div key={entry.label} className="contents" {...printed()}>
                    <dt className="text-ink-3">{entry.label}</dt>
                    <dd className="text-ink tabular-nums">{entry.value}</dd>
                  </m.div>
                ))}
                <m.div className="contents" {...printed()}>
                  <dt className="text-ink-3">Source</dt>
                  <dd className="text-ink">{item.receipt.publisher}</dd>
                </m.div>
                <m.div className="contents" {...printed()}>
                  <dt className="text-ink-3">Downloaded</dt>
                  <dd className="text-ink tabular-nums">
                    {formatEasternDate(item.receipt.retrievedAt)}
                  </dd>
                </m.div>
              </dl>
              <m.a
                href={item.href}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-control text-sm font-semibold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                {...printed()}
              >
                <ExternalLink className="size-4" aria-hidden />
                View the official record
                <span className="sr-only">(opens in a new tab)</span>
              </m.a>
            </section>
          ))}
          {allVerified && (
            <m.div
              className="inline-flex w-fit -rotate-2 items-center gap-2 rounded-control border-2 border-agree px-3 py-1.5 text-sm font-bold text-agree"
              initial={reduce ? false : { opacity: 0, scale: 1.25 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={
                reduce ? { duration: 0 } : { ...spring.oval, delay: 0.12 + line * stagger.receipt }
              }
            >
              <ShieldCheck className="size-4" aria-hidden />
              Verified from the official record
            </m.div>
          )}
          <p id="receipt-method" className="text-sm leading-relaxed text-ink-2">
            {method}
            {checkedAt ? ` Last checked ${formatEasternDate(checkedAt)}.` : ""}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Loaded on first open by ReceiptSheet; brings its own Motion features for the line-by-line reveal. */
export function ReceiptSheetPanel(props: ReceiptSheetProps) {
  return (
    <MotionRoot>
      <ReceiptSheetInner {...props} />
    </MotionRoot>
  );
}
