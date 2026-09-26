import { RUN_HISTORY, type StatusReport } from "@for-the-people/data/read";
import { toIso } from "@for-the-people/data/read/trust";
import {
  ChevronRight,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CircleX,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/trust/page-header";
import { SectionNav } from "@/components/trust/section-nav";
import { TrustLayout } from "@/components/trust/trust-layout";
import { formatInteger } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getMemberIndex, getStatus } from "@/server/data";
import { getCountReceipts } from "@/server/trust";

export const metadata: Metadata = {
  title: "Data status",
  description:
    "When each For The People data update last ran, what it found, and how much data we hold.",
};

const JOBS: Record<string, { name: string; about: string }> = {
  legislators: {
    name: "Members of Congress",
    about: "Members, terms, and IDs from the congress-legislators data.",
  },
  votes: {
    name: "House and Senate roll calls",
    about:
      "Every roll call and member vote from the House Clerk and the Senate, except attendance calls (quorum calls) and the Speaker election, which are skipped.",
  },
  stats: {
    name: "Votes with party and missed votes",
    about: "Recounted from every roll call after each votes update.",
  },
  portraits: {
    name: "Official portraits",
    about: "Public-domain portraits, converted and served from our own site.",
  },
  keyvotes: {
    name: "Key-vote checks",
    about: "Each key vote's roll calls checked against the official record.",
  },
  fec: {
    name: "2026 races and campaign money",
    about: "Races from the FEC's election dates, candidate filings, and campaign totals.",
  },
  "fec-aggregates": {
    name: "Contribution sizes and in-state giving",
    about: "The FEC's totals by contribution size and by state, for sitting members.",
  },
};

/**
 * A run's outcome in ink: the icon's shape carries it, never green or red, since those colors mean
 * agreement and difference everywhere else on For The People.
 */
const STATUS: Record<string, { label: string; icon: LucideIcon }> = {
  succeeded: { label: "Finished", icon: CircleCheck },
  partial: { label: "Finished with notes", icon: CircleAlert },
  failed: { label: "Stopped", icon: CircleX },
  running: { label: "Running", icon: CircleDashed },
};

const STAT_LABELS: Record<string, string> = {
  "people.current": "Current members",
  "people.historical": "Former members",
  "UpsertPerson.written": "People saved",
  "UpsertTerm.written": "Terms saved",
  "UpsertDistrictMap.written": "District maps saved",
  "AttachSource.written": "Receipts saved",
  "rollCalls.parsed": "Roll calls read",
  "rollCalls.skipped": "Roll calls skipped",
  "rollCalls.unmatchedMembers": "Votes by unknown members",
  "RecordRollCall.written": "Roll calls new or changed",
  "RecordRollCall.unchanged": "Roll calls unchanged",
  "RecordRollCall.rejected": "Roll calls set aside",
  "UpsertMeasure.written": "Bills saved",
  "UpsertMeasure.unchanged": "Bills unchanged",
  "memberStats.rows": "Members counted",
  "RefreshDerivedStats.written": "Recounts saved",
  "portraits.stored": "Portraits stored",
  "portraits.unchanged": "Portraits unchanged",
  "portraits.missing": "Members without an official portrait",
  "portraits.undecodable": "Portraits that could not be read",
  "ProposeKeyVote.written": "Key votes proposed or updated",
  "VerifyKeyVote.written": "Key votes checked",
  "ApproveKeyVote.written": "Key-vote reviews recorded",
  "PublishKeyVote.written": "Key votes published",
  "UpsertElection.written": "Elections saved",
  "UpsertRace.written": "Races added or updated",
  "UpsertRace.unchanged": "Races unchanged",
  "UpsertCandidacy.written": "Candidacies added or updated",
  "UpsertCandidacy.unchanged": "Candidacies unchanged",
  "UpsertFinanceCommittee.written": "Campaign committees saved",
  "UpsertFinanceSummary.written": "Campaign finance totals saved",
  "UpsertFinanceSummary.unchanged": "Campaign finance totals unchanged",
  "fec.statutoryCandidates": "Candidates who met the FEC filing threshold",
  "fecAggregates.members": "Members with contribution-size and in-state totals",
  "UpsertIssueArea.written": "Issue areas saved",
  "UpsertIssueArea.unchanged": "Issue areas unchanged",
};

const WHEN = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});
const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});
const DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});
const ZONE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  timeZoneName: "short",
});
const zone = (date: Date) =>
  ZONE.formatToParts(date).find((part) => part.type === "timeZoneName")?.value ?? "";

/** "RecordRollCall.written" becomes "Record roll call written", for any counter not in the list above. */
function statLabel(key: string): string {
  const words = key
    .replace(/\./g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** One sentence about the latest run of every update: the first thing the page says. */
function healthLine(runs: Array<{ status: string; job: string; finishedAt: string | null }>): {
  ok: boolean;
  text: string;
} {
  const failed = runs.filter((run) => run.status === "failed");
  if (failed.length > 0)
    return {
      ok: false,
      text: `${failed.map((run) => JOBS[run.job]?.name ?? statLabel(run.job)).join(" and ")} stopped before finishing. The rest of the data is from the last run that finished.`,
    };
  const times = runs
    .map((run) => run.finishedAt)
    .filter((value): value is string => value !== null)
    .map((value) => new Date(toIso(value)))
    .sort((a, b) => a.getTime() - b.getTime());
  const first = times[0];
  const last = times.at(-1);
  if (!first || !last) return { ok: false, text: "No update has finished yet." };
  const running = runs.length - times.length;
  const count = `All ${runs.length} updates`;
  const span =
    DAY.format(first) === DAY.format(last)
      ? `between ${TIME.format(first)} and ${TIME.format(last)} ${zone(last)}, ${DAY.format(last)}`
      : `between ${WHEN.format(first)} and ${WHEN.format(last)}`;
  return running > 0
    ? {
        ok: true,
        text: `${times.length} of ${runs.length} updates finished ${span}; ${running} running now.`,
      }
    : { ok: true, text: `${count} finished ${span}.` };
}

/**
 * How each past run is drawn: a small ink square whose fill carries the status (solid, half, hollow
 * and grey, dashed). Squares, because ovals mean answers and agreement; ink, because green and red
 * mean agree and split.
 */
const MARK: Record<string, { label: string; className: string; half?: boolean }> = {
  succeeded: { label: "finished", className: "border-ink bg-ink" },
  partial: { label: "finished with notes", className: "border-ink", half: true },
  failed: { label: "stopped", className: "border-ink-3-graphic" },
  running: { label: "running", className: "border-dashed border-ink-2" },
};

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * The last RUN_HISTORY runs of one update, oldest on the left, so a stale or failing source shows at a
 * glance. Each mark is a list item with its time and outcome for screen readers; empty slots before
 * the first run are drawn short and skipped by screen readers.
 */
function FreshnessStrip({ runs }: { runs: StatusReport["history"][string] }) {
  if (runs.length === 0) return null;
  const oldestFirst = runs.toReversed();
  const empty = RUN_HISTORY - oldestFirst.length;
  const tally = (status: string) => runs.filter((run) => run.status === status).length;
  const parts = [
    `${tally("succeeded")} finished`,
    tally("partial") > 0 ? `${tally("partial")} with notes` : null,
    tally("failed") > 0 ? `${tally("failed")} stopped` : null,
    tally("running") > 0 ? `${tally("running")} running` : null,
  ].filter((part): part is string => part !== null);
  const scope =
    runs.length === RUN_HISTORY
      ? `Last ${RUN_HISTORY} runs`
      : `${count(runs.length, "run")} so far`;
  return (
    <figure className="mt-2 flex flex-col gap-2">
      <ol className="flex h-4 items-end gap-1" aria-label={`${scope}, oldest first`}>
        {Array.from({ length: empty }, (_, index) => (
          <li key={`empty-${index}`} aria-hidden className="h-1 w-2 rounded-[1px] bg-hairline" />
        ))}
        {oldestFirst.map((run) => {
          const mark = MARK[run.status] ?? MARK.running!;
          const when = WHEN.format(new Date(toIso(run.finishedAt ?? run.startedAt)));
          return (
            <li
              key={run.startedAt}
              title={`${when}: ${mark.label}`}
              className={cn(
                "relative h-4 w-2 overflow-hidden rounded-[1px] border-[1.5px]",
                mark.className,
              )}
            >
              {mark.half && <span className="absolute inset-x-0 bottom-0 h-1/2 bg-ink" />}
              <span className="sr-only">
                {when}: {mark.label}
              </span>
            </li>
          );
        })}
      </ol>
      <figcaption className="text-sm text-ink-3 tabular-nums">
        {scope}: {parts.join(", ")}
      </figcaption>
    </figure>
  );
}

export default async function StatusPage() {
  const [report, members, receipts] = await Promise.all([
    getStatus(),
    getMemberIndex(),
    getCountReceipts(),
  ]);
  const runs = [...report.runs].sort(
    (a, b) => Object.keys(JOBS).indexOf(a.job) - Object.keys(JOBS).indexOf(b.job),
  );
  const health = healthLine(runs);
  const HealthIcon = health.ok ? CircleCheck : CircleAlert;
  const serving = members.filter((member) => member.serving).length;
  const counts = report.counts;
  const quorum = counts.quorumCalls ?? 0;

  const figures: Array<{
    key: string;
    value: number;
    label: string;
    note: string;
    receipt: string | null;
  }> = [
    {
      key: "people",
      receipt: receipts.people,
      value: counts.people ?? 0,
      label: "People",
      note: `${formatInteger(serving)} serving now, plus candidates and former members`,
    },
    {
      key: "rollCalls",
      receipt: receipts.rollCalls,
      value: counts.rollCalls ?? 0,
      label: "Roll calls",
      // Matches "Roll calls read" below; a quorum call an earlier run stored is said, not counted.
      note:
        quorum > 0
          ? `House and Senate, 119th Congress, not counting ${count(quorum, "quorum call")} (attendance only)`
          : "House and Senate, 119th Congress",
    },
    {
      key: "votePositions",
      receipt: receipts.rollCalls,
      value: counts.votePositions ?? 0,
      label: "Individual votes",
      note: `on ${formatInteger(counts.rollCalls ?? 0)} roll calls`,
    },
    {
      key: "measures",
      receipt: receipts.measures,
      value: counts.measures ?? 0,
      label: "Bills and resolutions",
      note: "with official status and summaries",
    },
    {
      key: "publishedKeyVotes",
      receipt: receipts.keyVotes,
      value: counts.publishedKeyVotes ?? 0,
      label: "Key votes",
      note: "published, each checked and reviewed",
    },
    {
      key: "sources",
      receipt: receipts.sources,
      value: counts.sources ?? 0,
      label: "Receipts",
      note: "one for each official file we read",
    },
  ];

  const contents = [
    { id: "counts", label: "What we hold" },
    ...runs.map((run) => ({
      id: `update-${run.job}`,
      label: JOBS[run.job]?.name ?? statLabel(run.job),
    })),
  ];

  return (
    <TrustLayout
      header={
        <PageHeader
          title="Data status"
          lede="When each data update last ran, what it found, and how much we hold. Updates read official records and change nothing by hand."
        >
          <p className="mt-2 flex items-start gap-2.5 border-t border-hairline pt-4 text-base font-semibold text-ink tabular-nums">
            <HealthIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
            {health.text}
          </p>
        </PageHeader>
      }
      rail={<SectionNav items={contents} />}
      railClassName="max-xl:hidden"
    >
      <div className="flex flex-col gap-14">
        <section aria-labelledby="counts" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="counts" className="scroll-mt-24 text-2xl font-bold text-ink">
              What we hold
            </h2>
            <p className="text-base text-ink-2">
              Everything For The People holds, counted after each update.
            </p>
          </div>
          {/* A ledger: each count on its own ruled line, a dotted leader running to the number. */}
          <dl className="flex flex-col border-t border-ink">
            {figures.map((figure) => (
              <div
                key={figure.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-b border-hairline py-3.5"
              >
                <dt className="flex min-w-0 items-baseline gap-3 text-base font-semibold text-ink after:min-w-6 after:flex-1 after:translate-y-[-0.3em] after:border-b-2 after:border-dotted after:border-ink-3-graphic after:content-['']">
                  {figure.label}
                </dt>
                {figure.receipt ? (
                  <dd
                    className="text-2xl leading-none font-extrabold tracking-tight text-ink tabular-nums md:text-[28px]"
                    data-fact={`status-${figure.key}`}
                    data-receipt-id={figure.receipt}
                  >
                    {formatInteger(figure.value)}
                  </dd>
                ) : (
                  <dd className="text-base text-ink-3">No record yet</dd>
                )}
                <dd className="col-span-2 max-w-xl text-sm text-ink-3 tabular-nums">
                  {figure.note}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="updates" className="flex flex-col gap-4">
          <h2 id="updates" className="text-2xl font-bold text-ink">
            Latest run of each update
          </h2>
          {runs.length === 0 ? (
            <p className="text-base text-ink-2">No updates have run yet.</p>
          ) : (
            <ul className="flex flex-col border-t border-ink">
              {runs.map((run) => {
                const job = JOBS[run.job] ?? { name: statLabel(run.job), about: "" };
                const state = STATUS[run.status] ?? STATUS.running!;
                const Icon = state.icon;
                // Only counters with a plain-English label are shown; internal ones stay in the log.
                const stats = Object.entries(run.stats).filter(([key]) => key in STAT_LABELS);
                const when = run.finishedAt ?? run.startedAt;
                return (
                  <li
                    key={run.job}
                    id={`update-${run.job}`}
                    className="grid scroll-mt-24 gap-x-10 gap-y-4 border-b border-hairline py-6 md:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]"
                  >
                    <div className="flex flex-col gap-1.5">
                      <h3 className="text-lg leading-snug font-bold text-ink">{job.name}</h3>
                      {job.about && <p className="text-sm text-ink-2">{job.about}</p>}
                      <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink tabular-nums">
                        <Icon className="size-4 shrink-0" aria-hidden />
                        {run.finishedAt ? state.label : "Started"}{" "}
                        <time dateTime={toIso(when)} className="font-normal text-ink-2">
                          {WHEN.format(new Date(toIso(when)))}
                        </time>
                      </p>
                      <FreshnessStrip runs={report.history[run.job] ?? []} />
                    </div>
                    {stats.length > 0 && (
                      <table className="w-full self-start text-sm tabular-nums">
                        <caption className="sr-only">What the {job.name} update found</caption>
                        <tbody>
                          {stats.map(([key, value]) => (
                            <tr key={key} className="border-b border-hairline last:border-0">
                              <th
                                scope="row"
                                className="py-1.5 pr-4 text-left font-normal text-ink-2"
                              >
                                {STAT_LABELS[key]}
                              </th>
                              <td className="py-1.5 text-right font-semibold text-ink">
                                {formatInteger(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    {run.notes.length > 0 && (
                      <details className="group md:col-span-2">
                        <summary className="-ml-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-ink hover:bg-accent [&::-webkit-details-marker]:hidden">
                          <ChevronRight
                            className="size-4 text-ink-2 transition-transform duration-[120ms] group-open:rotate-90"
                            aria-hidden
                          />
                          {run.notes.length} {run.notes.length === 1 ? "note" : "notes"} from this
                          run
                        </summary>
                        <ul className="mt-2 flex list-disc flex-col gap-1 pl-10 text-sm text-ink-2">
                          {run.notes.map((note) => (
                            <li key={note}>{note}</li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <p className="text-base text-ink-2">
          A plain-language history of changes is on the{" "}
          <Link href="/changelog" className="font-semibold text-ink underline underline-offset-4">
            changelog
          </Link>
          .
        </p>
      </div>
    </TrustLayout>
  );
}
