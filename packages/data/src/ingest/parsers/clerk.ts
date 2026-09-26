import {
  BioguideId,
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
import { houseRollPageUrl } from "../sources";
import { parseXml } from "./xml";

/** Parser for House Clerk EVS roll-call XML (https://clerk.house.gov/evs/<year>/roll<NNN>.xml). */

const text = z.union([z.string(), z.number()]).transform(String);
const count = text
  .transform((value) => (value === "" ? 0 : Number(value)))
  .pipe(z.number().int().min(0));

const legislatorSchema = z.object({
  "@_name-id": z.string(),
  "@_party": z.string(),
  "@_state": z.string(),
  "#text": text.optional(),
});

const recordedVoteSchema = z.object({
  legislator: z.union([legislatorSchema, text]),
  vote: text,
});

const clerkSchema = z.object({
  "rollcall-vote": z.object({
    "vote-metadata": z.object({
      congress: text,
      session: text,
      "rollcall-num": text,
      "legis-num": text.optional(),
      "vote-question": text,
      "vote-type": text,
      "vote-result": text,
      "action-date": text,
      "vote-desc": text.optional(),
      "vote-totals": z.object({
        "totals-by-vote": z
          .object({
            "yea-total": count,
            "nay-total": count,
            "present-total": count,
            "not-voting-total": count,
          })
          .optional(),
      }),
    }),
    "vote-data": z.object({ "recorded-vote": z.array(recordedVoteSchema) }).optional(),
  }),
});

export interface HousePositionDraft {
  bioguide: string;
  party: Party;
  /** Null for delegates, whom the Clerk records with state "XX" on Committee of the Whole votes. */
  state: StateCode | null;
  position: Position;
}

/** Why a House file is not stored as a roll call. */
export type HouseSkipCause =
  | "quorum"
  | "noVotes"
  | "unrecognizedVote"
  | "missingBioguide"
  | "noTotals";

export interface HouseRollCallSkip {
  kind: "skipped";
  id: string;
  cause: HouseSkipCause;
  reason: string;
}

export type HouseRollCallParse =
  | { kind: "rollCall"; rollCall: Omit<RollCall, "sourceId">; positions: HousePositionDraft[] }
  | HouseRollCallSkip;

const MONTHS: Record<string, string> = {
  Jan: "01",
  Feb: "02",
  Mar: "03",
  Apr: "04",
  May: "05",
  Jun: "06",
  Jul: "07",
  Aug: "08",
  Sep: "09",
  Oct: "10",
  Nov: "11",
  Dec: "12",
};

/** "22-Jan-2025" becomes "2025-01-22". */
export function parseClerkDate(value: string): string {
  const match = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(value.trim());
  const month = match ? MONTHS[match[2]!] : undefined;
  if (!match || !month) throw new Error(`Unrecognized Clerk date: ${value}`);
  return `${match[3]}-${month}-${match[1]!.padStart(2, "0")}`;
}

const LEGIS_TYPES: Array<[RegExp, MeasureType]> = [
  [/^H\s*CON\s*RES\s+(\d+)$/i, "hconres"],
  [/^S\s*CON\s*RES\s+(\d+)$/i, "sconres"],
  [/^H\s*J\s*RES\s+(\d+)$/i, "hjres"],
  [/^S\s*J\s*RES\s+(\d+)$/i, "sjres"],
  [/^H\s*RES\s+(\d+)$/i, "hres"],
  [/^S\s*RES\s+(\d+)$/i, "sres"],
  [/^H\s*R\s+(\d+)$/i, "hr"],
  [/^S\s+(\d+)$/i, "s"],
];

/** "H R 1" becomes 119-hr-1; QUORUM, MOTION, and other non-measures become null. */
export function measureFromLegisNum(
  congress: number,
  legisNum: string | undefined,
): MeasureId | null {
  if (!legisNum) return null;
  const normalized = legisNum.replace(/\./g, " ").replace(/\s+/g, " ").trim();
  for (const [pattern, type] of LEGIS_TYPES) {
    const match = pattern.exec(normalized);
    if (match) return measureId(congress, type, Number(match[1]));
  }
  return null;
}

const POSITIONS: Record<string, Position> = {
  Yea: "Yea",
  Aye: "Yea",
  Nay: "Nay",
  No: "Nay",
  Present: "Present",
  "Not Voting": "NotVoting",
};

function partyCode(value: string): Party {
  if (value === "D" || value === "R" || value === "I" || value === "L") return value;
  return "O";
}

export function parseHouseRollCall(xml: string, year: number): HouseRollCallParse {
  const { "rollcall-vote": vote } = clerkSchema.parse(parseXml(xml));
  const meta = vote["vote-metadata"];
  const congress = Number(meta.congress);
  const session = meta.session.startsWith("2") ? 2 : 1;
  const number = Number(meta["rollcall-num"]);
  const id = rollCallId("house", congress, session, number);
  const question = meta["vote-question"];
  const records = vote["vote-data"]?.["recorded-vote"] ?? [];
  if (meta["vote-type"].toUpperCase() === "QUORUM") {
    return {
      kind: "skipped",
      id,
      cause: "quorum",
      reason: `"${question}" is a quorum call, not a vote on a question.`,
    };
  }

  const positions: HousePositionDraft[] = [];
  for (const record of records) {
    const position = POSITIONS[record.vote];
    if (!position) {
      return {
        kind: "skipped",
        id,
        cause: "unrecognizedVote",
        reason: `"${question}" records "${record.vote}", not Yea/Nay/Present/Not Voting (for example a Speaker election).`,
      };
    }
    if (typeof record.legislator === "string") {
      return {
        kind: "skipped",
        id,
        cause: "missingBioguide",
        reason: "A recorded vote has no bioguide id.",
      };
    }
    positions.push({
      bioguide: BioguideId.parse(record.legislator["@_name-id"]),
      party: partyCode(record.legislator["@_party"]),
      state:
        record.legislator["@_state"] === "XX"
          ? null
          : StateCode.parse(record.legislator["@_state"]),
      position,
    });
  }
  if (positions.length === 0)
    return {
      kind: "skipped",
      id,
      cause: "noVotes",
      reason: `"${question}" has no recorded votes (quorum call).`,
    };

  const totals = meta["vote-totals"]["totals-by-vote"];
  if (!totals)
    return { kind: "skipped", id, cause: "noTotals", reason: `"${question}" has no Yea/Nay totals.` };
  const voteType = meta["vote-type"];
  return {
    kind: "rollCall",
    rollCall: {
      id,
      chamber: "house",
      congress,
      session,
      number,
      date: parseClerkDate(meta["action-date"]),
      question,
      result: meta["vote-result"],
      requires: voteType.includes("2/3") ? "2/3" : "1/2",
      title: meta["vote-desc"] || null,
      totals: {
        yea: totals["yea-total"],
        nay: totals["nay-total"],
        present: totals["present-total"],
        notVoting: totals["not-voting-total"],
      },
      tieBreaker: null,
      measureId: measureFromLegisNum(congress, meta["legis-num"]),
      officialUrl: houseRollPageUrl(year, number),
    },
    positions,
  };
}

/** Parser for the Clerk's member list (https://clerk.house.gov/xml/lists/MemberData.xml). */

const predecessorSchema = z.object({
  "@_cause": z.string().optional(),
  "pred-memindex": text,
  "pred-vacate-date": z.object({ "@_date": z.string().regex(/^\d{8}$/) }),
  "pred-footnote": text.optional(),
});

const memberDataSchema = z.object({
  MemberData: z.object({
    members: z.object({
      member: z.array(
        z.object({
          statedistrict: text,
          "predecessor-info": z.union([predecessorSchema, z.array(predecessorSchema)]).optional(),
        }),
      ),
    }),
  }),
});

export interface ClerkVacancy {
  bioguide: string;
  /** The day the seat became vacant, as the Clerk records it. */
  vacated: string;
  /** "D" (died) or "R" (resigned), as the Clerk codes it. */
  cause: string | null;
  footnote: string | null;
}

/** Every predecessor the Clerk lists: who left a seat this Congress, and the day the seat became vacant. */
export function parseMemberDataVacancies(xml: string): ClerkVacancy[] {
  const members = memberDataSchema.parse(parseXml(xml)).MemberData.members.member;
  return members.flatMap((member) =>
    [member["predecessor-info"] ?? []].flat().map((pred) => {
      const date = pred["pred-vacate-date"]["@_date"];
      return {
        bioguide: BioguideId.parse(pred["pred-memindex"]),
        vacated: `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`,
        cause: pred["@_cause"] ?? null,
        footnote: pred["pred-footnote"] || null,
      };
    }),
  );
}
