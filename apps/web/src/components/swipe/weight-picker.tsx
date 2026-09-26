"use client";

import { WEIGHT_LABELS, type Weight } from "@for-the-people/core/client";
import { useId } from "react";
import { SwitchTrack } from "@/components/switch-track";
import { cn } from "@/lib/utils";

const WEIGHTS: Weight[] = [1, 2, 3];

/**
 * The swipe card's one care control: a switch under Yea and Nay. Off is Some (2), on is A lot (3); the
 * 1 key still sets A little (said beside the switch), and /you keeps the full three-level control.
 * One yes-or-no question per card instead of three options (fewer choices, same stored 1 to 3).
 */
export function CareToggle({
  value,
  onChange,
}: {
  value: Weight;
  onChange: (weight: Weight) => void;
}) {
  const on = value === 3;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-keyshortcuts="1 2 3"
      onClick={() => onChange(on ? 2 : 3)}
      className="inline-flex min-h-11 min-w-0 items-center gap-2.5 rounded-control pr-2 text-left text-sm font-semibold text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <SwitchTrack on={on} />
      <span>
        This one matters a lot to me
        {value === 1 && (
          <span className="font-normal text-ink-2"> (set to {WEIGHT_LABELS[1].toLowerCase()})</span>
        )}
      </span>
    </button>
  );
}

/**
 * "How much do you care?" as a three-way segmented radio group. Words, not ovals: the oval is
 * reserved for a Yea or Nay choice.
 */
export function WeightPicker({
  value,
  onChange,
  label,
}: {
  value: Weight;
  onChange: (weight: Weight) => void;
  /** Screen-reader name for a compact picker with no visible question (the weights list on Matches). */
  label?: string;
}) {
  const labelId = useId();
  const move = (event: React.KeyboardEvent, from: Weight) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = WEIGHTS[(WEIGHTS.indexOf(from) + step + WEIGHTS.length) % WEIGHTS.length]!;
    onChange(next);
    const group = event.currentTarget.parentElement;
    group?.querySelector<HTMLButtonElement>(`[data-weight="${next}"]`)?.focus();
  };
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3",
        // On a narrow phone the question sits on its own line instead of wrapping beside the options.
        !label && "max-[419px]:flex-col max-[419px]:items-stretch max-[419px]:gap-1.5",
      )}
    >
      {!label && (
        <span id={labelId} className="text-sm font-semibold text-ink-2 max-[419px]:text-xs">
          How much do you care?
        </span>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? undefined : labelId}
        aria-label={label}
        className="grid grid-cols-3 rounded-control border border-hairline bg-paper p-0.5"
      >
        {WEIGHTS.map((weight) => {
          const checked = value === weight;
          return (
            <button
              key={weight}
              type="button"
              role="radio"
              data-weight={weight}
              aria-checked={checked}
              aria-keyshortcuts={String(weight)}
              tabIndex={checked ? 0 : -1}
              onClick={() => onChange(weight)}
              onKeyDown={(event) => move(event, weight)}
              className={cn(
                "min-h-11 rounded-[10px] px-3 text-sm font-semibold whitespace-nowrap transition-colors",
                "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
                // The chosen weight has one quiet cue, a bold underlined label, not solid ink: Nay and
                // Yea stay the heaviest targets in the tray.
                checked ? "font-bold text-ink" : "text-ink-2 hover:bg-canvas hover:text-ink",
              )}
            >
              <span className={cn(checked && "underline decoration-2 underline-offset-[5px]")}>
                {WEIGHT_LABELS[weight]}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
