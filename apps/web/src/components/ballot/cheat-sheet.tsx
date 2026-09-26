"use client";

import type { StateCode } from "@for-the-people/core/client";
import { CalendarPlus, ExternalLink, Printer, WifiOff } from "lucide-react";
import Link from "next/link";
import { useId, useSyncExternalStore } from "react";
import { useBallot } from "@/components/ballot/use-ballot";
import { Oval } from "@/components/oval";
import { PartyTag } from "@/components/party-tag";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ballotDistricts,
  GENERAL_ELECTION_ID,
  ICS_PATH,
  raceTitle,
  type StateOfficeView,
} from "@/lib/ballot";
import { districtLabel, STATE_NAMES } from "@/lib/format";
import { useVoter } from "@/lib/voter-store";

/**
 * Print: only the sheet. The site frame, buttons and links' chrome go; the light palette is forced so a
 * dark-mode screen still prints dark ink on white paper; each race stays on one page; link targets are
 * printed after the link text, since paper cannot be tapped.
 */
const PRINT_CSS = `@media print {
  @page { margin: 14mm; }
  html, html.dark {
    color-scheme: light;
    --paper: #fff; --canvas: #fff; --hairline: #c9ced6; --ink: #000; --ink-2: #1f2430; --ink-3: #3d4454;
    --ink-3-graphic: #3d4454; --background: #fff; --foreground: #000;
    --party-r: #7a2e2c; --party-r-soft: #fff; --party-d: #2b4577; --party-d-soft: #fff;
    --party-i: #3d4454; --party-i-soft: #fff;
  }
  body { background: #fff !important; }
  body > div > header, body > div > footer, nav, a[href="#main"], [data-print-hide] { display: none !important; }
  main { padding: 0 !important; max-width: none !important; }
  [data-print-sheet] { border-color: #000 !important; box-shadow: none !important; }
  [data-print-keep] { break-inside: avoid; }
  a[data-print-url]::after { content: " (" attr(href) ")"; font-weight: 400; word-break: break-all; }
}`;

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const useOnline = () =>
  useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );

/** The printable, offline cheat sheet: the voter's BallotPlan, rendered only from this device. */
export function CheatSheet({ offices }: { offices: Partial<Record<StateCode, StateOfficeView>> }) {
  const voter = useVoter();
  const online = useOnline();
  const printReasonId = useId();
  const location = voter.location;
  const ballot = useBallot(location);
  const plan = voter.ballotPlan?.electionId === GENERAL_ELECTION_ID ? voter.ballotPlan : null;

  const header = (
    <header className="flex flex-col gap-2">
      <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink md:text-5xl">
        My ballot cheat sheet
      </h1>
      <p className="text-lg text-ink-2">
        General election, <span className="whitespace-nowrap">Tuesday, November 3, 2026</span>
      </p>
    </header>
  );

  if (!location) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        {header}
        <div className="flex flex-col items-start gap-4 overflow-hidden rounded-card border border-hairline bg-paper">
          <div className="mx-5 mt-3 h-0.5 self-stretch bg-ink" aria-hidden />
          <div className="flex flex-col items-start gap-4 px-5 pb-5">
            <p className="max-w-[52ch] text-base text-ink-2">
              Your cheat sheet fills in once you find your ballot and pick in each race. It stays on
              this device and works offline.
            </p>
            <Button asChild size="lg">
              <Link href="/ballot">Find my ballot</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const districts = ballotDistricts(location);
  const office = offices[location.state] ?? null;
  const entries = new Map(plan?.entries.map((entry) => [entry.raceId, entry]));
  // A race counts as planned with a pick still on its list, or "Undecided". Until the race list loads,
  // the saved entries stand in.
  const planned =
    ballot.status === "ready"
      ? ballot.ballot.races.filter((race) => {
          const choice = entries.get(race.id)?.choice;
          return (
            choice?.kind === "undecided" ||
            (choice?.kind === "candidacy" &&
              race.candidates.some((candidate) => candidate.candidacyId === choice.candidacyId))
          );
        }).length
      : entries.size;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <style href="for-the-people-cheat-sheet-print" precedence="default">
        {PRINT_CSS}
      </style>
      {header}

      {!online && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-control bg-canvas px-4 py-3 text-sm font-bold text-ink ring-1 ring-hairline"
        >
          <WifiOff className="size-4 shrink-0" aria-hidden />
          You are offline. This is the plan saved on this device.
        </p>
      )}

      <div
        className="overflow-hidden rounded-card border border-hairline bg-paper"
        data-print-sheet
      >
        <div className="mx-5 mt-3 h-0.5 bg-ink" aria-hidden />
        <p className="flex flex-wrap items-center justify-between gap-x-4 border-b border-dashed border-hairline px-5 py-2.5 type-meta text-ink-2 tabular-nums">
          <span>{STATE_NAMES[location.state]}</span>
          <span>
            U.S. House district{" "}
            <span className="font-bold text-ink">
              {districts.ballot
                .map((number) => districtLabel(location.state, number))
                .join(" or ") || "not confirmed"}
            </span>
          </span>
        </p>

        {ballot.status === "ready" ? (
          <ol aria-label="Your picks" className="flex flex-col divide-y divide-hairline">
            {ballot.ballot.races.map((race) => {
              const entry = entries.get(race.id);
              const choice = entry?.choice;
              const pick =
                choice?.kind === "candidacy"
                  ? race.candidates.find(
                      (candidate) => candidate.candidacyId === choice.candidacyId,
                    )
                  : undefined;
              const stale = choice?.kind === "candidacy" && !pick;
              return (
                <li key={race.id} className="flex flex-col gap-1.5 px-5 py-4" data-print-keep>
                  <h2 className="type-meta font-bold text-ink-2">{raceTitle(race)}</h2>
                  {pick ? (
                    <p
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xl font-bold text-ink"
                      data-fact="candidacy"
                      data-receipt-id={pick.receipt.sourceId}
                    >
                      <Oval filled size={28} animate={false} />
                      {pick.name}
                      <PartyTag party={pick.party} full />
                    </p>
                  ) : choice ? (
                    <p className="flex items-center gap-3 text-xl font-bold text-ink-2">
                      <Oval filled={false} size={28} />
                      {stale
                        ? "Pick again: your earlier pick is no longer on this race's list"
                        : "Undecided"}
                    </p>
                  ) : (
                    // Nothing chosen yet: quiet, so the races with a plan carry the sheet.
                    <p className="flex items-center gap-3 text-base font-medium text-ink-2">
                      <Oval filled={false} dashed size={28} animate={false} />
                      Not planned yet
                    </p>
                  )}
                  {entry?.note && <p className="pl-10 text-base text-ink-2">Note: {entry.note}</p>}
                </li>
              );
            })}
          </ol>
        ) : ballot.status === "error" ? (
          <p className="p-5 text-base text-ink-2">
            Your picks are saved on this device, but the race list could not load. Open this page
            once while you are online, and it will be here offline after that.
          </p>
        ) : (
          <div className="flex flex-col gap-3 p-5" aria-hidden>
            <Skeleton className="h-4 w-40 rounded-input" />
            <Skeleton className="h-7 w-64 rounded-input" />
            <Skeleton className="h-4 w-40 rounded-input" />
            <Skeleton className="h-7 w-56 rounded-input" />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center" data-print-hide>
        {planned === 0 && (
          <Button asChild size="lg">
            <Link href="/ballot">Plan my ballot</Link>
          </Button>
        )}
        {/* Stays in place, not removed, while there is nothing to print: it says why instead. */}
        <Button
          type="button"
          size="lg"
          variant={planned === 0 ? "outline" : "default"}
          aria-disabled={planned === 0 || undefined}
          aria-describedby={planned === 0 ? printReasonId : undefined}
          onClick={() => {
            if (planned > 0) window.print();
          }}
        >
          <Printer className="size-5" aria-hidden />
          Print
        </Button>
        {planned === 0 && (
          // Right under Print on a phone; a full line under the buttons from 640px up.
          <p
            id={printReasonId}
            className="-mt-1 type-meta text-ink-2 sm:order-last sm:mt-0 sm:basis-full"
          >
            Print is ready once you plan at least one race.
          </p>
        )}
        <Button asChild variant="outline" size="lg">
          <a href={ICS_PATH} download>
            <CalendarPlus className="size-5" aria-hidden />
            Add Election Day to calendar
          </a>
        </Button>
        {planned > 0 && (
          <Button asChild variant="ghost" size="lg">
            <Link href="/ballot">Edit my ballot</Link>
          </Button>
        )}
      </div>

      <div
        className="flex flex-col gap-2 rounded-card bg-canvas p-5 ring-1 ring-hairline"
        data-print-keep
      >
        <h2 className="text-base font-bold text-ink">Before you go</h2>
        <p className="max-w-[68ch] text-base text-ink-2">
          Some states limit phones and cameras inside the polling place. Print this page or copy
          your picks onto paper, and check {STATE_NAMES[location.state]}&apos;s rules before you go.
        </p>
        {office && (
          <a
            href={office.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-control text-base font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
            data-print-url
          >
            <ExternalLink className="size-4 shrink-0" aria-hidden />
            {STATE_NAMES[location.state]} election office
            <span className="sr-only">(opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  );
}
