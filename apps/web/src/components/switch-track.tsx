import { cn } from "@/lib/utils";

/**
 * A switch's track and thumb (the button around it carries role="switch"): a paper thumb on a hairline
 * track when off, an ink track when on. The thumb slides with a transform, so reduced motion only
 * drops the travel.
 */
export function SwitchTrack({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "relative inline-flex h-5 w-8 shrink-0 rounded-full border transition-colors duration-200 motion-reduce:transition-none",
        on ? "border-ink bg-ink" : "border-input bg-canvas",
      )}
      aria-hidden
    >
      <span
        className={cn(
          "absolute top-px size-4 rounded-full bg-paper transition-transform duration-200 motion-reduce:transition-none",
          on ? "translate-x-[13px]" : "translate-x-px ring-1 ring-input",
        )}
      />
    </span>
  );
}
