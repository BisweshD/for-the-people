"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The full-summary page's two small scripts. Its sections are plain <details>, so the text reads and
 * searches without script (browsers open a closed section to show a find-in-page match); these add
 * "Expand all" and open a section when "On this page" or the address links to it.
 */

const SECTIONS = "details[data-summary-section]";

const sections = () => [...document.querySelectorAll<HTMLDetailsElement>(SECTIONS)];

/** Opens the section an id names and every section around it; returns the element. */
function reveal(hash: string): Element | null {
  const id = decodeURIComponent(hash.replace(/^#/, ""));
  const target = id ? document.getElementById(id) : null;
  for (let node: Element | null = target; node; node = node.parentElement)
    if (node instanceof HTMLDetailsElement && node.matches(SECTIONS)) node.open = true;
  return target;
}

/** Renders nothing; opens linked sections. Mount it once per page. */
export function SummaryAnchors() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest<HTMLAnchorElement>('a[href^="#"]');
      const target = link ? reveal(link.hash) : null;
      if (!link || !target) return;
      event.preventDefault();
      target.scrollIntoView({ block: "start" });
      history.replaceState(null, "", link.hash);
    };
    if (location.hash) reveal(location.hash)?.scrollIntoView({ block: "start" });
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}

export function SummaryExpandAll({ className }: { className?: string }) {
  const [allOpen, setAllOpen] = useState(false);

  useEffect(() => {
    const sync = () => setAllOpen(sections().every((section) => section.open));
    sync();
    // "toggle" does not bubble, so one capture-phase listener hears every section.
    document.addEventListener("toggle", sync, true);
    return () => document.removeEventListener("toggle", sync, true);
  }, []);

  return (
    <button
      type="button"
      onClick={() => {
        const open = !allOpen;
        for (const section of sections()) section.open = open;
        setAllOpen(open);
      }}
      className={cn(
        "inline-flex min-h-11 shrink-0 items-center justify-center rounded-control border border-hairline bg-paper px-3 text-sm font-bold text-ink hover:bg-accent active:scale-[0.98]",
        className,
      )}
    >
      {allOpen ? "Collapse all" : "Expand all"}
    </button>
  );
}
