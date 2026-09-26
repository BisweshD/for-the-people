"use client";

import type { StateCode } from "@for-the-people/core/client";
import type { StateElectionInfo } from "@for-the-people/core/calendar";
import { CalendarPlus, ExternalLink } from "lucide-react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { createContext, use } from "react";
import { Countdown } from "@/components/election/countdown";
import { STATE_SELECT_ID } from "@/components/election/election-actions";
import { Button } from "@/components/ui/button";
import { SelectField } from "@/components/ui/select-field";
import { useDaysUntilElection } from "@/hooks/use-days-until-election";
import { useHydrated } from "@/hooks/use-hydrated";
import { daysBefore, nextDeadline, type Channel, type NextDeadline } from "@/lib/deadlines";
import { cn } from "@/lib/utils";
import { useVoter } from "@/lib/voter-store";

/**
 * The election page's countdown card: the days left, the voter's state, and, once a state is chosen,
 * when to register (in vote.gov's words) on a three-stop line from today to Election Day. Its one ink
 * button checks the voter's registration on their state's official site.
 */

const StatesContext = createContext<readonly StateElectionInfo[]>([]);

/**
 * Hands every state's vote.gov entry to the card and the key dates once (the page would otherwise send
 * the 51 entries to each), and reads ?state= for both.
 */
export function ElectionStates({
  states,
  children,
}: {
  states: readonly StateElectionInfo[];
  children: React.ReactNode;
}) {
  return (
    <NuqsAdapter>
      <StatesContext value={states}>{children}</StatesContext>
    </NuqsAdapter>
  );
}

export const useElectionStates = () => use(StatesContext);

/** The state in ?state=, or the voter's saved state; shared by the card and the key dates below. */
export function useChosenState() {
  const states = useElectionStates();
  const codes = states.map((entry) => entry.state);
  const [selected, setSelected] = useQueryState(
    "state",
    parseAsStringLiteral(codes).withOptions({ history: "replace", scroll: false }),
  );
  const voter = useVoter();
  const hydrated = useHydrated();
  const home = hydrated ? voter.location?.state : undefined;
  const code: StateCode | null = selected ?? (home && codes.includes(home) ? home : null);
  return {
    entry: states.find((candidate) => candidate.state === code) ?? null,
    choose: (value: StateCode) => void setSelected(value),
  };
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

/** "online or in person" */
const joinChannels = (channels: Channel[]): string =>
  channels.length > 1
    ? `${channels.slice(0, -1).join(", ")} or ${channels.at(-1)}`
    : (channels[0] ?? "");

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function ElectionCard({ electionDay }: { electionDay: string }) {
  const { entry, choose } = useChosenState();
  return <ElectionCardView electionDay={electionDay} entry={entry} onChoose={choose} />;
}

/** The card itself; the page renders it with no state chosen while the URL is still being read. */
export function ElectionCardView({
  electionDay,
  entry = null,
  onChoose,
}: {
  electionDay: string;
  entry?: StateElectionInfo | null;
  onChoose?: (value: StateCode) => void;
}) {
  const states = useElectionStates();
  const days = useDaysUntilElection(electionDay);
  const next = entry?.registrationRequired ? nextDeadline(entry.deadlines, days) : null;
  const check = officialCheck(entry);

  return (
    <div id="election-card" className="flex scroll-mt-24 flex-col gap-4">
      {/* The ballot sheet's header (components/ballot): an ink rule over a dashed line of plain facts. */}
      <div className="overflow-hidden rounded-card border border-hairline bg-paper">
        <div className="h-0.5 bg-ink" aria-hidden />
        <p className="flex flex-wrap items-center justify-between gap-x-4 border-b border-dashed border-hairline px-5 py-2.5 text-sm text-ink-2 md:px-7">
          <span>Official 2026 general election</span>
          <span>Deadlines from vote.gov</span>
        </p>
        <div className="flex flex-col gap-5 px-5 pt-4 pb-5 md:px-7 md:pt-5 md:pb-6">
          <Countdown date={electionDay} />
          <div className="flex flex-col gap-2 border-t border-hairline pt-4">
            <label htmlFor={STATE_SELECT_ID} className="text-base font-semibold text-ink">
              Your state
            </label>
            <SelectField
              id={STATE_SELECT_ID}
              value={entry?.state ?? ""}
              onValueChange={(value) => onChoose?.(value as StateCode)}
              placeholder="Choose a state"
              options={[...states]
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((option) => ({ value: option.state, label: option.name }))}
              aria-describedby={entry ? undefined : "election-state-hint"}
              className="max-w-sm"
            />
            {!entry && (
              <p id="election-state-hint" className="text-sm text-ink-2">
                Choose your state to see when to register.
              </p>
            )}
          </div>
          {entry && <RegisterLine entry={entry} next={next} />}
          {entry && days !== null && days > 0 && (
            <Timeline
              key={entry.state}
              register={next ? daysBefore(next.wording) : -1}
              electionDay={electionDay}
            />
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild size="lg">
          <a href={check.href} target="_blank" rel="noopener noreferrer">
            {check.label}
            <ExternalLink aria-hidden />
            <span className="sr-only">(opens an official site in a new tab)</span>
          </a>
        </Button>
        <Button asChild size="lg" variant="outline">
          <a href="/election/election-day.ics" download="election-day-2026.ics">
            <CalendarPlus aria-hidden />
            Add Election Day to calendar
          </a>
        </Button>
      </div>
    </div>
  );
}

/**
 * Where "Check your registration" goes: the chosen state's official lookup when vote.gov lists one,
 * the state's election office when it does not require registration, and vote.gov otherwise.
 */
function officialCheck(entry: StateElectionInfo | null): { href: string; label: string } {
  if (entry && !entry.registrationRequired)
    return { href: entry.links.electionOffice, label: `${entry.name} election office` };
  if (entry?.links.checkRegistration)
    return { href: entry.links.checkRegistration, label: "Check your registration" };
  return { href: entry?.source.url ?? "https://vote.gov/", label: "Check your registration" };
}

/** "Register by" and the next deadline in vote.gov's words, with the ways it applies to. */
function RegisterLine({ entry, next }: { entry: StateElectionInfo; next: NextDeadline | null }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="text-sm font-semibold text-ink-2">
        {entry.registrationRequired
          ? `Register in ${entry.name} by`
          : `Registration in ${entry.name}`}
      </p>
      <p
        className="text-lg leading-snug font-bold text-ink"
        data-fact="registration-deadline"
        data-receipt-id={entry.source.id}
      >
        {!entry.registrationRequired
          ? `${entry.name} does not require voter registration.`
          : next
            ? `${next.wording}, ${lowerFirst(joinChannels(next.channels))}`
            : "Check your registration deadline with your state's election office."}
      </p>
    </div>
  );
}

/**
 * Today, the registration deadline, and Election Day, evenly spaced (the stops mark order, not a scale
 * of days). `register` is the deadline's days before Election Day as vote.gov words it, null when the
 * wording gives no count, or -1 when there is no deadline to show (no registration, or none still open),
 * which leaves the middle stop out. The marigold "You are here" dot settles in once.
 */
function Timeline({ register, electionDay }: { register: number | null; electionDay: string }) {
  const stops = [
    { key: "today", label: "Today", sub: "You are here" },
    ...(register === -1
      ? []
      : [
          {
            key: "register",
            label: "Register by",
            sub:
              register === null
                ? "See above"
                : register === 0
                  ? "On Election Day"
                  : `${register} days before`,
          },
        ]),
    {
      key: "election",
      label: "Election Day",
      sub: SHORT_DATE.format(new Date(`${electionDay}T12:00:00Z`)),
    },
  ];
  return (
    <ol
      aria-label="From today to Election Day"
      className={cn(
        "relative grid pt-1",
        stops.length === 3 ? "grid-cols-3" : "grid-cols-2",
        // The line joins the dots' centers, from the first stop to the last.
        "before:absolute before:top-[13px] before:right-2 before:left-2 before:h-0.5 before:bg-ink",
      )}
    >
      {stops.map((stop, index) => {
        const first = index === 0;
        const last = index === stops.length - 1;
        return (
          <li
            key={stop.key}
            className={cn(
              "relative flex flex-col gap-1.5",
              first
                ? "items-start text-left"
                : last
                  ? "items-end text-right"
                  : "items-center text-center",
            )}
          >
            {first ? (
              <span
                className="size-5 rounded-full border-2 border-ink bg-you-mark motion-safe:animate-[here-in_280ms_var(--ease-oval)_both]"
                aria-hidden
              />
            ) : (
              <span
                className={cn(
                  "mt-0.5 size-4 rounded-full border-2 border-ink",
                  last ? "bg-ink" : "bg-paper",
                )}
                aria-hidden
              />
            )}
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-bold text-ink">{stop.label}</span>
              <span className="text-sm text-ink-2 tabular-nums">{stop.sub}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
