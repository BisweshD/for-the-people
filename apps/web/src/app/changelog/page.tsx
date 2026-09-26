import type { ChangelogEntry } from "@for-the-people/data/read/trust";
import {
  Archive,
  BadgeCheck,
  ChevronRight,
  Database,
  FilePlus,
  PencilLine,
  ShieldCheck,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ChangelogView, DayUpdates, type ChangelogDay } from "@/components/trust/changelog-view";
import { PageHeader } from "@/components/trust/page-header";
import { runRows } from "@/lib/changelog-runs";
import { formatDateLong } from "@/lib/format";
import { cn } from "@/lib/utils";
import { getDeckCards } from "@/server/data";
import { getChangelog } from "@/server/trust";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Every change to the key votes and every data update, newest first, from For The People's own action log.",
};

/** Groups shown before "Show older changes". */
const FIRST_PAGE = 30;

const TIME = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});
const TIME_SHORT = new Intl.DateTimeFormat("en-US", {
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});
const dayPeriod = (date: Date) =>
  TIME_SHORT.formatToParts(date).find((part) => part.type === "dayPeriod")?.value;
/** "8:43" when the span's end carries the same "PM EDT"; the full time when it does not. */
const spanStart = (start: string, end: string) => {
  const from = new Date(start);
  return dayPeriod(from) === dayPeriod(new Date(end))
    ? TIME_SHORT.format(from).replace(/\s?[AP]M$/, "")
    : TIME.format(from);
};
const MINUTE_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});
const DAY_KEY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" });
const MONTH = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const SHORT_DAY = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

type Step = "proposed" | "updated" | "checked" | "reviewed" | "published" | "retired" | "changed";

const STEPS: Record<Step, { word: string; count: string; icon: LucideIcon; order: number }> = {
  proposed: { word: "proposed", count: "new", icon: FilePlus, order: 1 },
  updated: { word: "reworded", count: "reworded", icon: PencilLine, order: 2 },
  checked: {
    word: "checked against the record",
    count: "checked against the record",
    icon: ShieldCheck,
    order: 3,
  },
  reviewed: { word: "reviewed", count: "reviewed", icon: UsersRound, order: 4 },
  published: { word: "published", count: "published", icon: BadgeCheck, order: 5 },
  retired: { word: "retired", count: "retired", icon: Archive, order: 6 },
  changed: { word: "changed", count: "changed", icon: PencilLine, order: 7 },
};

/** Which curation step a key-vote sentence records, read from how the log words it. */
function stepOf(sentence: string): Step {
  if (sentence.startsWith("Proposed")) return "proposed";
  if (sentence.startsWith("Updated")) return "updated";
  if (sentence.startsWith("Checked")) return "checked";
  if (/^(Two |Recorded reviews)/.test(sentence)) return "reviewed";
  if (sentence.startsWith("Published")) return "published";
  if (sentence.startsWith("Retired")) return "retired";
  return "changed";
}

const listWords = (words: string[]): string =>
  words.length <= 2 ? words.join(" and ") : `${words.slice(0, -1).join(", ")}, and ${words.at(-1)}`;

interface KeyVoteGroup {
  kind: "keyVote";
  id: string;
  title: string;
  at: string;
  entries: ChangelogEntry[];
}

type Group =
  | KeyVoteGroup
  | { kind: "batch"; id: string; at: string; groups: KeyVoteGroup[] }
  /**
   * A day's data updates, as one row that opens to each: every update is its runs within
   * RUN_WINDOW_MINUTES of each other, newest first.
   */
  | { kind: "updates"; id: string; at: string; rows: ChangelogEntry[][] };

/** A key vote's steps that day, oldest first, and the words that sum them up. */
function story(group: KeyVoteGroup) {
  const steps = [...group.entries].reverse();
  const kinds = [...new Set(steps.map((entry) => stepOf(entry.sentence)))].sort(
    (a, b) => STEPS[a].order - STEPS[b].order,
  );
  return {
    steps,
    kinds,
    latest: kinds.at(-1) ?? ("changed" as Step),
    words: listWords(kinds.map((kind) => STEPS[kind].word)),
    receipt: steps.flatMap((entry) => entry.sourceIds)[0],
  };
}

/** Key votes that reached the same last step in the same minute share one row. */
const BATCH_MIN = 2;

/**
 * Merges every key vote whose last step and minute match into one row, wherever it sits in the day,
 * so "20 key votes published at 1:11 AM" reads once instead of as several same-minute rows.
 */
function batch(groups: Group[]): Group[] {
  const signature = (group: KeyVoteGroup) =>
    `${story(group).latest}|${MINUTE_KEY.format(new Date(group.at))}`;
  const runs = new Map<string, KeyVoteGroup[]>();
  for (const group of groups) {
    if (group.kind !== "keyVote") continue;
    const key = signature(group);
    runs.set(key, [...(runs.get(key) ?? []), group]);
  }
  const out: Group[] = [];
  const placed = new Set<string>();
  for (const group of groups) {
    if (group.kind !== "keyVote") {
      out.push(group);
      continue;
    }
    const key = signature(group);
    const run = runs.get(key)!;
    if (run.length < BATCH_MIN) out.push(group);
    else if (!placed.has(key)) {
      placed.add(key);
      out.push({ kind: "batch", id: `batch-${group.id}`, at: group.at, groups: run });
    }
  }
  return out;
}

/** What a merged row's key votes went through before their last step, said once for all of them. */
function batchLine(groups: KeyVoteGroup[]): string {
  const stories = groups.map(story);
  const latest = stories[0]!.latest;
  const earlier = new Map<Step, number>();
  for (const { kinds } of stories)
    for (const kind of kinds) if (kind !== latest) earlier.set(kind, (earlier.get(kind) ?? 0) + 1);
  const ordered = [...earlier].sort(([a], [b]) => STEPS[a].order - STEPS[b].order);
  const common = ordered.filter(([, count]) => count === groups.length).map(([kind]) => kind);
  const some = ordered.filter(([, count]) => count < groups.length);
  const parts: string[] = [];
  if (some.length > 0)
    parts.push(
      `${listWords(some.map(([kind, count]) => `${count} ${STEPS[kind].count}`))}.`.replace(
        /^./,
        (letter) => letter.toUpperCase(),
      ),
    );
  if (common.length > 0)
    parts.push(`Each was ${listWords(common.map((kind) => STEPS[kind].word))} first.`);
  return parts.join(" ");
}

/**
 * One day of the log as rows: every step a key vote went through that day becomes one row, newest
 * first, and the day's data updates follow as one row that opens to each (runs of one update within
 * RUN_WINDOW_MINUTES of each other share an update). Key-vote changes lead because they change what
 * voters see; data updates keep the record current.
 */
function groupDay(entries: ChangelogEntry[], titles: Map<string, string>): Group[] {
  const groups: Group[] = [];
  const updates: ChangelogEntry[][] = [];
  const byKeyVote = new Map<string, Extract<Group, { kind: "keyVote" }>>();
  for (const row of runRows(entries)) {
    const entry = row[0]!;
    if (entry.kind === "keyVote" && entry.keyVoteId) {
      const existing = byKeyVote.get(entry.keyVoteId);
      if (existing) existing.entries.push(entry);
      else {
        const quoted = /“([^”]+)”/.exec(entry.sentence)?.[1];
        const group = {
          kind: "keyVote" as const,
          id: `${entry.keyVoteId}-${entry.id}`,
          title: titles.get(entry.keyVoteId) ?? quoted ?? "A key vote",
          at: entry.at,
          entries: [entry],
        };
        byKeyVote.set(entry.keyVoteId, group);
        groups.push(group);
      }
    } else updates.push(row);
  }
  const newest = updates[0]?.[0];
  return newest
    ? [...groups, { kind: "updates", id: `updates-${newest.id}`, at: newest.at, rows: updates }]
    : groups;
}

/** Runs that re-checked nothing say nothing; the log keeps them, the page leaves them out. */
const isEmptyRun = (entry: ChangelogEntry) =>
  entry.kind === "ingestion" && /no key vote needed re-checking/.test(entry.sentence);

const keyVoteCount = (group: Group) =>
  group.kind === "batch" ? group.groups.length : group.kind === "keyVote" ? 1 : 0;

const updateCount = (group: Group) => (group.kind === "updates" ? group.rows.length : 0);

export default async function ChangelogPage() {
  const [entries, cards] = await Promise.all([getChangelog(), getDeckCards()]);
  const titles = new Map(cards.map((card) => [card.id, card.card.title]));
  const days = new Map<string, ChangelogEntry[]>();
  for (const entry of entries.filter((entry) => !isEmptyRun(entry))) {
    const key = DAY_KEY.format(new Date(entry.at));
    days.set(key, [...(days.get(key) ?? []), entry]);
  }
  let total = 0;
  const grouped = [...days].map(([day, dayEntries]) => ({
    day,
    groups: batch(groupDay(dayEntries, titles)).map((group) => ({ group, index: total++ })),
  }));
  const rows = grouped.flatMap((day) => day.groups.map(({ group }) => group));
  const counts = {
    keyVote: rows.reduce((sum, group) => sum + keyVoteCount(group), 0),
    ingestion: rows.reduce((sum, group) => sum + updateCount(group), 0),
  };
  const dayIndex: ChangelogDay[] = grouped.map(({ day, groups }) => {
    const date = new Date(`${day}T12:00:00Z`);
    return {
      id: `day-${day}`,
      label: SHORT_DAY.format(date),
      month: MONTH.format(date),
      keyVote: groups.reduce((sum, { group }) => sum + keyVoteCount(group), 0),
      ingestion: groups.reduce((sum, { group }) => sum + updateCount(group), 0),
      older: groups.every(({ index: position }) => position >= FIRST_PAGE),
    };
  });

  const header = (
    <PageHeader
      title="Changelog"
      lede="Every key vote we propose, check, review, or publish, and every data update, straight from our action log. Newest first."
    >
      <p className="text-base text-ink-2">
        The rules behind each step are on the{" "}
        <Link href="/methodology" className="font-semibold text-ink underline underline-offset-4">
          methodology page
        </Link>
        . Found a problem?{" "}
        <Link href="/corrections" className="font-semibold text-ink underline underline-offset-4">
          Report a mistake
        </Link>
        .
      </p>
    </PageHeader>
  );

  return grouped.length === 0 ? (
    <div className="flex flex-col gap-10">
      {header}
      <p className="text-base text-ink-2">No changes recorded yet.</p>
    </div>
  ) : (
    <ChangelogView
      header={header}
      counts={counts}
      days={dayIndex}
      older={Math.max(0, total - FIRST_PAGE)}
    >
      <ol className="flex flex-col gap-10">
        {grouped.map(({ day, groups }) => (
          <li key={day} id={`day-${day}`} data-day className="flex scroll-mt-24 flex-col gap-2">
            <h2 className="text-base font-bold text-ink">{formatDateLong(day)}</h2>
            <ol className="relative flex flex-col before:absolute before:top-2 before:bottom-2 before:left-[15px] before:w-px before:bg-hairline">
              {groups.map(({ group, index: position }) => (
                <li
                  key={group.id}
                  data-kind={group.kind === "updates" ? "ingestion" : "keyVote"}
                  {...(position >= FIRST_PAGE ? { "data-older": "" } : {})}
                  className="relative grid grid-cols-[32px_minmax(0,1fr)] gap-x-3 py-3"
                >
                  {group.kind === "keyVote" ? (
                    <KeyVoteRow group={group} />
                  ) : group.kind === "batch" ? (
                    <BatchRow groups={group.groups} />
                  ) : (
                    <UpdatesRow rows={group.rows} />
                  )}
                </li>
              ))}
            </ol>
          </li>
        ))}
      </ol>
    </ChangelogView>
  );
}

/** The step's icon sitting on the day's rail. Publications are solid; everything else is outlined. */
function RailMark({ icon: Icon, solid }: { icon: LucideIcon; solid: boolean }) {
  return (
    <span
      className={cn(
        "relative z-10 mt-0.5 grid size-8 place-items-center rounded-full border",
        solid ? "border-ink bg-ink text-paper" : "border-hairline bg-paper text-ink-2",
      )}
      aria-hidden
    >
      <Icon className="size-4" />
    </span>
  );
}

/**
 * Each disclosure names its own group, so a key vote's steps inside an open batch stay closed (and
 * their chevron unturned) until they are opened themselves.
 */
const OPEN = {
  batch: {
    chevron: "group-open/batch:rotate-90",
    closed: "group-open/batch:hidden",
    open: "group-open/batch:inline",
  },
  steps: {
    chevron: "group-open/steps:rotate-90",
    closed: "group-open/steps:hidden",
    open: "group-open/steps:inline",
  },
} as const;

/** A disclosure's summary: a 44 px target whose 16 px chevron turns to point down when open. */
function Summary({
  closed,
  open,
  group,
}: {
  closed: string;
  open: string;
  group: keyof typeof OPEN;
}) {
  const variants = OPEN[group];
  return (
    <summary className="-ml-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-ink-2 hover:bg-accent hover:text-ink [&::-webkit-details-marker]:hidden">
      <ChevronRight
        className={cn(
          "size-4 shrink-0 transition-transform duration-[120ms] ease-out motion-reduce:transition-none",
          variants.chevron,
        )}
        aria-hidden
      />
      <span className={variants.closed}>{closed}</span>
      <span className={cn("hidden", variants.open)}>{open}</span>
    </summary>
  );
}

function KeyVoteRow({ group }: { group: KeyVoteGroup }) {
  const { latest } = story(group);
  return (
    <>
      <RailMark icon={STEPS[latest].icon} solid={latest === "published"} />
      <KeyVoteDetail group={group} />
    </>
  );
}

/** Key votes that reached the same step in the same minute: one row, opened for each. */
function BatchRow({ groups }: { groups: KeyVoteGroup[] }) {
  const { latest } = story(groups[0]!);
  const at = groups[0]!.at;
  const line = batchLine(groups);
  return (
    <>
      <RailMark icon={STEPS[latest].icon} solid={latest === "published"} />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-base leading-snug font-semibold text-ink tabular-nums">
          {groups.length} key votes {STEPS[latest].word}
        </p>
        <p className="text-sm text-ink-2 tabular-nums">
          {line ? `${line} ` : ""}
          <time dateTime={at} className="text-ink-2">
            At {TIME.format(new Date(at))}
          </time>
        </p>
        <details className="group/batch">
          <Summary
            closed={`Show the ${groups.length} key votes`}
            open="Hide the key votes"
            group="batch"
          />
          <ul className="mt-1 flex flex-col gap-4 border-l border-hairline pl-4">
            {groups.map((group) => (
              <li key={group.id}>
                <KeyVoteDetail group={group} />
              </li>
            ))}
          </ul>
        </details>
      </div>
    </>
  );
}

function KeyVoteDetail({ group }: { group: KeyVoteGroup }) {
  const { steps, words, receipt } = story(group);
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <p className="text-base leading-snug font-semibold text-ink">{group.title}</p>
      <p
        className="text-sm text-ink-2 tabular-nums"
        {...(receipt ? { "data-fact": "changelog-check", "data-receipt-id": receipt } : {})}
      >
        Key vote {words}.{" "}
        <time dateTime={group.at} className="text-ink-2">
          Last step at {TIME.format(new Date(group.at))}
        </time>
      </p>
      {steps.length > 1 ? (
        <details className="group/steps">
          <Summary closed={`Show all ${steps.length} steps`} open="Hide the steps" group="steps" />
          <ol className="mt-1 flex flex-col gap-2 border-l border-hairline pl-4">
            {steps.map((entry) => (
              <li key={entry.id} className="flex flex-col text-sm">
                <span className="text-ink">{entry.sentence}</span>
                <time dateTime={entry.at} className="text-ink-2 tabular-nums">
                  {TIME.format(new Date(entry.at))}
                </time>
              </li>
            ))}
          </ol>
        </details>
      ) : (
        <p className="text-sm text-ink-2">{steps[0]?.sentence}</p>
      )}
    </div>
  );
}

const TIMES = ["once", "twice"];
const times = (n: number) => TIMES[n - 1] ?? `${n} times`;

/** What each data update's job keeps current, in the words the day's summary row lists them with. */
const JOB_WORDS: Record<string, string> = {
  votes: "roll calls",
  stats: "votes with party and missed votes",
  legislators: "member details",
  portraits: "portraits",
  keyvotes: "key-vote checks",
  fec: "2026 races and candidate filings",
  "fec-aggregates": "campaign money",
};

/**
 * A day's data updates as one row: how many, and what they kept current. It opens to each update; the
 * "Data updates" filter shows them open (globals.css).
 */
function UpdatesRow({ rows }: { rows: ChangelogEntry[][] }) {
  const newest = rows[0]![0]!;
  const what = [
    ...new Set(rows.map((row) => JOB_WORDS[row[0]!.job ?? ""] ?? "other official data")),
  ];
  const summary = listWords(what).replace(/^./, (letter) => letter.toUpperCase());
  // A lone update needs no fold.
  if (rows.length === 1)
    return (
      <>
        <RailMark icon={Database} solid={false} />
        <div data-run className="flex min-w-0 flex-col gap-1">
          <UpdateDetail entries={rows[0]!} />
        </div>
      </>
    );
  return (
    <>
      <RailMark icon={Database} solid={false} />
      <DayUpdates
        title={`${rows.length} data ${rows.length === 1 ? "update" : "updates"}`}
        detail={
          <>
            {summary}.{" "}
            <time dateTime={newest.at}>Latest at {TIME.format(new Date(newest.at))}</time>
          </>
        }
        count={rows.length}
      >
        {rows.map((entries) => (
          <li key={entries[0]!.id} data-run className="flex flex-col gap-1">
            <UpdateDetail entries={entries} />
          </li>
        ))}
      </DayUpdates>
    </>
  );
}

/**
 * One data update. Runs a few minutes apart share it: it leads with what the latest run found and opens
 * to each run, with its time, whether the runs found the same thing or not.
 */
function UpdateDetail({ entries }: { entries: ChangelogEntry[] }) {
  const latest = entries[0]!;
  const earliest = entries.at(-1)!;
  const same = entries.every((entry) => entry.sentence === latest.sentence);
  return (
    <>
      <p className="text-base leading-snug text-ink">{latest.sentence}</p>
      {entries.length === 1 ? (
        <p className="text-sm text-ink-2 tabular-nums">
          Data update at <time dateTime={latest.at}>{TIME.format(new Date(latest.at))}</time>
        </p>
      ) : (
        <p className="text-sm text-ink-2 tabular-nums">
          Ran {times(entries.length)} between{" "}
          <time dateTime={earliest.at}>{spanStart(earliest.at, latest.at)}</time> and{" "}
          <time dateTime={latest.at}>{TIME.format(new Date(latest.at))}</time>
          {same ? ", with the same result each time" : "; the latest run is shown"}
        </p>
      )}
      {entries.length > 1 && (
        <details className="group/steps">
          <Summary closed={`Show all ${entries.length} runs`} open="Hide the runs" group="steps" />
          <ol className="mt-1 flex flex-col gap-2 border-l border-hairline pl-4">
            {entries.map((entry) => (
              <li key={entry.id} className="flex flex-col text-sm">
                <span className="text-ink">{entry.sentence}</span>
                <time dateTime={entry.at} className="text-ink-2 tabular-nums">
                  {TIME.format(new Date(entry.at))}
                </time>
              </li>
            ))}
          </ol>
        </details>
      )}
    </>
  );
}
