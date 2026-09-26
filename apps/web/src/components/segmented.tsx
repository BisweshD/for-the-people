"use client";

import { cn } from "@/lib/utils";

/**
 * A single-choice row of buttons, as a radio group with arrow-key movement and one tab stop
 * (WAI-ARIA radio group pattern). Small enough that a filter row does not need a UI library.
 */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  labelledBy,
  className,
  itemClassName,
}: {
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
  labelledBy: string;
  className?: string;
  itemClassName?: string;
}) {
  const move = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step =
      event.key === "ArrowRight" || event.key === "ArrowDown"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowUp"
          ? -1
          : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = options[(index + step + options.length) % options.length]!;
    onChange(next.value);
    const group = event.currentTarget.parentElement;
    group?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={cn("flex gap-1.5", className)}>
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            data-value={option.value}
            data-state={checked ? "on" : "off"}
            tabIndex={checked ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, index)}
            className={cn(
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink",
              itemClassName,
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
