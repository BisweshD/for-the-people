import type { DistrictId, StateCode } from "@for-the-people/core";
import { getDb } from "@for-the-people/data";
import { ballot, ballotDistricts, type BallotCandidate } from "@for-the-people/data/read/ballot";
import { stateListSourceById } from "@for-the-people/data/read/senate-lists";
import { cacheLife, cacheTag } from "next/cache";
import type { BallotResponse, CandidateListView, CandidateView, RaceView } from "@/lib/ballot";
import type { ReceiptView } from "@/lib/views";
import { toReceipt } from "@/lib/views";
import { getKeyVoteRecord, TAGS } from "@/server/data";

/** Cached ballot reads. Keyed by state and ballot district ids only; an address never reaches this layer. */

export const BALLOT_TAGS = {
  ballot: "ballot",
  state: (state: string) => `ballot:${state}`,
} as const;

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

export async function getBallot(
  state: StateCode,
  districtIds: DistrictId[],
): Promise<BallotResponse> {
  "use cache";
  cacheLife("days");
  cacheTag(BALLOT_TAGS.ballot, BALLOT_TAGS.state(state), TAGS.members);
  const db = await getDb();
  const [result, record] = await Promise.all([
    ballot(db, { state, districtIds }),
    getKeyVoteRecord(),
  ]);
  const sources = new Map(result.sources.map((source) => [source.id, toReceipt(source)]));
  const receipt = (id: string | undefined) => (id ? sources.get(id) : undefined);

  /** An FEC filing as a row. `onList` replaces what the state's list decides: the name, party and source. */
  const filedView = (
    { candidacy, person, finance }: BallotCandidate,
    onList?: {
      name: string;
      party: CandidateView["party"];
      partyLabel: string;
      incumbent: boolean;
      receipt: ReceiptView;
    },
  ): CandidateView | null => {
    const filing = receipt(candidacy.sourceIds[0]);
    if (!filing) return null;
    const financeReceipt = finance ? receipt(finance.sourceId) : undefined;
    return {
      candidacyId: candidacy.id,
      personId: person.id,
      name: onList?.name ?? person.names.full,
      party: onList?.party ?? candidacy.party,
      partyLabel: onList?.partyLabel ?? null,
      incumbent: onList?.incumbent ?? candidacy.incumbent,
      fecCandidateId: candidacy.fecCandidateId,
      portrait: person.portrait ? { ...person.portrait, placeholder: null } : null,
      // An FEC-only identity with a bioguide id served in Congress before the 119th.
      formerMember:
        person.id.startsWith("fec:") && person.bioguide
          ? { bioguideUrl: `https://bioguide.congress.gov/search/bio/${person.bioguide}` }
          : null,
      receipt: onList?.receipt ?? filing,
      filing,
      finance:
        finance && financeReceipt
          ? {
              receipts: finance.receipts,
              individual: finance.individual,
              cashOnHand: finance.cashOnHand,
              asOf: finance.asOf,
              receipt: financeReceipt,
            }
          : null,
    };
  };

  const races: RaceView[] = result.races.flatMap(({ race, election, candidates, stateList }) => {
    const raceReceipt = receipt(race.sourceIds[0]);
    if (!raceReceipt) return [];
    const listReceipt = stateList ? receipt(stateList.source.id) : undefined;
    const list: CandidateListView =
      stateList && listReceipt
        ? { status: stateList.status, receipt: listReceipt, note: stateList.note }
        : { status: "filed", receipt: null, note: null };
    const onList = list.status === "certified" || list.status === "official-primary-results";

    const choices: CandidateView[] =
      onList && stateList && listReceipt
        ? stateList.entries.flatMap((entry): CandidateView[] => {
            const decided = {
              name: entry.name,
              party: entry.party,
              partyLabel: entry.partyLabel,
              incumbent: entry.incumbent,
              receipt: listReceipt,
            };
            if (entry.filing) {
              const view = filedView(entry.filing, decided);
              if (view) return [view];
            }
            return [
              {
                candidacyId: `${race.id}|state:${slug(entry.name)}`,
                personId: null,
                ...decided,
                fecCandidateId: null,
                portrait: null,
                formerMember: null,
                filing: null,
                finance: null,
              },
            ];
          })
        : candidates.flatMap((candidate) => filedView(candidate) ?? []);
    const otherFilings = onList
      ? (stateList?.otherFilings ?? []).flatMap((candidate) => filedView(candidate) ?? [])
      : [];

    return [
      {
        id: race.id,
        electionId: election.id,
        special: election.type === "special",
        chamber: race.chamber,
        state: race.state,
        district: race.districtId ? Number(/-(\d+)@/.exec(race.districtId)?.[1]) : null,
        receipt: raceReceipt,
        list,
        candidates: choices,
        otherFilings,
      },
    ];
  });

  const people = new Set(
    races.flatMap((race) =>
      [...race.candidates, ...race.otherFilings].flatMap((c) => c.personId ?? []),
    ),
  );
  return {
    races,
    record: {
      rollCallIds: record.rollCallIds,
      positions: Object.fromEntries(
        Object.entries(record.positions).filter(([personId]) => people.has(personId)),
      ),
    },
  };
}

/** Every 2026 ballot district, for choosing one by hand. */
export async function getBallotDistrictOptions() {
  "use cache";
  cacheLife("days");
  cacheTag(BALLOT_TAGS.ballot);
  return ballotDistricts(await getDb());
}

/** A state candidate list's Receipt, for /api/receipts. */
export async function getStateListSource(id: string) {
  "use cache";
  cacheLife("days");
  cacheTag(BALLOT_TAGS.ballot);
  return stateListSourceById(id);
}
