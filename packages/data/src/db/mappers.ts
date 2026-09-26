import type {
  Candidacy,
  District,
  Election,
  FinanceCommittee,
  FinanceSummary,
  IngestionRun,
  IssueArea,
  KeyVote,
  Measure,
  Office,
  Party,
  Person,
  Race,
  RollCall,
  Source,
  Term,
  VotePosition,
} from "@for-the-people/core";
import type * as t from "./schema";

/**
 * The single translation between ontology objects and table rows.
 * test/schema-contract.test.ts round-trips every mapper through the core Zod schemas.
 */

type Row<T extends { $inferSelect: unknown }> = T["$inferSelect"];

export const sourceToRow = (source: Source): Row<typeof t.sources> => ({ ...source });
export const sourceFromRow = (row: Row<typeof t.sources>): Source => ({ ...row });

export const personToRow = (person: Person): Row<typeof t.people> => ({
  id: person.id,
  fullName: person.names.full,
  firstName: person.names.first,
  lastName: person.names.last,
  nickname: person.names.nickname,
  suffix: person.names.suffix,
  bioguide: person.ids.bioguide,
  fecIds: person.ids.fec,
  wikidata: person.ids.wikidata,
  ballotpedia: person.ids.ballotpedia,
  govtrack: person.ids.govtrack,
  lis: person.ids.lis,
  portrait: person.portrait,
  links: person.links,
  sourceIds: person.sourceIds,
});

export const personFromRow = (row: Row<typeof t.people>): Person => ({
  id: row.id,
  names: {
    full: row.fullName,
    first: row.firstName,
    last: row.lastName,
    nickname: row.nickname,
    suffix: row.suffix,
  },
  ids: {
    bioguide: row.bioguide,
    fec: row.fecIds,
    wikidata: row.wikidata,
    ballotpedia: row.ballotpedia,
    govtrack: row.govtrack,
    lis: row.lis,
  },
  portrait: row.portrait ?? null,
  links: row.links,
  sourceIds: row.sourceIds,
});

export const officeToRow = (office: Office): Row<typeof t.offices> => ({ ...office });
export const officeFromRow = (row: Row<typeof t.offices>): Office => ({
  ...row,
  level: "federal",
  title: row.title as Office["title"],
  state: row.state as Office["state"],
  seatClass: row.seatClass as Office["seatClass"],
});

export const districtToRow = (district: District): Row<typeof t.districts> => ({ ...district });
export const districtFromRow = (row: Row<typeof t.districts>): District => ({
  ...row,
  state: row.state as District["state"],
});

export const termToRow = (term: Term): Row<typeof t.terms> => ({ ...term });
export const termFromRow = (row: Row<typeof t.terms>): Term => ({
  ...row,
  state: row.state as Term["state"],
  party: row.party as Party,
  caucus: row.caucus as Party | null,
});

export const electionToRow = (election: Election): Row<typeof t.elections> => ({ ...election });
export const electionFromRow = (row: Row<typeof t.elections>): Election => ({
  ...row,
  type: row.type as Election["type"],
  state: row.state as Election["state"],
});

export const raceToRow = (race: Race): Row<typeof t.races> => ({ ...race });
export const raceFromRow = (row: Row<typeof t.races>): Race => ({
  ...row,
  state: row.state as Race["state"],
});

export const candidacyToRow = (candidacy: Candidacy): Row<typeof t.candidacies> => ({
  ...candidacy,
});
export const candidacyFromRow = (row: Row<typeof t.candidacies>): Candidacy => ({
  ...row,
  party: row.party as Party,
  status: row.status as Candidacy["status"],
});

export const measureToRow = (measure: Measure): Row<typeof t.measures> => ({
  id: measure.id,
  congress: measure.congress,
  type: measure.type,
  number: measure.number,
  titleDisplay: measure.titles.display,
  titleOfficial: measure.titles.official,
  titleShort: measure.titles.short,
  titlePopular: measure.titles.popular,
  sponsorId: measure.sponsorId,
  introducedDate: measure.introducedDate,
  latestAction: measure.status.latestAction,
  latestActionDate: measure.status.latestActionDate,
  becameLaw: measure.status.becameLaw,
  crsSummary: measure.crsSummary,
  plainSummary: measure.plainSummary,
  sourceIds: measure.sourceIds,
});

export const measureFromRow = (row: Row<typeof t.measures>): Measure => ({
  id: row.id,
  congress: row.congress,
  type: row.type as Measure["type"],
  number: row.number,
  titles: {
    display: row.titleDisplay,
    official: row.titleOfficial,
    short: row.titleShort,
    popular: row.titlePopular,
  },
  sponsorId: row.sponsorId,
  introducedDate: row.introducedDate,
  status: {
    latestAction: row.latestAction,
    latestActionDate: row.latestActionDate,
    becameLaw: row.becameLaw,
  },
  crsSummary: row.crsSummary ?? null,
  plainSummary: row.plainSummary ?? null,
  sourceIds: row.sourceIds,
});

export const rollCallToRow = (rollCall: RollCall): Row<typeof t.rollCalls> => ({
  id: rollCall.id,
  chamber: rollCall.chamber,
  congress: rollCall.congress,
  session: rollCall.session,
  number: rollCall.number,
  date: rollCall.date,
  question: rollCall.question,
  result: rollCall.result,
  requires: rollCall.requires,
  title: rollCall.title,
  yea: rollCall.totals.yea,
  nay: rollCall.totals.nay,
  present: rollCall.totals.present,
  notVoting: rollCall.totals.notVoting,
  tieBreaker: rollCall.tieBreaker,
  measureId: rollCall.measureId,
  officialUrl: rollCall.officialUrl,
  sourceId: rollCall.sourceId,
});

export const rollCallFromRow = (row: Row<typeof t.rollCalls>): RollCall => ({
  id: row.id,
  chamber: row.chamber,
  congress: row.congress,
  session: row.session === 2 ? 2 : 1,
  number: row.number,
  date: row.date,
  question: row.question,
  result: row.result,
  requires: row.requires,
  title: row.title,
  totals: { yea: row.yea, nay: row.nay, present: row.present, notVoting: row.notVoting },
  tieBreaker: row.tieBreaker ?? null,
  measureId: row.measureId,
  officialUrl: row.officialUrl,
  sourceId: row.sourceId,
});

export const votePositionToRow = (position: VotePosition): Row<typeof t.votePositions> => ({
  ...position,
});
export const votePositionFromRow = (row: Row<typeof t.votePositions>): VotePosition => ({
  ...row,
  party: row.party as Party,
  state: row.state as VotePosition["state"],
});

export const issueAreaToRow = (issueArea: IssueArea): Row<typeof t.issueAreas> => ({
  ...issueArea,
});
export const issueAreaFromRow = (row: Row<typeof t.issueAreas>): IssueArea => ({ ...row });

export const keyVoteToRow = (keyVote: KeyVote): Row<typeof t.keyVotes> => ({ ...keyVote });
export const keyVoteFromRow = (row: Row<typeof t.keyVotes>): KeyVote => ({
  ...row,
  yeaLean: row.yeaLean as KeyVote["yeaLean"],
  status: row.status as KeyVote["status"],
});

export const financeCommitteeToRow = (
  committee: FinanceCommittee,
): Row<typeof t.financeCommittees> => ({ ...committee });
export const financeCommitteeFromRow = (
  row: Row<typeof t.financeCommittees>,
): FinanceCommittee => ({ ...row });

export const financeSummaryToRow = (summary: FinanceSummary): Row<typeof t.financeSummaries> => ({
  ...summary,
});
export const financeSummaryFromRow = (row: Row<typeof t.financeSummaries>): FinanceSummary => ({
  ...row,
});

export const ingestionRunFromRow = (row: Row<typeof t.ingestionRuns>): IngestionRun => ({
  ...row,
  status: row.status as IngestionRun["status"],
});
