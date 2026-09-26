"use client";

import type { StateElectionInfo } from "@for-the-people/core/calendar";
import { ExternalLink } from "lucide-react";
import { ChooseStateLink } from "@/components/election/election-actions";
import { useChosenState } from "@/components/election/election-card";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import { cn } from "@/lib/utils";

/**
 * Registration deadlines and official links for one state, picked with ?state= (or the voter's saved
 * state). Deadlines keep vote.gov's wording. Early voting is not on vote.gov, so it always points to the
 * state's election office.
 */

const CHANNELS = [
  { key: "online", label: "Online" },
  { key: "mail", label: "By mail" },
  { key: "inPerson", label: "In person" },
] as const;

/** The chosen state's card; the state itself is picked in the countdown card at the top of the page. */
export function StateKeyDates() {
  const { entry } = useChosenState();
  return entry ? <StateCard entry={entry} /> : <NoStateYet />;
}

/** Before a state is chosen: what will show here, and the way back to the picker. */
export function NoStateYet() {
  return (
    <div className="flex flex-col items-start gap-3 rounded-card border border-dashed border-input p-5 md:p-7">
      <p className="text-base text-ink-2">
        Choose your state to see all of its registration deadlines and official links here.
      </p>
      <ChooseStateLink />
    </div>
  );
}

function StateCard({ entry }: { entry: StateElectionInfo }) {
  const receipt = entry.source.id;
  return (
    <article
      aria-labelledby={`state-${entry.state}`}
      className="flex flex-col gap-6 rounded-card border border-hairline bg-paper p-5 md:p-7"
    >
      <h3 id={`state-${entry.state}`} className="text-2xl font-bold text-ink">
        {entry.name}
      </h3>

      {entry.registrationRequired ? (
        <section aria-labelledby={`deadlines-${entry.state}`} className="flex flex-col gap-3">
          <h4 id={`deadlines-${entry.state}`} className="text-base font-semibold text-ink-2">
            Registration deadlines
          </h4>
          <dl className="flex flex-col border-t border-hairline">
            {CHANNELS.map((channel) => {
              const value = entry.deadlines[channel.key];
              const offered = channel.key !== "online" || entry.onlineRegistrationOffered;
              return (
                <div
                  key={channel.key}
                  className="grid gap-x-6 gap-y-0.5 border-b border-hairline py-3 sm:grid-cols-[8rem_minmax(0,1fr)]"
                  data-fact="registration-deadline"
                  data-receipt-id={receipt}
                >
                  <dt className="text-sm font-semibold text-ink-2 sm:text-base">{channel.label}</dt>
                  <dd className={cn("text-base", value ? "font-bold text-ink" : "text-ink-2")}>
                    {value ?? (offered ? "Check your state's election office" : "Not offered")}
                  </dd>
                </div>
              );
            })}
          </dl>
        </section>
      ) : (
        <p
          className="text-base font-semibold text-ink"
          data-fact="registration-deadline"
          data-receipt-id={receipt}
        >
          {entry.name} does not require voter registration.
        </p>
      )}

      <section aria-labelledby={`early-${entry.state}`} className="flex flex-col gap-2">
        <h4 id={`early-${entry.state}`} className="text-base font-semibold text-ink-2">
          Early voting
        </h4>
        <p className="text-base text-ink">
          Check your state&apos;s election office. Early voting dates are not on vote.gov, and we
          only list dates we can confirm from an official page.
        </p>
      </section>

      {/* All outlined: the page's one ink button is "Check your registration" in the card at the top. */}
      <ul className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
        {entry.links.checkRegistration && (
          <OfficialLink href={entry.links.checkRegistration}>Check your registration</OfficialLink>
        )}
        {entry.links.registerOnline && (
          <OfficialLink href={entry.links.registerOnline}>Register online</OfficialLink>
        )}
        <OfficialLink href={entry.links.electionOffice}>{entry.name} election office</OfficialLink>
      </ul>

      <p className="text-sm text-ink-2">
        From{" "}
        <a
          href={entry.source.url}
          target="_blank"
          rel="noopener noreferrer"
          className="font-semibold text-ink underline underline-offset-4"
        >
          vote.gov&apos;s page for {entry.name}
        </a>
        {entry.pageUpdated ? `, last updated there ${formatDate(entry.pageUpdated)}` : ""}. Read on{" "}
        {formatEasternDate(entry.source.retrievedAt)}. Polling places are listed by your state or
        local election office.
      </p>
    </article>
  );
}

function OfficialLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Button asChild variant="outline" size="lg" className="w-full sm:w-auto">
        <a href={href} target="_blank" rel="noopener noreferrer">
          {children}
          <ExternalLink aria-hidden />
          <span className="sr-only">(opens an official site in a new tab)</span>
        </a>
      </Button>
    </li>
  );
}
