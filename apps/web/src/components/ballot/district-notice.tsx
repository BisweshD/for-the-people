"use client";

import type { Location } from "@for-the-people/core/client";
import { ArrowRight, ExternalLink, Scale } from "lucide-react";
import { DistrictOutlines } from "@/components/ballot/district-outlines";
import {
  ballotDistricts,
  MAP_DISPUTE_NOTES,
  type MapStatusView,
  type StateOfficeView,
} from "@/lib/ballot";
import { districtLabel, STATE_NAMES } from "@/lib/format";

function OfficialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-control font-bold text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
    >
      <ExternalLink className="size-4 shrink-0" aria-hidden />
      {children}
      <span className="sr-only">(opens in a new tab)</span>
    </a>
  );
}

/**
 * What changed about the voter's district for 2026: a new district number, new lines under the same
 * number, or (where a court has not settled the map) both possible districts. Nothing when nothing changed.
 */
export function DistrictNotice({
  location,
  mapStatus,
  office,
}: {
  location: Location;
  mapStatus: MapStatusView | null;
  office: StateOfficeView | null;
}) {
  const { state, serving, ballot } = ballotDistricts(location);
  const stateName = STATE_NAMES[state];

  if (mapStatus?.kind === "uncertain") {
    const [first, second] = ballot;
    return (
      <section
        aria-labelledby="district-notice"
        className="flex flex-col gap-3 rounded-card border-2 border-ink bg-paper p-5"
        data-fact="ballot-district"
        data-receipt-id="method-district-lookup"
      >
        <h2 id="district-notice" className="flex items-start gap-2 text-lg font-bold text-ink">
          <Scale className="mt-0.5 size-5 shrink-0" aria-hidden />
          {stateName}&apos;s 2026 congressional map is still being decided in court
        </h2>
        {MAP_DISPUTE_NOTES[state] && (
          <p className="max-w-[68ch] text-base text-ink-2">{MAP_DISPUTE_NOTES[state]}</p>
        )}
        <p className="text-base text-ink-2">
          {first !== undefined && second !== undefined
            ? `Your district may be ${districtLabel(state, first)} (the new map) or ${districtLabel(state, second)} (the map used in 2024). Both House races are listed below.`
            : first !== undefined
              ? `You are in ${districtLabel(state, first)} under either map, but the lines around it may still change.`
              : "We could not tell which district you will vote in."}{" "}
          Check with {office ? office.name : "your state"}&apos;s election office before you vote.
        </p>
        <div className="flex flex-wrap gap-x-6">
          {office && <OfficialLink href={office.url}>{stateName} election office</OfficialLink>}
          <OfficialLink href={mapStatus.officialSource}>The court filing</OfficialLink>
        </div>
      </section>
    );
  }

  const next = ballot[0];
  if (!location.ballotDistrictConfirmed || next === undefined) {
    return (
      <section
        aria-labelledby="district-notice"
        className="flex flex-col gap-2 rounded-card border border-hairline bg-paper p-5"
      >
        <h2 id="district-notice" className="text-lg font-bold text-ink">
          We could not confirm your 2026 district
        </h2>
        <p className="text-base text-ink-2">
          {stateName} drew new district lines for 2026, and the Census Bureau did not return your
          new district. Your U.S. Senate races are below. Check your House district with your
          state&apos;s election office.
        </p>
        {office && <OfficialLink href={office.url}>{stateName} election office</OfficialLink>}
      </section>
    );
  }

  if (serving === null || (serving === next && mapStatus?.kind !== "redrawn")) return null;

  const changedNumber = serving !== next;
  return (
    <section
      aria-labelledby="district-notice"
      className="grid gap-5 rounded-card border border-hairline bg-paper p-5 md:grid-cols-[minmax(0,1fr)_minmax(0,360px)] md:items-center md:p-7"
      data-fact="district-change"
      data-receipt-id="method-district-lookup"
    >
      <div className="flex flex-col gap-3">
        <h2 id="district-notice" className="text-xl font-bold text-ink">
          {changedNumber ? "Your district changed" : "Your district's lines changed"}
        </h2>
        {changedNumber && (
          <p className="flex items-center gap-3 text-3xl font-extrabold tracking-tight text-ink tabular-nums">
            <span>{districtLabel(state, serving)}</span>
            <ArrowRight className="size-7 shrink-0 text-ink-3-graphic" aria-hidden />
            <span className="sr-only">to</span>
            <span>{districtLabel(state, next)}</span>
          </p>
        )}
        <p className="text-base text-ink-2">
          {changedNumber
            ? `You live in ${districtLabel(state, serving)} today. ${stateName} drew new district lines for 2026, so on your November ballot you vote in ${districtLabel(state, next)}. The member who represents you now may not be on your ballot.`
            : `${stateName} drew new district lines for 2026. You are still in ${districtLabel(state, next)}, but its borders moved.`}
        </p>
      </div>
      <DistrictOutlines state={state} from={serving} to={next} />
    </section>
  );
}
