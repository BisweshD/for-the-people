"use client";

import { ChevronLeft, ChevronRight, LayoutGrid } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { IssueChipIcon } from "@/components/explore/issue-chip-icon";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { fadeMask, useScrollEdges } from "@/hooks/use-scroll-edges";
import { cn } from "@/lib/utils";

export interface IssueChip {
  id: string;
  label: string;
  icon: string;
}

/**
 * The issue rail: one horizontal row of chips at every width that snaps chip by
 * chip. The selected chip underlines. Edges fade where more chips wait, and wider screens get arrows.
 */
export function IssueRail({
  issues,
  selected,
  onSelect,
}: {
  issues: IssueChip[];
  selected: string | null;
  onSelect: (id: string | null) => void;
}) {
  const reduce = useReducedMotion();
  const [ticks, setTicks] = useState<Record<string, number>>({});
  const tap = (id: string | null) => {
    if (id) setTicks((current) => ({ ...current, [id]: (current[id] ?? 0) + 1 }));
    onSelect(id === selected ? null : id);
  };
  const rail = useRef<HTMLDivElement>(null);
  const edges = useScrollEdges(rail, "x");

  // Keep the selected chip in view (for example when the page opens on an issue further along).
  useEffect(() => {
    const container = rail.current;
    const chip = container?.querySelector<HTMLElement>("[aria-pressed=true]");
    if (!container || !chip) return;
    const left = chip.offsetLeft - container.offsetLeft;
    const right = left + chip.offsetWidth;
    if (left < container.scrollLeft || right > container.scrollLeft + container.clientWidth)
      container.scrollTo({ left: left - 48, behavior: "auto" });
  }, [selected]);

  const page = (direction: 1 | -1) => {
    const container = rail.current;
    if (!container) return;
    container.scrollBy({
      left: direction * container.clientWidth * 0.75,
      behavior: reduce ? "auto" : "smooth",
    });
  };

  return (
    <div className="relative -mx-4 md:mx-0">
      <div
        ref={rail}
        role="group"
        aria-label="Issue areas"
        className="no-scrollbar flex snap-x snap-mandatory scroll-px-4 gap-1 overflow-x-auto border-b border-hairline px-4 md:scroll-px-0 md:px-0"
        style={fadeMask(edges, "x")}
      >
        <Chip
          label="All issues"
          pressed={selected === null}
          reduce={reduce}
          onClick={() => tap(null)}
        >
          <LayoutGrid className="size-5" aria-hidden strokeWidth={1.75} />
        </Chip>
        {issues.map((issue) => (
          <Chip
            key={issue.id}
            label={issue.label}
            pressed={selected === issue.id}
            reduce={reduce}
            onClick={() => tap(issue.id)}
          >
            <IssueChipIcon
              name={issue.icon}
              tick={ticks[issue.id] ?? 0}
              reduce={reduce}
              className="size-5"
            />
          </Chip>
        ))}
      </div>
      <RailArrow side="start" hidden={!edges.start} onClick={() => page(-1)} />
      <RailArrow side="end" hidden={!edges.end} onClick={() => page(1)} />
    </div>
  );
}

function RailArrow({
  side,
  hidden,
  onClick,
}: {
  side: "start" | "end";
  hidden: boolean;
  onClick: () => void;
}) {
  const Icon = side === "start" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      // The chips stay reachable by Tab and by swiping; the arrows are a pointer shortcut only.
      tabIndex={-1}
      aria-hidden
      onClick={onClick}
      className={cn(
        "absolute top-0 hidden size-11 items-center justify-center rounded-full border border-hairline bg-paper text-ink shadow-2 transition-opacity duration-200 hover:border-ink-3-graphic md:inline-flex",
        side === "start" ? "-left-3" : "-right-3",
        hidden && "pointer-events-none opacity-0",
      )}
    >
      <Icon className="size-5" strokeWidth={2} />
    </button>
  );
}

function Chip({
  label,
  pressed,
  reduce,
  onClick,
  children,
}: {
  label: string;
  pressed: boolean;
  reduce: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        "group relative inline-flex h-12 shrink-0 snap-start items-center gap-2 rounded-t-control px-3 text-[15px] font-semibold whitespace-nowrap transition-colors duration-150 focus-visible:-outline-offset-2",
        pressed ? "text-ink" : "text-ink-2 hover:text-ink",
      )}
    >
      <span className="inline-flex items-center gap-2 transition-transform duration-150 group-active:scale-[0.96]">
        {children}
        {label}
      </span>
      <span
        aria-hidden
        className={cn(
          "absolute inset-x-3 bottom-0 h-0.5 rounded-full",
          !reduce && "transition-[transform,opacity] duration-200 ease-[var(--ease-oval)]",
          pressed
            ? "scale-x-100 bg-ink opacity-100"
            : "scale-x-50 bg-ink-3-graphic opacity-0 group-hover:scale-x-100 group-hover:opacity-100",
        )}
      />
    </button>
  );
}
