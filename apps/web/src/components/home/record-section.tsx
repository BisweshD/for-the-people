import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { formatDateLong, formatInteger } from "@/lib/format";
import {
  TALLY_COLUMNS,
  tallyRows,
  type Chamber,
  type ChamberTally,
  type RollCallTallyView,
} from "@/lib/roll-call-tally";
import type { CardView } from "@/lib/views";
import type { CountReceipts } from "@/server/trust";

/** One square's pitch in the figure's own units: an 8-unit square and a 2-unit gap. */
const PITCH = 10;
const CHAMBERS: Array<{ id: Chamber; name: string }> = [
  { id: "house", name: "House" },
  { id: "senate", name: "Senate" },
];

/** A number in running text, carrying its Receipt; without one it says so instead. */
function Fact({
  fact,
  receipt,
  children,
}: {
  fact: string;
  receipt: string | null;
  children: React.ReactNode;
}) {
  if (!receipt) return <span className="text-ink-3">no record yet</span>;
  return (
    <strong
      className="font-bold whitespace-nowrap text-ink tabular-nums"
      data-fact={fact}
      data-receipt-id={receipt}
    >
      {children}
    </strong>
  );
}

/**
 * Every roll call in one chamber as a small square, oldest first, 50 to a row, like the House vote
 * board; the roll calls behind a key vote are solid ink. The grey squares are one SVG pattern, so a
 * thousand roll calls cost a few elements.
 */
function ChamberGrid({ id, name, tally }: { id: Chamber; name: string; tally: ChamberTally }) {
  const { rows, full, remainder } = tallyRows(tally.total);
  const width = TALLY_COLUMNS * PITCH;
  const height = rows * PITCH;
  const pattern = `tally-${id}`;
  return (
    <div className="flex flex-col gap-2">
      <p className="flex items-baseline justify-between gap-4 text-sm tabular-nums">
        <span className="font-bold text-ink">{name}</span>
        <span className="text-ink-2">
          {tally.receiptId ? (
            <span data-fact={`${id}-roll-calls`} data-receipt-id={tally.receiptId}>
              {formatInteger(tally.total)} roll calls
            </span>
          ) : (
            "No record yet"
          )}
          {tally.marks.length > 0 && (
            <>
              , <span className="font-semibold text-ink">{tally.marks.length}</span> behind key
              votes
            </>
          )}
        </span>
      </p>
      {tally.total > 0 && (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          className="block h-auto w-full"
          aria-hidden
        >
          <defs>
            <pattern id={pattern} width={PITCH} height={PITCH} patternUnits="userSpaceOnUse">
              <rect x={1} y={1} width={8} height={8} rx={1.5} className="fill-hairline" />
            </pattern>
          </defs>
          {full > 0 && <rect width={width} height={full * PITCH} fill={`url(#${pattern})`} />}
          {remainder > 0 && (
            <rect
              y={full * PITCH}
              width={remainder * PITCH}
              height={PITCH}
              fill={`url(#${pattern})`}
            />
          )}
          {tally.marks.map((index) => (
            <rect
              key={index}
              x={(index % TALLY_COLUMNS) * PITCH + 1}
              y={Math.floor(index / TALLY_COLUMNS) * PITCH + 1}
              width={8}
              height={8}
              rx={1.5}
              className="fill-ink"
            />
          ))}
        </svg>
      )}
    </div>
  );
}

/** The key-vote roll calls as a table: the figure's "View as table". */
function KeyVoteTable({ cards }: { cards: CardView[] }) {
  const rows = [
    ...new Map(
      cards.flatMap((card) =>
        card.rollCalls.map((rollCall) => [rollCall.id, { rollCall, title: card.card.title }]),
      ),
    ).values(),
  ].sort(
    (a, b) =>
      a.rollCall.chamber.localeCompare(b.rollCall.chamber) ||
      a.rollCall.date.localeCompare(b.rollCall.date) ||
      a.rollCall.number - b.rollCall.number,
  );
  return (
    <details className="group border-t border-hairline pt-1">
      <summary className="-ml-2 inline-flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-control px-2 text-sm font-semibold text-ink hover:bg-accent [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 text-ink-2 transition-transform duration-[120ms] group-open:rotate-90 motion-reduce:transition-none"
          aria-hidden
        />
        View the key-vote roll calls as a table
      </summary>
      <div className="mt-2 max-h-[420px] overflow-auto">
        <table className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">
            The roll calls behind the key votes, by chamber and date
          </caption>
          <thead className="sticky top-0 bg-paper">
            <tr className="border-b border-hairline text-ink-2">
              <th scope="col" className="py-2 pr-3 font-semibold">
                Roll call
              </th>
              <th scope="col" className="py-2 pr-3 font-semibold">
                Date
              </th>
              <th scope="col" className="py-2 font-semibold">
                Key vote
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ rollCall, title }) => (
              <tr key={rollCall.id} className="border-b border-hairline last:border-0">
                <th scope="row" className="py-2 pr-3 align-top font-semibold whitespace-nowrap">
                  <Link
                    href={`/votes/${rollCall.id}`}
                    className="text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink"
                    data-fact="key-vote-roll-call"
                    data-receipt-id={rollCall.receipt.sourceId}
                  >
                    {rollCall.chamber === "house" ? "House" : "Senate"} {rollCall.number}
                  </Link>
                </th>
                <td className="py-2 pr-3 align-top whitespace-nowrap text-ink-2 tabular-nums">
                  {formatDateLong(rollCall.date)}
                </td>
                <td className="py-2 align-top text-ink-2">{title}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

/**
 * "What is behind every answer" on Home: the counts said in one paragraph, each carrying its Receipt,
 * beside every roll call of this Congress drawn as a square, with the key votes' roll calls in ink.
 */
export function RecordSection({
  counts,
  receipts,
  tally,
  cards,
}: {
  counts: Record<string, number>;
  receipts: CountReceipts;
  tally: RollCallTallyView;
  cards: CardView[];
}) {
  const { house, senate } = tally.chambers;
  const firsts = [house.first, senate.first].filter((day): day is string => day !== null).sort();
  const lasts = [house.last, senate.last].filter((day): day is string => day !== null).sort();
  const marked = house.marks.length + senate.marks.length;
  const keyVotes = counts.publishedKeyVotes ?? 0;
  return (
    <section
      aria-labelledby="record-heading"
      className="mx-auto grid w-full max-w-[640px] gap-8 border-t border-hairline pt-10 lg:max-w-none lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14"
    >
      <div className="flex flex-col gap-5">
        <h2 id="record-heading" className="text-2xl font-bold text-ink">
          What is behind every answer
        </h2>
        <p className="text-xl leading-[1.55] text-pretty text-ink-2">
          Each recorded vote in Congress is called a roll call. We have read{" "}
          <Fact fact="roll-call-count" receipt={receipts.rollCalls}>
            {formatInteger(counts.rollCalls ?? 0)} roll calls
          </Fact>{" "}
          from this Congress, straight from the House Clerk and the Senate. They hold{" "}
          <Fact fact="member-vote-count" receipt={receipts.rollCalls}>
            {formatInteger(counts.votePositions ?? 0)} votes by members
          </Fact>
          , on{" "}
          <Fact fact="measure-count" receipt={receipts.measures}>
            {formatInteger(counts.measures ?? 0)} bills and resolutions
          </Fact>{" "}
          and other questions. The{" "}
          <Fact fact="key-vote-count" receipt={receipts.keyVotes}>
            {formatInteger(keyVotes)} key votes
          </Fact>{" "}
          you answer come from these, and each is checked against the official record.
        </p>
        <p className="text-base text-ink-2">
          <Link href="/methodology" className="font-semibold text-ink underline underline-offset-4">
            How we check
          </Link>{" "}
          or{" "}
          <Link href="/sources" className="font-semibold text-ink underline underline-offset-4">
            see every source
          </Link>
          .
        </p>
      </div>

      <figure className="flex flex-col gap-5 rounded-card border border-hairline bg-paper p-4 sm:p-6">
        <figcaption className="flex flex-col gap-1.5">
          <span className="text-base font-bold text-ink">Every roll call, oldest first</span>
          <span className="text-sm text-ink-2 tabular-nums">
            {firsts[0] && lasts.at(-1)
              ? `${formatDateLong(firsts[0])} to ${formatDateLong(lasts.at(-1)!)}, 50 to a row.`
              : "50 to a row."}
          </span>
          <span className="flex items-center gap-2 text-sm text-ink-2 tabular-nums">
            <span className="size-2.5 shrink-0 rounded-[2px] bg-ink" aria-hidden />
            Solid: the {marked} roll calls behind the key votes.
          </span>
        </figcaption>
        {CHAMBERS.map((chamber) => (
          <ChamberGrid
            key={chamber.id}
            id={chamber.id}
            name={chamber.name}
            tally={tally.chambers[chamber.id]}
          />
        ))}
        <KeyVoteTable cards={cards} />
      </figure>
    </section>
  );
}
