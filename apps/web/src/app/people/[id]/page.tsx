import { PARTY_NAMES, personIdFromSlug, personIdToSlug, type Position } from "@for-the-people/core";
import { FINANCE_CYCLE } from "@for-the-people/data/read/ballot";
import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PartyTag } from "@/components/party-tag";
import { Button } from "@/components/ui/button";
import { Portrait } from "@/components/portrait";
import { MemberKeyVotes, YourMatchCard } from "@/components/profile/member-key-votes";
import { rangeLine } from "@/lib/chamber-range";
import { formatDate, formatShare, measureLabel, officeLine } from "@/lib/format";
import { positionsFor } from "@/lib/matching";
import { moneyPeriod } from "@/lib/money";
import { measureOutcome } from "@/lib/outcomes";
import { groupSponsored } from "@/lib/sponsored";
import { formatEasternDate } from "@/lib/time";
import { appointedUntilSpecial, missedVotesRule, SPEAKER } from "@/lib/voting-record";
import { MoneySection } from "@/components/money/money-section";
import { getDeckCards, getKeyVoteRecord, getMemberIndex, getPersonProfile } from "@/server/data";
import { getMoney } from "@/server/money";
import { getChamberContext } from "@/server/chamber-context";

export async function generateStaticParams() {
  const members = await getMemberIndex();
  return members
    .filter((member) => member.serving)
    .map((member) => ({ id: personIdToSlug(member.id) }));
}

export async function generateMetadata({ params }: PageProps<"/people/[id]">): Promise<Metadata> {
  const id = personIdFromSlug((await params).id);
  const profile = id ? await getPersonProfile(id) : null;
  if (!profile) return { title: "Member not found" };
  return {
    title: profile.person.names.full,
    description: `How ${profile.person.names.full} voted on the key votes in Congress in 2025 and 2026, with the official record behind every vote.`,
  };
}

export default async function PersonPage({ params }: PageProps<"/people/[id]">) {
  const id = personIdFromSlug((await params).id);
  if (!id) notFound();
  const [profile, cards, record, members, money, chambers] = await Promise.all([
    getPersonProfile(id),
    getDeckCards(),
    getKeyVoteRecord(),
    getMemberIndex(),
    getMoney(id),
    getChamberContext(),
  ]);
  if (!profile) notFound();
  const member = members.find((candidate) => candidate.id === id);
  const { person, stats, sponsored } = profile;
  const latestTerm = profile.terms[0];
  const positions = Object.fromEntries(positionsFor(record, id)) as Record<string, Position>;
  const name = person.names.full;
  const unity = stats ? formatShare(stats.partyUnityVotes, stats.partyUnityEligible) : null;
  const missed = stats ? formatShare(stats.missedVotes, stats.eligibleVotes) : null;
  const lastName = name.split(" ").at(-1) ?? name;
  const party = latestTerm?.party;
  const caucus = latestTerm?.caucus;
  // Short enough to sit on one line beside "Missed votes"; the caucus is named in the line below the figure.
  const caucusParty = party !== "D" && party !== "R" && (caucus === "D" || caucus === "R");
  const unityLabel =
    party === "D" || party === "R" || !party
      ? "Voted with their party"
      : caucusParty
        ? `Voted with most ${PARTY_NAMES[caucus]}s`
        : "Voted with their caucus";
  const sponsoredGroups = groupSponsored(sponsored);
  const votesByMeasure = Map.groupBy(profile.sponsoredRollCalls, (rollCall) => rollCall.measureId);
  const outcomes = new Map(
    sponsored.map((measure) => [
      measure.id,
      measureOutcome(
        {
          type: measure.type,
          becameLaw: measure.status.becameLaw,
          latestAction: measure.status.latestAction,
        },
        votesByMeasure.get(measure.id) ?? [],
      ),
    ]),
  );
  const missedRule = missedVotesRule(member);
  const context = stats ? chambers[stats.chamber] : null;
  const moneyName = moneyPeriod({
    cycle: money?.summary.cycle ?? FINANCE_CYCLE,
    hasFecCandidacy: money?.hasFecCandidacy ?? false,
    lastName,
  });
  const [noteBefore, noteAfter] = moneyName.ballotLink
    ? moneyName.note.split(moneyName.ballotLink)
    : [moneyName.note, undefined];

  return (
    // One column below 1024: portrait and name, then the match card, then the record. From 1024 the
    // match card is a sticky side rail beside both.
    <div className="grid gap-y-10 lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-x-12">
      <header className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-end sm:gap-7 lg:col-start-1">
        <Portrait
          portrait={person.portrait}
          name={name}
          lastName={person.names.last}
          sizes="(min-width: 640px) 240px, 60vw"
          className="w-3/5 max-w-60 sm:w-60"
          priority
          morph={person.id}
        />
        <div className="flex flex-col gap-3">
          <h1 className="text-4xl leading-[1.05] font-extrabold tracking-tight text-ink md:text-5xl">
            {name}
          </h1>
          {member && (
            <p className="text-lg text-ink-2">
              {member.id === SPEAKER.personId && member.serving && (
                <span className="block font-bold text-ink">Speaker of the House</span>
              )}
              {member.serving ? officeLine(member) : `Former ${officeLine(member)}`}
            </p>
          )}
          {latestTerm && (
            <div className="flex flex-wrap items-center gap-2">
              <PartyTag party={latestTerm.party} full />
              <span
                className="text-sm text-ink-2"
                data-fact="term"
                data-receipt-id={latestTerm.sourceIds[0]}
              >
                {!member?.serving
                  ? `Served until ${formatDate(latestTerm.end)}`
                  : appointedUntilSpecial(latestTerm)
                    ? `Appointed; serves until the winner of the ${formatDate(latestTerm.end)} special election takes office`
                    : `Current term ends ${formatDate(latestTerm.end)}`}
              </span>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <Button asChild variant="outline">
              <Link href={`/duel?a=${personIdToSlug(id)}`}>Compare votes with another member</Link>
            </Button>
            {person.links[0] && (
              <a
                href={person.links[0].url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center gap-2 rounded-control px-3 text-sm font-bold text-ink-2 can-hover:bg-badge can-hover:text-ink"
              >
                <ExternalLink className="size-4" aria-hidden />
                {person.links[0].label}
              </a>
            )}
          </div>
        </div>
      </header>

      {/* A sticky bar above the tab bar on phones (fixed, so it takes no grid row), a card below the
          name on tablets, and the side rail from 1024. */}
      <aside
        aria-label="Your match"
        className="fixed inset-x-0 bottom-[calc(57px+env(safe-area-inset-bottom))] z-30 border-t border-hairline bg-paper px-4 py-2.5 md:static md:rounded-card md:border md:p-5 lg:sticky lg:inset-x-auto lg:top-24 lg:bottom-auto lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
      >
        <YourMatchCard
          personId={id}
          name={name}
          cards={cards}
          positions={positions}
          office={member}
        />
      </aside>

      <div className="flex min-w-0 flex-col gap-10 lg:col-start-1">
        <section aria-labelledby="key-votes" className="flex flex-col gap-4">
          <div>
            <h2 id="key-votes" className="text-2xl font-bold text-ink">
              Key votes
            </h2>
            <p className="text-base text-ink-2">
              How {lastName} voted on each key vote, beside your answer.{" "}
              <Link
                href="/methodology#match"
                className="font-bold text-ink underline underline-offset-4"
              >
                How scores work
              </Link>
            </p>
          </div>
          <MemberKeyVotes personId={id} name={name} cards={cards} positions={positions} />
        </section>

        <section aria-labelledby="record" className="flex flex-col gap-4">
          <h2 id="record" className="text-2xl font-bold text-ink">
            Voting record in this Congress (2025–2026)
          </h2>
          {stats ? (
            <div className="flex flex-col gap-4">
              {/* Label, figure and note share rows across both columns, so the figures share a baseline. */}
              <dl className="grid grid-cols-2 grid-rows-[auto_auto_auto_auto] divide-x divide-hairline">
                <div
                  className="row-span-4 grid grid-rows-subgrid content-start items-end gap-y-1 pr-4 sm:pr-8"
                  data-fact="party-unity"
                  data-receipt-id="method-party-unity"
                >
                  <dt className="text-sm text-ink-2">{unityLabel}</dt>
                  <dd className="text-3xl leading-none font-extrabold tracking-tight text-ink tabular-nums sm:text-4xl">
                    {unity ?? "No record yet"}
                  </dd>
                  <dd className="self-start pt-1 text-sm text-ink-2 tabular-nums">
                    on {stats.partyUnityEligible.toLocaleString("en-US")} votes where most Democrats
                    and most Republicans voted opposite ways
                    {caucusParty && caucus
                      ? `. ${lastName} caucuses with the ${PARTY_NAMES[caucus]}s.`
                      : ""}
                  </dd>
                  {context?.unity && stats.partyUnityEligible > 0 && (
                    <dd className="self-start text-sm font-bold text-ink tabular-nums">
                      {rangeLine(stats.chamber, context.unity)}
                    </dd>
                  )}
                </div>
                <div
                  className="row-span-4 grid grid-rows-subgrid content-start items-end gap-y-1 pl-4 sm:pl-8"
                  data-fact="missed-votes"
                  data-receipt-id="method-missed-votes"
                >
                  <dt className="text-sm text-ink-2">Missed votes</dt>
                  {missedRule.kind === "share" ? (
                    <>
                      <dd className="text-3xl leading-none font-extrabold tracking-tight text-ink tabular-nums sm:text-4xl">
                        {missed ?? "No record yet"}
                      </dd>
                      <dd className="self-start pt-1 text-sm text-ink-2 tabular-nums">
                        {stats.missedVotes.toLocaleString("en-US")} of{" "}
                        {stats.eligibleVotes.toLocaleString("en-US")} votes held while in office
                      </dd>
                      {context?.missed && stats.eligibleVotes > 0 && (
                        <dd className="self-start text-sm font-bold text-ink tabular-nums">
                          {rangeLine(stats.chamber, context.missed)}
                        </dd>
                      )}
                    </>
                  ) : (
                    <>
                      <dd className="self-start text-base text-ink">{missedRule.text}</dd>
                      {missedRule.kind === "committee-of-the-whole" && (
                        <dd className="self-start pt-1 text-sm text-ink-2 tabular-nums">
                          Not voting on {stats.missedVotes.toLocaleString("en-US")} of the{" "}
                          {stats.eligibleVotes.toLocaleString("en-US")} Committee of the Whole votes
                          they were listed on
                        </dd>
                      )}
                    </>
                  )}
                </div>
              </dl>
              <p className="text-sm text-ink-2">
                Counted from the {stats.chamber === "house" ? "House" : "Senate"} recorded votes
                (roll calls) in the official record,{" "}
                {stats.firstVoteDate ? formatDate(stats.firstVoteDate) : ""} to{" "}
                {stats.lastVoteDate ? formatDate(stats.lastVoteDate) : ""}. Updated{" "}
                {formatEasternDate(stats.computedAt)}.{" "}
                {/* Inline, with its 44px target drawn by padding, so the sentence keeps even line spacing. */}
                <Link
                  href="/methodology#voting-record"
                  className="-my-3 inline-block py-3 font-bold text-ink-2 underline underline-offset-4 hover:text-ink"
                >
                  How we count
                </Link>
              </p>
            </div>
          ) : (
            <p className="rounded-card bg-paper p-5 text-base text-ink-2">No voting record yet.</p>
          )}
        </section>

        <section aria-labelledby="sponsored" className="flex flex-col gap-4">
          <h2 id="sponsored" className="text-2xl font-bold text-ink">
            Bills they sponsored that reached a vote
          </h2>
          {sponsored.length > 0 ? (
            <ul className="flex flex-col divide-y divide-hairline rounded-card bg-paper">
              {sponsoredGroups.map((group) => {
                const laws = group.items.filter((item) => item.measure.status.becameLaw).length;
                return (
                  <li key={group.key} className="flex flex-col gap-2 px-4 py-4 sm:px-5">
                    <h3
                      className="text-base font-bold text-ink"
                      title={group.officialTitle ?? undefined}
                    >
                      {group.title}
                      {group.count && (
                        <span className="font-normal whitespace-nowrap text-ink-2 tabular-nums">
                          {" "}
                          ({group.count}
                          {laws > 0 ? `, ${laws} became law` : ""})
                        </span>
                      )}
                    </h3>
                    <ul className="flex flex-col">
                      {group.items.map(({ measure, detail }) => (
                        <li key={measure.id}>
                          <Link
                            href={`/bills/${measure.id}`}
                            className="group flex min-h-11 flex-col justify-center gap-0.5 rounded-control py-1.5 sm:grid sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:items-baseline sm:gap-x-4"
                            data-fact="sponsored-measure"
                            data-receipt-id={measure.sourceIds[0]}
                          >
                            <span className="shrink-0 text-sm font-bold whitespace-nowrap text-ink underline decoration-hairline underline-offset-4 group-hover:decoration-ink">
                              {measureLabel(measure.id)}
                            </span>
                            {/* The bill number has its own column, so outcomes line up down the group. */}
                            <span className="flex min-w-0 flex-col gap-0.5">
                              {detail && <span className="text-sm text-ink">{detail}</span>}
                              <span className="text-sm text-ink-2 tabular-nums">
                                <span
                                  className={
                                    outcomes.get(measure.id)!.tone === "law" ||
                                    outcomes.get(measure.id)!.tone === "adopted"
                                      ? "font-bold text-agree"
                                      : "font-bold text-ink"
                                  }
                                >
                                  {outcomes.get(measure.id)!.label}
                                </span>
                                , latest action {formatDate(measure.status.latestActionDate)}
                              </span>
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-card bg-paper p-5 text-base text-ink-2">
              No record yet of a bill they sponsored reaching a vote in the full House or Senate.
            </p>
          )}
        </section>

        <section aria-labelledby="money" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="money" className="text-2xl font-bold text-ink">
              Money, <span className="whitespace-nowrap">{moneyName.period}</span> reporting period
            </h2>
            {money && (
              // The FEC filing behind the candidacy is the note's Receipt; without one, the FEC file we hold.
              <p
                className="max-w-[68ch] text-sm text-ink-2"
                data-fact="fec-candidacy"
                data-receipt-id={money.candidacySourceId ?? money.source.id}
              >
                {noteBefore}
                {moneyName.ballotLink && (
                  <>
                    <Link
                      href="/ballot"
                      className="font-bold text-ink underline decoration-ink-3 underline-offset-4 hover:decoration-ink"
                    >
                      {moneyName.ballotLink}
                    </Link>
                    {noteAfter}
                  </>
                )}
              </p>
            )}
          </div>
          <MoneySection money={money} name={name} />
        </section>
      </div>

      <div aria-hidden className="h-16 md:hidden" />
    </div>
  );
}
