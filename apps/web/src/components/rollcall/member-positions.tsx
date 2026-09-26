"use client";

import type { Position, StateCode } from "@for-the-people/core/client";
import { Search } from "lucide-react";
import Link from "next/link";
import { useDeferredValue, useId, useMemo, useRef, useState } from "react";
import { OfficeText } from "@/components/office-text";
import { PartyTag } from "@/components/party-tag";
import { POSITION_LABEL, PositionGlyph } from "@/components/rollcall/position-cell";
import { ShowMore } from "@/components/show-more";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { seatTitle, type BoardView } from "@/lib/bill-views";
import { formatInteger, STATE_NAMES } from "@/lib/format";

/** Rows shown before "Show all": a phone should not render all 435 at once. */
const PREVIEW = 20;

const FILTERS: Array<Position | "all"> = ["all", "Yea", "Nay", "Present", "NotVoting"];

/** Every member's VotePosition on one roll call, searchable by name and filterable by state and vote. */
export function MemberPositions({ board }: { board: BoardView }) {
  const ids = useId();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<StateCode | "all">("all");
  const [position, setPosition] = useState<Position | "all">("all");
  const [limit, setLimit] = useState(PREVIEW);
  const listRef = useRef<HTMLUListElement>(null);
  const deferredQuery = useDeferredValue(query);
  const { rollCall, seats } = board;

  const states = useMemo(
    () =>
      [...new Set(seats.map((seat) => seat.state))].sort((a, b) =>
        STATE_NAMES[a].localeCompare(STATE_NAMES[b]),
      ),
    [seats],
  );
  const counts = useMemo(() => {
    const byPosition: Record<Position | "all", number> = {
      all: 0,
      Yea: 0,
      Nay: 0,
      Present: 0,
      NotVoting: 0,
    };
    for (const seat of seats) {
      if (state !== "all" && seat.state !== state) continue;
      byPosition.all += 1;
      byPosition[seat.position] += 1;
    }
    return byPosition;
  }, [seats, state]);

  const shown = useMemo(() => {
    const needle = deferredQuery.trim().toLowerCase();
    return seats.filter(
      (seat) =>
        (state === "all" || seat.state === state) &&
        (position === "all" || seat.position === position) &&
        (!needle || seat.name.toLowerCase().includes(needle)),
    );
  }, [seats, state, position, deferredQuery]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
        <label className="flex flex-1 flex-col gap-1.5 type-meta font-bold text-ink-2">
          Search by name
          <span className="relative">
            <Search
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3"
              aria-hidden
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="For example, Smith"
              className="h-11 w-full rounded-input border border-input bg-paper pr-3 pl-9 text-base font-normal text-ink placeholder:text-ink-3"
            />
          </span>
        </label>
        <div className="flex flex-col gap-1.5 md:w-56">
          <label htmlFor={`${ids}-state`} className="type-meta font-bold text-ink-2">
            State
          </label>
          <SelectField
            id={`${ids}-state`}
            value={state}
            onValueChange={(value) => setState(value as StateCode | "all")}
            placeholder="All states"
            options={[
              { value: "all", label: "All states" },
              ...states.map((code) => ({ value: code, label: STATE_NAMES[code] })),
            ]}
          />
        </div>
      </div>

      <div
        role="group"
        aria-label="Filter by vote"
        className="-mx-4 no-scrollbar flex gap-2 overflow-x-auto px-4 after:w-2 after:shrink-0 after:content-[''] md:mx-0 md:px-0 md:after:hidden"
      >
        {FILTERS.map((filter) => (
          <Button
            key={filter}
            type="button"
            variant="outline"
            aria-pressed={position === filter}
            onClick={() => setPosition(filter)}
            className="px-3 tabular-nums"
          >
            {filter !== "all" && <PositionGlyph position={filter} />}
            {filter === "all" ? "Everyone" : POSITION_LABEL[filter]}
            <span className="font-normal text-ink-2">{formatInteger(counts[filter])}</span>
          </Button>
        ))}
      </div>

      <p id={`${ids}-count`} className="type-meta text-ink-2" aria-live="polite">
        Showing {formatInteger(shown.length)} of {formatInteger(seats.length)} members
      </p>
      {shown.length > 0 ? (
        <ul
          ref={listRef}
          className="rounded-card border border-hairline bg-paper px-4 py-1 sm:px-5 md:columns-2 md:gap-x-8"
          aria-describedby={`${ids}-count`}
          data-fact="vote-positions"
          data-receipt-id={rollCall.receipt.sourceId}
        >
          {shown.slice(0, limit).map((seat) => {
            // As in the shared member row: the name, the party letter on the line of the last word,
            // then the office in the same words (OfficeText).
            const words = seat.name.split(" ");
            const last = words.pop();
            return (
              <li
                key={seat.slug}
                className="group relative grid min-h-16 break-inside-avoid grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-3 border-b border-hairline py-2 last:border-0"
              >
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="leading-snug font-bold text-ink">
                    <Link
                      href={`/people/${seat.slug}`}
                      className="underline-offset-4 outline-none group-hover:underline after:absolute after:-inset-x-2 after:inset-y-0 after:rounded-control after:content-[''] focus-visible:underline focus-visible:after:outline-2 focus-visible:after:outline-ink"
                    >
                      {words.length > 0 && `${words.join(" ")} `}
                      <span className="whitespace-nowrap">{last}</span>
                    </Link>
                    <PartyTag party={seat.party} className="ml-1.5 align-[1px]" />
                  </span>
                  <span className="text-sm leading-snug text-ink-2">
                    <OfficeText
                      member={{
                        ...seat,
                        chamber: rollCall.chamber,
                        title: seatTitle(rollCall.chamber, seat.state),
                      }}
                      form="responsive"
                    />
                  </span>
                </span>
                <span className="inline-flex items-center gap-2 text-sm font-bold text-ink">
                  <PositionGlyph position={seat.position} />
                  {POSITION_LABEL[seat.position]}
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-base text-ink-2">
          No member matches that search. Clear the name or pick another state.
        </p>
      )}
      <ShowMore
        shown={Math.min(limit, shown.length)}
        total={shown.length}
        noun="members"
        listRef={listRef}
        onShow={setLimit}
      />
    </div>
  );
}
