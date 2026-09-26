"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Pixels from the top of the screen, just under the sticky header, where a section starts being read. */
const READING_LINE = 96;

/**
 * "On this page" for long reading pages. At 1280 px and up it sits in a sticky right rail and marks
 * the section being read; below that it is a plain list above the text, or, with `compact`, one
 * "Jump to" button (placed in a sticky band by TrustLayout's `stickyRail`) that opens the list and
 * names the section being read.
 */
export function SectionNav({
  items,
  compact = false,
  className,
}: {
  items: ReadonlyArray<{ id: string; label: string }>;
  compact?: boolean;
  className?: string;
}) {
  const [current, setCurrent] = useState<string | null>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const currentLabel = items.find((item) => item.id === current)?.label;

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((section): section is HTMLElement => section !== null);
    // The section being read is the last one whose top has reached a line just under the sticky
    // header. Above the first section nothing is current; at the very bottom the last section on
    // screen is, since a short last section never reaches the line.
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2;
      const line = atBottom ? window.innerHeight : READING_LINE;
      const passed = sections.filter((section) => section.getBoundingClientRect().top <= line);
      setCurrent(passed.at(-1)?.id ?? null);
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    // Opening or closing a summary section moves every section below it.
    document.addEventListener("toggle", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("toggle", schedule, true);
    };
  }, [items]);

  return (
    <nav aria-labelledby="on-this-page" className={className}>
      {compact && (
        <details ref={menu} className="group/jump relative xl:hidden">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 rounded-control border border-input bg-paper px-4 py-1.5 shadow-1 hover:border-ink [&::-webkit-details-marker]:hidden">
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="text-base font-semibold text-ink">Jump to a section</span>
              {currentLabel && (
                <span className="truncate text-sm text-ink-2">Reading: {currentLabel}</span>
              )}
            </span>
            <ChevronDown
              className="size-5 shrink-0 text-ink-2 transition-transform duration-200 ease-out group-open/jump:rotate-180 motion-reduce:transition-none"
              aria-hidden
            />
          </summary>
          <ul className="absolute inset-x-0 top-full z-10 mt-2 max-h-[60dvh] overflow-y-auto rounded-control border border-hairline bg-paper p-1.5 shadow-3">
            {items.map((item) => (
              <li key={item.id}>
                <a
                  href={`#${item.id}`}
                  aria-current={item.id === current ? "location" : undefined}
                  onClick={() => {
                    if (menu.current) menu.current.open = false;
                  }}
                  className={cn(
                    "flex min-h-11 items-center rounded-control px-3 text-base hover:bg-accent",
                    item.id === current ? "font-semibold text-ink" : "font-medium text-ink-2",
                  )}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
      <h2
        id="on-this-page"
        className={cn("text-sm font-semibold text-ink-2", compact && "max-xl:hidden")}
      >
        On this page
      </h2>
      <ul
        className={cn(
          "mt-2 grid gap-x-6 sm:grid-cols-2 xl:mt-3 xl:grid-cols-1 xl:border-l xl:border-hairline",
          compact && "max-xl:hidden",
        )}
      >
        {items.map((item) => {
          const active = item.id === current;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                aria-current={active ? "location" : undefined}
                className={cn(
                  "relative inline-flex min-h-11 items-center rounded-control text-base underline-offset-4 hover:underline xl:min-h-9 xl:pl-4 xl:text-sm",
                  active
                    ? "font-semibold text-ink xl:before:absolute xl:before:top-1.5 xl:before:bottom-1.5 xl:before:-left-px xl:before:w-0.5 xl:before:bg-ink"
                    : "font-medium text-ink-2 xl:hover:text-ink",
                )}
              >
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
