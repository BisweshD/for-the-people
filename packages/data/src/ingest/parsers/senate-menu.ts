import * as z from "zod";
import { parseXml } from "./xml";

const text = z.union([z.string(), z.number()]).transform(String);

const menuVoteSchema = z.object({
  vote_number: text,
  vote_date: text,
  issue: z.unknown().optional(),
  result: text.optional(),
  title: z.unknown().optional(),
});

const menuSchema = z.object({
  vote_summary: z.object({
    congress: text,
    session: text,
    congress_year: text,
    votes: z.object({ vote: z.union([menuVoteSchema, z.array(menuVoteSchema)]) }),
  }),
});

export interface SenateMenuEntry {
  number: number;
  year: number;
}

/** Lists the roll-call numbers in a Senate session from vote_menu_<congress>_<session>.xml. */
export function parseSenateVoteMenu(xml: string): SenateMenuEntry[] {
  const parsed = menuSchema.parse(parseXml(xml));
  const votes = parsed.vote_summary.votes.vote;
  const list = Array.isArray(votes) ? votes : [votes];
  const year = Number(parsed.vote_summary.congress_year);
  return list.map((vote) => ({ number: Number(vote.vote_number), year })).sort((a, b) => a.number - b.number);
}
