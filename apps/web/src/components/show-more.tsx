"use client";

import { ChevronDown } from "lucide-react";
import { useLayoutEffect, useRef, type RefObject } from "react";
import { formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The one "Show more" control for long lists (bill roll calls, roll-call members, Duel splits). It sits
 * after the list, so revealing rows never moves what the reader is looking at. Keyboard focus moves to
 * the first newly shown row, because the button itself disappears once everything is shown.
 *
 * Always render it: it renders nothing when every row is already shown.
 */
export function ShowMore({
  shown,
  total,
  step,
  noun,
  listRef,
  onShow,
  className,
}: {
  /** Rows on screen now. */
  shown: number;
  /** Rows in the whole list. */
  total: number;
  /** Rows added per press. Leave out to show everything at once ("Show all 24 roll calls"). */
  step?: number;
  /** Plural noun for the "Show all" label, such as "roll calls". */
  noun: string;
  /** The list whose children are the rows, so focus can move to the first new one. */
  listRef: RefObject<HTMLElement | null>;
  onShow: (next: number) => void;
  className?: string;
}) {
  const focusFrom = useRef<number | null>(null);

  useLayoutEffect(() => {
    const from = focusFrom.current;
    const list = listRef.current;
    if (from === null || !list || shown <= from) return;
    focusFrom.current = null;
    const row = list.children[from];
    if (!(row instanceof HTMLElement)) return;
    const target = row.querySelector<HTMLElement>("a[href], button:not([disabled])") ?? row;
    if (target === row) row.tabIndex = -1;
    target.focus({ preventScroll: true });
  }, [shown, listRef]);

  if (shown >= total) return null;
  const next = step === undefined ? total : Math.min(total, shown + step);
  const label =
    step === undefined
      ? `Show all ${formatInteger(total)} ${noun}`
      : `Show ${formatInteger(next - shown)} more`;

  return (
    <button
      type="button"
      onClick={() => {
        focusFrom.current = shown;
        onShow(next);
      }}
      className={cn(
        "inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-control border border-ink bg-paper px-6 text-base font-semibold text-ink transition-colors hover:bg-canvas active:scale-[0.98] sm:w-fit",
        className,
      )}
    >
      {label}
      {step !== undefined && (
        <span className="font-normal text-ink-2 tabular-nums">
          <span className="sr-only">, </span>
          {formatInteger(shown)} of {formatInteger(total)} shown
        </span>
      )}
      <ChevronDown className="size-4" aria-hidden />
    </button>
  );
}
