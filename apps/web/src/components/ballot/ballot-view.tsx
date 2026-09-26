"use client";

import { useDaysUntilElection } from "@/hooks/use-days-until-election";
import type { StateCode } from "@for-the-people/core/client";
import { CalendarPlus, Printer } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { AddressForm, type DistrictOption } from "@/components/ballot/address-form";
import { BallotPlanForm } from "@/components/ballot/ballot-plan";
import { DistrictNotice } from "@/components/ballot/district-notice";
import { DistrictDraw } from "@/components/ballot/district-outlines";
import { useBallot } from "@/components/ballot/use-ballot";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ballotDistricts, ICS_PATH, type MapStatusView, type StateOfficeView } from "@/lib/ballot";
import { districtLabel, STATE_NAMES } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { CardView } from "@/lib/views";
import { useVoter, voterActions } from "@/lib/voter-store";

/** Mirrors the loaded layout: the race links, then one ruled panel per race with its rows. */
function RacesSkeleton() {
  return (
    <div className="flex flex-col gap-6 md:gap-8" aria-hidden>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-36 rounded-control" />
        <Skeleton className="h-11 w-44 rounded-control" />
      </div>
      {[3, 4].map((rows) => (
        <div key={rows} className="overflow-hidden rounded-card border border-hairline bg-paper">
          <div className="mx-4 mt-3 h-0.5 bg-hairline md:mx-6" />
          <div className="flex flex-col gap-3 px-4 pt-5 pb-4 md:px-6">
            <Skeleton className="h-7 w-56 rounded-control" />
            <Skeleton className="h-4 w-72 max-w-full rounded-input" />
          </div>
          <div className="flex flex-col divide-y divide-hairline border-t border-hairline">
            {Array.from({ length: rows }, (_, row) => (
              <div
                key={row}
                className="grid grid-cols-[1.75rem_2.5rem_minmax(0,1fr)] items-center gap-x-2.5 px-3 py-2.5 sm:grid-cols-[2.75rem_2.75rem_minmax(0,1fr)_auto] sm:gap-x-4 sm:px-5"
              >
                <span className="grid h-11 place-items-center">
                  <Skeleton className="h-[18px] w-7 rounded-full" />
                </span>
                <Skeleton className="aspect-[4/5] w-full rounded-control" />
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-44 max-w-full rounded-input" />
                  <Skeleton className="h-4 w-28 rounded-input" />
                </div>
                <Skeleton className="hidden h-4 w-36 rounded-input sm:block" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * How long until Election Day, and where the registration deadlines are. The count is read from the
 * device's clock once the page is live; its line keeps its height before then, so the address card
 * below it never moves.
 */
function Countdown({ className }: { className?: string }) {
  const daysLeft = useDaysUntilElection();
  return (
    <div className={cn("flex flex-col items-start gap-1", className)}>
      <p className="flex min-h-12 items-end gap-3">
        {daysLeft !== null && daysLeft >= 0 && (
          <>
            <span className="text-5xl leading-none font-extrabold tracking-tight text-ink tabular-nums">
              {daysLeft}
            </span>
            <span className="pb-0.5 text-base font-bold text-ink">
              {daysLeft === 1 ? "day until Election Day" : "days until Election Day"}
            </span>
          </>
        )}
      </p>
      <Link
        href="/election#key-dates"
        className="inline-flex min-h-11 items-center text-base font-bold text-ink underline underline-offset-4"
      >
        Registration deadlines by state
      </Link>
    </div>
  );
}

/**
 * First run. On phones and tablets: the countdown and registration deadlines, then the address card,
 * then a real race marked as an example. From 1024 px the example and the countdown sit beside the card.
 */
function FirstRun({
  districtOptions,
  example,
}: {
  districtOptions: DistrictOption[];
  example: ReactNode;
}) {
  return (
    <div className="grid w-full gap-6 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-x-16">
      <header className="flex flex-col gap-3">
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink md:text-5xl">
          Find your 2026 ballot
        </h1>
        <p className="max-w-[60ch] text-lg text-ink-2">
          See the U.S. Senate and House races on your ballot for Tuesday, November 3, 2026, their
          candidates, and how the ones with a voting record match your answers.
        </p>
      </header>
      <Countdown className="lg:col-start-2 lg:row-start-2 lg:self-start lg:pt-3" />
      <div className="lg:col-start-1 lg:row-span-2 lg:row-start-2">
        <AddressForm districtOptions={districtOptions} />
      </div>
      {example && (
        <aside
          aria-label="Example race"
          className="mt-2 md:max-w-[26rem] lg:col-start-2 lg:row-start-3 lg:mt-0"
        >
          {example}
        </aside>
      )}
    </div>
  );
}

/** My Ballot: address, districts, races, and the voter's plan. Everything personal stays on the device. */
export function BallotView({
  cards,
  districtOptions,
  mapStatuses,
  offices,
  example,
}: {
  cards: CardView[];
  districtOptions: DistrictOption[];
  mapStatuses: Partial<Record<StateCode, MapStatusView>>;
  offices: Partial<Record<StateCode, StateOfficeView>>;
  /** A real race marked as an example, rendered on the server, for the first run. */
  example: ReactNode;
}) {
  const voter = useVoter();
  const location = voter.location;
  const ballot = useBallot(location);
  const answered = voter.stances.filter((stance) => stance.choice !== "Skip").length;

  if (!location) {
    return <FirstRun districtOptions={districtOptions} example={example} />;
  }

  const districts = ballotDistricts(location);
  const mapStatus = mapStatuses[location.state] ?? null;
  const office = offices[location.state] ?? null;
  const alternates: Record<number, string> =
    mapStatus?.kind === "uncertain" && districts.ballot.length > 1
      ? Object.fromEntries(
          districts.ballot.map((number) => [
            number,
            number === districts.serving
              ? "If the map used in 2024 stands"
              : "If the new map stands",
          ]),
        )
      : {};
  const ballotLine = districts.ballot
    .map((number) => districtLabel(location.state, number))
    .join(" or ");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 md:gap-8">
      <header className="flex flex-col gap-3">
        <p className="type-meta font-bold text-ink-2">
          General election, Tuesday, November 3, 2026
        </p>
        <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink md:text-5xl">
          Your 2026 ballot
        </h1>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {districts.ballot.length === 1 && location.ballotDistrictConfirmed ? (
            <DistrictDraw
              state={location.state}
              district={districts.ballot[0]!}
              fresh={Date.parse(location.setAt) > performance.timeOrigin}
            />
          ) : (
            <p
              className="text-lg text-ink tabular-nums"
              data-fact="ballot-district"
              data-receipt-id="method-district-lookup"
            >
              {districts.ballot.length > 0 ? (
                <>
                  You may vote in <span className="font-bold">{ballotLine}</span> for the U.S. House
                </>
              ) : (
                "Your U.S. House district is not confirmed"
              )}
            </p>
          )}
          <button
            type="button"
            onClick={() => voterActions.setLocation(null)}
            className="inline-flex min-h-11 items-center rounded-control text-base font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
          >
            Change address
          </button>
        </div>
      </header>

      <DistrictNotice location={location} mapStatus={mapStatus} office={office} />

      {answered === 0 && (
        <p className="text-base text-ink-2">
          Candidates who served in Congress show a match once you answer a few key votes.{" "}
          <Link
            href="/swipe"
            className="inline-flex min-h-11 items-center font-bold text-ink underline underline-offset-4"
          >
            Answer key votes
          </Link>
        </p>
      )}

      <section aria-labelledby="races" aria-busy={ballot.status === "loading" || undefined}>
        <h2 id="races" className="sr-only">
          Races on your ballot
        </h2>
        {ballot.status === "ready" ? (
          ballot.ballot.races.length > 0 ? (
            <BallotPlanForm
              ballot={ballot.ballot}
              cards={cards}
              alternates={alternates}
              office={office}
            />
          ) : (
            <p className="rounded-card border border-hairline bg-paper p-5 text-base text-ink-2">
              No federal races are on file for {STATE_NAMES[location.state]} on November 3.
            </p>
          )
        ) : ballot.status === "error" ? (
          <div className="flex flex-col items-start gap-3 rounded-card border border-hairline bg-paper p-5">
            <p className="text-base text-ink">
              We could not load your races. Check your connection and try again.
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </div>
        ) : (
          <>
            <p role="status" className="sr-only">
              Loading your races
            </p>
            <RacesSkeleton />
          </>
        )}
      </section>

      <section
        aria-labelledby="take-it"
        className="flex flex-col gap-4 rounded-card border border-hairline bg-paper p-5 md:p-6 lg:flex-row lg:items-center lg:justify-between"
      >
        <div className="flex flex-col gap-1">
          <h2 id="take-it" className="text-xl font-bold text-ink">
            Take your plan to the polls
          </h2>
          <p className="max-w-[48ch] type-meta text-ink-2">
            The cheat sheet works offline once you have opened it, so you can check it in line.
          </p>
        </div>
        <div className="flex flex-col gap-3 sm:flex-row lg:shrink-0">
          <Button asChild size="lg">
            <Link href="/ballot/cheat-sheet">
              <Printer className="size-5" aria-hidden />
              Open my cheat sheet
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <a href={ICS_PATH} download>
              <CalendarPlus className="size-5" aria-hidden />
              Add Election Day to calendar
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
