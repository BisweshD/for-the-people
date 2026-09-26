import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/trust/page-header";
import { SectionNav } from "@/components/trust/section-nav";
import { TrustLayout } from "@/components/trust/trust-layout";
import { formatInteger, middleTruncate } from "@/lib/format";
import { formatEasternDate } from "@/lib/time";
import { getSources } from "@/server/data";
import { getElectionDates, getSourcesByPublisher } from "@/server/trust";

export const metadata: Metadata = {
  title: "Sources",
  description:
    "Every publisher For The People takes data from, what we take, and when we last fetched it, plus the sources we do not use.",
};

type Group = "votes" | "bills" | "people" | "money" | "places";

interface About {
  /** The publisher as people know it. */
  name: string;
  /** A second, quieter line when the name needs one. */
  via?: string;
  take: string;
  home: string;
  group: Group;
}

/** What we take from each publisher, keyed by the publisher name stored on every receipt. */
const ABOUT: Record<string, About> = {
  "Office of the Clerk, U.S. House of Representatives": {
    name: "Office of the Clerk, U.S. House",
    take: "Every House roll call and each member's Yea, Nay, Present, or Not Voting, from the Clerk's official vote files.",
    home: "https://clerk.house.gov/Votes",
    group: "votes",
  },
  "U.S. Senate": {
    name: "U.S. Senate",
    take: "Every Senate roll call and each senator's vote, from the Senate's official vote files.",
    home: "https://www.senate.gov/legislative/votes_new.htm",
    group: "votes",
  },
  "U.S. Government Publishing Office (GovInfo)": {
    name: "GovInfo, U.S. Government Publishing Office",
    take: "Bill titles, sponsors, status, and Congressional Research Service summaries, from the bill status files.",
    home: "https://www.govinfo.gov/bulkdata/BILLSTATUS",
    group: "bills",
  },
  "Library of Congress (Congress.gov)": {
    name: "Congress.gov, Library of Congress",
    take: "Bill details when GovInfo does not have them yet.",
    home: "https://www.congress.gov/",
    group: "bills",
  },
  "unitedstates/congress-legislators (public domain)": {
    name: "Who serves in Congress",
    via: "From the unitedstates project, public domain",
    take: "Members, their terms and parties, and the ID numbers that link House, Senate, and Federal Election Commission (FEC) records.",
    home: "https://github.com/unitedstates/congress-legislators",
    group: "people",
  },
  "unitedstates/images (public domain, from the Government Publishing Office)": {
    name: "Official member portraits, Government Publishing Office",
    via: "Through the public-domain unitedstates project",
    take: "Portraits downloaded once and served from our own site.",
    home: "https://github.com/unitedstates/images",
    group: "people",
  },
  "Federal Election Commission": {
    name: "Federal Election Commission",
    take: "Campaign finance totals for candidates. Totals only; never individual donors.",
    home: "https://www.fec.gov/data/",
    group: "money",
  },
  "U.S. Census Bureau": {
    name: "U.S. Census Bureau",
    take: "Turning an address into congressional districts, and district outlines. The address itself is never stored.",
    home: "https://geocoding.geo.census.gov/",
    group: "places",
  },
};

const GROUPS: Array<{ id: Group; label: string }> = [
  { id: "votes", label: "Votes" },
  { id: "bills", label: "Bills" },
  { id: "people", label: "People and portraits" },
  { id: "money", label: "Money" },
  { id: "places", label: "Districts and elections" },
];

const NOT_USED = [
  {
    name: "OpenSecrets API",
    why: "Shut down. We take campaign finance directly from the Federal Election Commission.",
  },
  {
    name: "ProPublica Congress API",
    why: "No longer offered. We read votes straight from the House Clerk and the Senate instead.",
  },
  {
    name: "Google Civic Information representatives lookup",
    why: "Retired by Google. We find districts from the address and official district maps instead.",
  },
];

const FETCHED = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
  timeZoneName: "short",
});

interface Row {
  key: string;
  about: About;
  receipts: number;
  receiptId: string;
  latest: { id: string; url: string; retrievedAt: string; contentHash: string } | null;
}

export default async function SourcesPage() {
  const [publishers, election] = await Promise.all([getSourcesByPublisher(), getElectionDates()]);
  const voteGovLatest = election.states
    .map((entry) => entry.source)
    .reduce((latest, source) => (source.retrievedAt > latest.retrievedAt ? source : latest));
  const latestSources = await getSources(publishers.map((publisher) => publisher.latestSourceId));
  const byId = new Map(latestSources.map((source) => [source.id, source]));

  const rows: Row[] = publishers.map((publisher) => ({
    key: publisher.publisher,
    about: ABOUT[publisher.publisher] ?? {
      name: publisher.publisher,
      take: "Official records used as receipts.",
      home: "",
      group: "places",
    },
    receipts: publisher.sources,
    receiptId: publisher.latestSourceId,
    latest: byId.get(publisher.latestSourceId) ?? null,
  }));
  rows.push({
    key: "vote.gov",
    about: {
      name: "vote.gov, U.S. Election Assistance Commission",
      take: "Registration deadlines and links to each state's official election website, for the election page.",
      home: "https://vote.gov/",
      group: "places",
    },
    receipts: election.states.length,
    receiptId: voteGovLatest.id,
    latest: voteGovLatest,
  });
  const contents = [
    ...GROUPS.filter((group) => rows.some((row) => row.about.group === group.id)).map((group) => ({
      id: `group-${group.id}`,
      label: group.label,
    })),
    { id: "not-used", label: "Sources we do not use" },
  ];

  return (
    <TrustLayout
      header={
        <PageHeader
          title="Where our data comes from"
          lede="Official publishers first. Each time we download an official file, we save a receipt: the web address we read and when we read it. Every fact on For The People links to one."
        />
      }
      rail={<SectionNav items={contents} />}
      railClassName="max-xl:hidden"
    >
      <div className="flex flex-col gap-14">
        <section aria-labelledby="publishers" className="flex flex-col gap-8">
          <h2 id="publishers" className="text-2xl font-bold text-ink">
            Publishers we use
          </h2>
          {GROUPS.map((group) => {
            const members = rows.filter((row) => row.about.group === group.id);
            if (members.length === 0) return null;
            return (
              <section
                key={group.id}
                aria-labelledby={`group-${group.id}`}
                className="flex flex-col"
              >
                <h3
                  id={`group-${group.id}`}
                  className="scroll-mt-24 pb-2 text-sm font-semibold text-ink-2"
                >
                  {group.label}
                </h3>
                <ul className="flex flex-col border-t border-ink">
                  {members.map((row) => (
                    <PublisherRow key={row.key} row={row} />
                  ))}
                </ul>
              </section>
            );
          })}
        </section>

        <section aria-labelledby="not-used" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 id="not-used" className="scroll-mt-24 text-2xl font-bold text-ink">
              Well-known sources we do not use
            </h2>
            <p className="text-base text-ink-2">
              Other sites often cite these. Here is why For The People does not.
            </p>
          </div>
          <ul className="flex flex-col border-t border-hairline">
            {NOT_USED.map((item) => (
              <li
                key={item.name}
                className="flex flex-col gap-0.5 border-b border-hairline py-4 md:grid md:grid-cols-[14rem_minmax(0,1fr)] md:gap-6"
              >
                <h3 className="text-base font-semibold text-ink">{item.name}</h3>
                <p className="text-base text-ink-2">{item.why}</p>
              </li>
            ))}
          </ul>
        </section>

        <p className="text-base text-ink-2">
          How we turn these records into scores is on the{" "}
          <Link href="/methodology" className="font-semibold text-ink underline underline-offset-4">
            methodology page
          </Link>
          . What changed and when is on the{" "}
          <Link href="/changelog" className="font-semibold text-ink underline underline-offset-4">
            changelog
          </Link>
          .
        </p>
      </div>
    </TrustLayout>
  );
}

function PublisherRow({ row }: { row: Row }) {
  const { about, latest } = row;
  return (
    <li className="flex flex-col gap-3 border-b border-hairline py-5">
      <div className="grid items-start gap-x-6 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-col gap-1">
          <h4 className="text-base leading-snug font-semibold text-ink">{about.name}</h4>
          {about.via && <p className="text-sm text-ink-3">{about.via}</p>}
          <p className="text-sm text-ink-2">{about.take}</p>
        </div>
        <dl
          className="flex flex-wrap gap-x-3 text-sm tabular-nums sm:flex-col sm:items-end sm:text-right"
          data-fact="publisher-fetches"
          data-receipt-id={row.receiptId}
        >
          <dt className="sr-only">Receipts</dt>
          <dd className="font-semibold text-ink">
            {formatInteger(row.receipts)} {row.receipts === 1 ? "receipt" : "receipts"}
          </dd>
          <dt className="sr-only">Last fetched</dt>
          <dd className="text-ink-3">
            {latest ? `Fetched ${formatEasternDate(latest.retrievedAt)}` : "No record yet"}
          </dd>
        </dl>
      </div>
      {latest && (
        <div className="flex flex-col gap-1 rounded-control bg-paper px-3 py-3 text-sm sm:flex-row sm:items-center sm:gap-4 sm:px-3.5">
          <span className="shrink-0 text-xs font-semibold text-ink-3">Latest receipt</span>
          <a
            href={latest.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 max-w-full min-w-0 items-center gap-2 text-xs font-medium whitespace-nowrap text-ink underline decoration-hairline underline-offset-4 hover:decoration-ink sm:min-h-0 sm:text-sm sm:font-semibold"
            title={latest.url}
          >
            {/* One line, cut in the middle; the full address is in the title and for screen readers. */}
            <span className="min-w-0 truncate" aria-hidden>
              {middleTruncate(latest.url)}
            </span>
            <span className="sr-only">{latest.url}</span>
            <ExternalLink className="size-3.5 shrink-0 text-ink-3" aria-hidden />
            <span className="sr-only">
              (latest receipt, opens the official record in a new tab)
            </span>
          </a>
          <span className="shrink-0 text-ink-3 tabular-nums sm:ml-auto">
            {FETCHED.format(new Date(latest.retrievedAt))}
            <span aria-hidden>, </span>
            <span title={`SHA-256 ${latest.contentHash}`}>
              <span className="sr-only">content fingerprint </span>
              {latest.contentHash.slice(0, 8)}
            </span>
          </span>
        </div>
      )}
      {about.home && (
        <a
          href={about.home}
          target="_blank"
          rel="noopener noreferrer"
          className="-my-2 inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-ink-2 hover:text-ink"
        >
          Visit the publisher
          <ExternalLink className="size-3.5" aria-hidden />
          <span className="sr-only">(opens in a new tab)</span>
        </a>
      )}
    </li>
  );
}
