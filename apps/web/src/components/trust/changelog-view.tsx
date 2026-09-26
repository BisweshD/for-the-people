"use client";

import { ChevronRight } from "lucide-react";
import { useEffect, useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { Segmented } from "@/components/segmented";
import { TrustLayout } from "@/components/trust/trust-layout";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Show = "all" | "keyVote" | "ingestion";

/**
 * Key-vote changes first: they change what a voter sees. "Everything" is one tap away, and the choice
 * lives in the address (?show=all or ?show=updates) so a shared or reloaded link keeps it.
 */
const DEFAULT_SHOW: Show = "keyVote";
const SHOW_PARAM: Record<Show, string | null> = { keyVote: null, ingestion: "updates", all: "all" };

function showFromUrl(): Show {
  const value = new URLSearchParams(window.location.search).get("show");
  return (
    (Object.keys(SHOW_PARAM) as Show[]).find((show) => SHOW_PARAM[show] === value) ?? DEFAULT_SHOW
  );
}

/** The address only changes through writeShow, which the filter's own state already follows. */
const noSubscription = () => () => {};

function writeShow(show: Show) {
  const url = new URL(window.location.href);
  const param = SHOW_PARAM[show];
  if (param) url.searchParams.set("show", param);
  else url.searchParams.delete("show");
  history.replaceState(history.state, "", url);
}

/** One day of the log as the month index lists it. */
export interface ChangelogDay {
  /** The day's element id in the log ("day-2026-09-24"). */
  id: string;
  /** "Sep 24" */
  label: string;
  /** "September 2026" */
  month: string;
  keyVote: number;
  ingestion: number;
  /** Every row that day sits behind "Show older changes". */
  older: boolean;
}

const countFor = (day: ChangelogDay, show: Show) =>
  show === "all" ? day.keyVote + day.ingestion : show === "keyVote" ? day.keyVote : day.ingestion;

/**
 * The changelog's filter, month index, and "Show older changes". The log itself is rendered on the
 * server; this only sets two attributes that CSS reads (globals.css), so filtering costs no re-render
 * of the rows. Below 1280 px the filter sits above the log; from 1280 px it moves into the trust
 * pages' sticky right rail (TrustLayout) with an index of months and days.
 */
export function ChangelogView({
  header,
  counts,
  days,
  older,
  children,
}: {
  /** The page header, rendered on the server; it sits level with the rail from 1280 px. */
  header: React.ReactNode;
  counts: { keyVote: number; ingestion: number };
  days: ChangelogDay[];
  older: number;
  children: React.ReactNode;
}) {
  // The server renders the default; a link that asks for more is honored once the page is live, and a
  // tap on the filter wins from then on.
  const fromUrl = useSyncExternalStore(noSubscription, showFromUrl, () => DEFAULT_SHOW);
  const [picked, setPicked] = useState<Show | null>(null);
  const show = picked ?? fromUrl;
  const setShow = (next: Show) => {
    setPicked(next);
    writeShow(next);
  };
  const [expanded, setExpanded] = useState(false);
  const [current, setCurrent] = useState<string | null>(null);
  const labelId = useId();
  const indexId = useId();
  const keyVotes = `${counts.keyVote} key-vote ${counts.keyVote === 1 ? "change" : "changes"}`;
  const updates = `${counts.ingestion} data ${counts.ingestion === 1 ? "update" : "updates"}`;
  const summary =
    show === "all" ? `${keyVotes} and ${updates}` : show === "keyVote" ? keyVotes : updates;

  // The index marks the day being read, as the methodology page's contents do.
  useEffect(() => {
    const sections = days
      .map((day) => document.getElementById(day.id))
      .filter((section): section is HTMLElement => section !== null);
    const visible = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting);
        const first = sections.find((section) => visible.get(section.id));
        if (first) setCurrent(first.id);
      },
      { rootMargin: "-96px 0px -55% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [days]);

  const months = [...new Set(days.map((day) => day.month))].map((month) => ({
    month,
    days: days.filter((day) => day.month === month && countFor(day, show) > 0),
  }));

  /** A day behind "Show older changes" is shown first, then scrolled to. */
  const jump = (event: React.MouseEvent<HTMLAnchorElement>, day: ChangelogDay) => {
    if (!day.older || expanded) return;
    event.preventDefault();
    setExpanded(true);
    requestAnimationFrame(() => {
      document.getElementById(day.id)?.scrollIntoView({ block: "start" });
      history.replaceState(null, "", `#${day.id}`);
    });
  };

  return (
    <TrustLayout
      header={header}
      rail={
        <aside aria-label="Filter and index" className="flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-hairline py-3 xl:flex-col xl:items-stretch xl:border-0 xl:py-0">
            <span id={labelId} className="text-sm font-semibold text-ink-2 max-xl:sr-only">
              Show
            </span>
            <Segmented<Show>
              value={show}
              onChange={setShow}
              labelledBy={labelId}
              options={[
                { value: "keyVote", label: "Key votes" },
                { value: "ingestion", label: "Data updates" },
                { value: "all", label: "Everything" },
              ]}
              className="grid grid-cols-3 gap-0 rounded-control border border-hairline bg-paper p-0.5 xl:grid-cols-1"
              itemClassName="min-h-11 rounded-input px-3 text-sm font-semibold whitespace-nowrap text-ink-2 transition-colors hover:bg-canvas hover:text-ink data-[state=on]:bg-ink data-[state=on]:text-paper data-[state=on]:hover:bg-ink data-[state=on]:hover:text-paper xl:text-left"
            />
            <p className="text-sm text-ink-2 tabular-nums" role="status">
              {summary}
            </p>
          </div>

          <nav aria-labelledby={indexId} className="hidden flex-col gap-3 xl:flex">
            <h2 id={indexId} className="text-sm font-semibold text-ink-2">
              By month
            </h2>
            {months.map(({ month, days: monthDays }) => (
              <div key={month} className="flex flex-col">
                <a
                  href={monthDays[0] ? `#${monthDays[0].id}` : undefined}
                  onClick={(event) => monthDays[0] && jump(event, monthDays[0])}
                  className="inline-flex min-h-11 items-center text-base font-bold text-ink underline-offset-4 hover:underline"
                >
                  {month}
                </a>
                <ul className="flex flex-col border-l border-hairline">
                  {monthDays.map((day) => {
                    const active = day.id === current;
                    return (
                      <li key={day.id}>
                        <a
                          href={`#${day.id}`}
                          onClick={(event) => jump(event, day)}
                          aria-current={active ? "location" : undefined}
                          className={cn(
                            "relative flex min-h-11 items-center justify-between gap-3 pl-4 text-sm tabular-nums underline-offset-4 hover:underline",
                            active
                              ? "font-semibold text-ink before:absolute before:top-1.5 before:bottom-1.5 before:-left-px before:w-0.5 before:bg-ink"
                              : "font-medium text-ink-2 hover:text-ink",
                          )}
                        >
                          {day.label}
                          <span className="font-normal text-ink-2">
                            {countFor(day, show)} {countFor(day, show) === 1 ? "change" : "changes"}
                          </span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
      }
    >
      <div className="flex flex-col gap-6">
        <div data-changelog-show={show} data-changelog-older={expanded ? "shown" : "hidden"}>
          {children}
        </div>
        {older > 0 && !expanded && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={() => setExpanded(true)}
          >
            Show {older} older {older === 1 ? "change" : "changes"}
          </Button>
        )}
      </div>
    </TrustLayout>
  );
}

/**
 * A day's data updates, folded into one row: what they kept current, and a button that opens the list.
 * The "Data updates" filter shows every list open and hides the button (globals.css, "Round 10").
 */
export function DayUpdates({
  title,
  detail,
  count,
  children,
}: {
  title: string;
  detail: ReactNode;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const listId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1" {...(open ? { "data-updates-open": "" } : {})}>
      <p className="text-base leading-snug font-semibold text-ink tabular-nums">{title}</p>
      <p className="text-sm text-ink-2 tabular-nums">{detail}</p>
      <button
        type="button"
        data-updates-toggle
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((value) => !value)}
        className="-ml-2 inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-ink-2 hover:bg-accent hover:text-ink"
      >
        <ChevronRight
          className={cn(
            "size-4 shrink-0 transition-transform duration-[120ms] ease-out motion-reduce:transition-none",
            open && "rotate-90",
          )}
          aria-hidden
        />
        {open ? "Hide the updates" : `Show the ${count} ${count === 1 ? "update" : "updates"}`}
      </button>
      <ol
        id={listId}
        data-updates-list
        className="mt-1 flex-col gap-4 border-l border-hairline pl-4"
      >
        {children}
      </ol>
    </div>
  );
}
