import { useId } from "react";
import { cn } from "@/lib/utils";

/** Loading state as a ballot oval that fills from the pen point and empties. */
export function OvalLoader({ size = 22, className }: { size?: number; className?: string }) {
  const clipId = useId();
  return (
    <svg
      viewBox="0 0 32 20"
      width={size}
      height={Math.round(size / 1.6)}
      className={cn("shrink-0", className)}
      aria-hidden
    >
      <defs>
        <clipPath id={clipId}>
          <ellipse cx="16" cy="10" rx="14.25" ry="8.25" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <circle
          cx="2"
          cy="10"
          r="32"
          className="animate-oval-breathe fill-current"
          style={{ transformOrigin: "2px 10px" }}
        />
      </g>
      <ellipse
        cx="16"
        cy="10"
        rx="14.25"
        ry="8.25"
        fill="none"
        strokeWidth="1.75"
        className="stroke-current"
      />
    </svg>
  );
}
