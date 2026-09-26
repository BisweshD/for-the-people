import {
  measureId,
  rollCallId,
  StateCode,
  type MeasureId,
  type MeasureType,
  type Party,
  type Position,
  type RollCall,
} from "@for-the-people/core";
import * as z from "zod";
import { senateVotePageUrl } from "../sources";
import { parseXml } from "./xml";

/** Parser for Senate LIS roll-call XML (vote_<congress>_<session>_<NNNNN>.xml). */

const text = z.union([z.string(), z.number()]).transform(String);
const optionalText = z
  .union([z.string(), z.number(), z.object({})])
  .optional()
  .transform((value) =>
    typeof value === "string" || typeof value === "number" ? String(value) : "",
  );
const count = optionalText
  .transform((value) => (value === "" ? 0 : Number(value)))
  .pipe(z.number().int().min(0));

const documentSchema = z.object({
  document_congress: optionalText,
  document_type: optionalText,
  document_number: optionalText,
});
type SenateDocument = z.infer<typeof documentSchema>;

const memberSchema = z.object({
  last_name: text,
  first_name: text,
  party: text,
  state: text,
  vote_cast: text,
  lis_member_id: text,
});

const senateSchema = z.object({
  roll_call_vote: z.object({
    congress: text,
    session: text,
    congress_year: text,
    vote_number: text,
    vote_date: text,
    question: optionalText,
    vote_question_text: optionalText,
    vote_title: optionalText,
    vote_result: text,
    vote_result_text: optionalText,
    majority_requirement: optionalText,
    document: z.union([documentSchema, z.array(documentSchema)]).optional(),
    count: z.object({ yeas: count, nays: count, present: count, absent: count }),
    tie_breaker: z.object({ by_whom: optionalText, tie_breaker_vote: optionalText }).optional(),
    members: z.object({ member: z.array(memberSchema) }),
  }),
});

export interface SenatePositionDraft {
  lisId: string;
  name: string;
  party: Party;
  state: StateCode;
  position: Position;
}

export interface SenateRollCallParse {
  rollCall: Omit<RollCall, "sourceId">;
  positions: SenatePositionDraft[];
}

const DOCUMENT_TYPES: Record<string, MeasureType> = {
  "S.": "s",
  "H.R.": "hr",
  "S.J.Res.": "sjres",
  "H.J.Res.": "hjres",
  "S.Con.Res.": "sconres",
  "H.Con.Res.": "hconres",
  "S.Res.": "sres",
  "H.Res.": "hres",
};

/** Guilty/Not Guilty appear only in impeachment trials, where a Yea is a vote to convict. */
const POSITIONS: Record<string, Position> = {
  Yea: "Yea",
  Nay: "Nay",
  Guilty: "Yea",
  "Not Guilty": "Nay",
  Present: "Present",
  "Present, Giving Live Pair": "Present",
  "Not Voting": "NotVoting",
};

const MONTHS: Record<string, string> = {
  January: "01",
  February: "02",
  March: "03",
  April: "04",
  May: "05",
  June: "06",
  July: "07",
  August: "08",
  September: "09",
  October: "10",
  November: "11",
  December: "12",
};

/** "January 20, 2025,  06:12 PM" becomes "2025-01-20". */
export function parseSenateDate(value: string): string {
  const match = /^([A-Za-z]+) (\d{1,2}), (\d{4})/.exec(value.trim());
  const month = match ? MONTHS[match[1]!] : undefined;
  if (!match || !month) throw new Error(`Unrecognized Senate date: ${value}`);
  return `${match[3]}-${month}-${match[2]!.padStart(2, "0")}`;
}

/** En bloc votes list several documents; the first bill or resolution among them is the measure. */
function measureFromDocuments(
  documents: SenateDocument | SenateDocument[] | undefined,
): MeasureId | null {
  for (const document of [documents ?? []].flat()) {
    const measure = measureFromDocument(document);
    if (measure) return measure;
  }
  return null;
}

function measureFromDocument(document: SenateDocument): MeasureId | null {
  const type = DOCUMENT_TYPES[document.document_type.replace(/\s+/g, "")];
  const number = Number(document.document_number);
  const congress = Number(document.document_congress);
  if (!type || !Number.isInteger(number) || number < 1 || !Number.isInteger(congress)) return null;
  return measureId(congress, type, number);
}

function partyCode(value: string): Party {
  if (value === "D" || value === "R" || value === "I" || value === "L") return value;
  return "O";
}

export function parseSenateRollCall(xml: string): SenateRollCallParse {
  const { roll_call_vote: vote } = senateSchema.parse(parseXml(xml));
  const congress = Number(vote.congress);
  const session = vote.session === "2" ? 2 : 1;
  const number = Number(vote.vote_number);
  const positions = vote.members.member.map((member): SenatePositionDraft => {
    const position = POSITIONS[member.vote_cast];
    if (!position)
      throw new Error(`Senate vote ${number}: unrecognized vote_cast "${member.vote_cast}"`);
    return {
      lisId: member.lis_member_id,
      name: `${member.first_name} ${member.last_name}`,
      party: partyCode(member.party),
      state: StateCode.parse(member.state),
      position,
    };
  });
  const tieVote = vote.tie_breaker?.tie_breaker_vote;
  const question = vote.question || vote.vote_question_text || vote.vote_title;
  return {
    rollCall: {
      id: rollCallId("senate", congress, session, number),
      chamber: "senate",
      congress,
      session,
      number,
      date: parseSenateDate(vote.vote_date),
      question: question || "Recorded vote",
      result: vote.vote_result,
      requires: vote.majority_requirement || null,
      title: vote.vote_title || null,
      totals: {
        yea: vote.count.yeas,
        nay: vote.count.nays,
        present: vote.count.present,
        notVoting: vote.count.absent,
      },
      tieBreaker:
        tieVote === "Yea" || tieVote === "Nay"
          ? { by: vote.tie_breaker?.by_whom || "Vice President", vote: tieVote }
          : null,
      measureId: measureFromDocuments(vote.document),
      officialUrl: senateVotePageUrl(congress, session, number),
    },
    positions,
  };
}
