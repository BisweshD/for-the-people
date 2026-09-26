import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { FecCandidateId, Party, StateCode, type Source } from "@for-the-people/core";
import { z } from "zod";
import { workspaceRoot } from "../db/client";
import type { BallotCandidate } from "./ballot";
import { compareCandidates } from "./candidate-order";

/**
 * Official U.S. Senate candidate lists for November 3, 2026 (data/candidates-2026-senate.json), read from
 * each state's election authority and validated on every load. A list decides who is a choice on the
 * ballot; FEC filings still carry each candidate's money totals and voting record.
 */

export const StateListStatus = z.enum(["certified", "official-primary-results", "pending"]);
export type StateListStatus = z.infer<typeof StateListStatus>;

const ListedCandidate = z.object({
  /** As the state prints it (title case where the state uses capitals). */
  name: z.string().min(1),
  party: Party,
  /** The state's own party label, for example "Forward Party". */
  partyLabel: z.string().min(1),
  incumbent: z.boolean(),
  fecCandidateId: FecCandidateId.nullable(),
});
export type ListedCandidate = z.infer<typeof ListedCandidate>;

const StateListRaceSchema = z
  .object({
    state: StateCode,
    seatClass: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    special: z.boolean(),
    status: StateListStatus,
    source: z.object({
      url: z.url({ protocol: /^https$/ }),
      publisher: z.string().min(1),
      retrieved: z.iso.date(),
    }),
    candidates: z.array(ListedCandidate),
    /** Why a list is pending, or what else to know about it. */
    note: z.string().min(1).optional(),
  })
  .refine((race) => (race.status === "pending") === (race.candidates.length === 0), {
    message: "A pending race lists no names; any other status lists at least one.",
  });
export type StateListRace = z.infer<typeof StateListRaceSchema>;

export const SenateListFile = z
  .object({
    asOf: z.iso.date(),
    note: z.string().min(1),
    races: z.array(StateListRaceSchema),
  })
  .refine(
    (file) =>
      new Set(file.races.map((race) => `${race.state}:${race.seatClass}`)).size ===
      file.races.length,
    { message: "Each Senate seat appears once." },
  );
export type SenateListFile = z.infer<typeof SenateListFile>;

export async function senateLists(): Promise<SenateListFile> {
  const raw = await readFile(join(workspaceRoot(), "data", "candidates-2026-senate.json"), "utf8");
  return SenateListFile.parse(JSON.parse(raw));
}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * The Receipt for one state's list. The file keeps the page and the day it was read, not a copy of the
 * page, so the content hash covers the entry as recorded (status, names, parties, note).
 */
export function stateListSource(race: StateListRace): Source {
  const contentHash = sha256(
    JSON.stringify([race.state, race.seatClass, race.status, race.candidates, race.note ?? null]),
  );
  return {
    id: `src_${sha256(`${race.source.url}\n${contentHash}`).slice(0, 16)}`,
    publisher: race.source.publisher,
    url: race.source.url,
    retrievedAt: `${race.source.retrieved}T00:00:00.000Z`,
    contentHash,
    notes: null,
  };
}

/** Resolves a state list's Receipt id, so /api/receipts answers for it like any other Source. */
export async function stateListSourceById(id: string): Promise<Source | null> {
  const file = await senateLists();
  for (const race of file.races) {
    const source = stateListSource(race);
    if (source.id === id) return source;
  }
  return null;
}

// Name matching ------------------------------------------------------------------------------------

const SUFFIXES = new Set(["jr", "sr", "ii", "iii", "iv", "v"]);

/** Common English given-name forms, both ways (Peggy for Margaret, Bob for Robert). */
const NICKNAMES: ReadonlyArray<readonly string[]> = [
  ["margaret", "peggy", "maggie", "meg"],
  ["angela", "angie"],
  ["robert", "bob", "bobby", "rob"],
  ["william", "bill", "billy", "will"],
  ["richard", "rick", "dick", "rich"],
  ["james", "jim", "jimmy", "jamie"],
  ["michael", "mike"],
  ["christopher", "chris"],
  ["daniel", "dan", "danny"],
  ["joshua", "josh"],
  ["andrew", "andy", "drew"],
  ["edward", "ed", "eddie", "ted"],
  ["thomas", "tom", "tommy"],
  ["joseph", "joe", "joey"],
  ["charles", "chuck", "charlie"],
  ["elizabeth", "liz", "beth", "betsy"],
  ["katherine", "kathy", "kate", "katie"],
  ["catherine", "cathy", "kate"],
  ["patricia", "pat", "patty", "trish"],
  ["patrick", "pat"],
  ["jonathan", "jon"],
  ["benjamin", "ben"],
  ["samuel", "sam"],
  ["steven", "steve"],
  ["stephen", "steve"],
  ["timothy", "tim"],
  ["gregory", "greg"],
  ["anthony", "tony"],
  ["kenneth", "ken"],
  ["lawrence", "larry"],
  ["gerald", "jerry"],
  ["theodore", "ted"],
  ["cynthia", "cindy"],
  ["deborah", "debbie", "deb"],
  ["susan", "sue"],
  ["rebecca", "becky"],
  ["jennifer", "jen", "jenny"],
  ["kimberly", "kim"],
  ["zachary", "zach"],
  ["alexander", "alex"],
  ["nathaniel", "nate"],
  ["nathan", "nate"],
];
const NICKNAME_GROUPS = new Map<string, Set<number>>();
NICKNAMES.forEach((group, index) => {
  for (const name of group) {
    const groups = NICKNAME_GROUPS.get(name) ?? new Set<number>();
    groups.add(index);
    NICKNAME_GROUPS.set(name, groups);
  }
});

interface ParsedName {
  /** Words of two or more letters, lowercased and without accents. */
  words: string[];
  /** Single-letter middle initials. */
  initials: string[];
  suffix: string | null;
}

function parseName(name: string): ParsedName {
  const tokens = name
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/["“”][^"“”]*["“”]/g, " ")
    .toLowerCase()
    .split(/[\s,]+/)
    .map((token) => token.replace(/[^a-z-]/g, ""))
    .filter((token) => token.length > 0);
  let suffix: string | null = null;
  while (tokens.length > 2 && SUFFIXES.has(tokens.at(-1)!)) suffix ??= tokens.pop()!;
  return {
    words: tokens.filter((token) => token.length > 1),
    initials: tokens.filter((token) => token.length === 1),
    suffix,
  };
}

const plainWords = (text: string | null): string[] => (text ? parseName(text).words : []);

function sameGivenName(a: string, b: string): "exact" | "variant" | null {
  if (a === b) return "exact";
  const groups = NICKNAME_GROUPS.get(a);
  if (groups && [...(NICKNAME_GROUPS.get(b) ?? [])].some((group) => groups.has(group)))
    return "variant";
  if (Math.min(a.length, b.length) >= 3 && (a.startsWith(b) || b.startsWith(a))) return "variant";
  return null;
}

function oneEditApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1 || a === b) return false;
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  const [x, y] = [a.slice(i), b.slice(i)];
  return x.slice(1) === y.slice(1) || x.slice(1) === y || x === y.slice(1);
}

/**
 * How well a name on the state's list fits one FEC filing: null when they cannot be the same person.
 * The last name must agree (one letter of slack for a long name when the first name is identical),
 * the first name must agree exactly or as a known short form, and middle initials and suffixes must not
 * contradict each other. Party only breaks ties; it never makes a match on its own.
 */
function fit(listed: ListedCandidate, candidate: BallotCandidate): number | null {
  if (listed.fecCandidateId)
    return candidate.candidacy.fecCandidateId === listed.fecCandidateId ? 100 : null;

  const onList = parseName(listed.name);
  const filed = parseName(candidate.person.names.full);
  const surname = plainWords(candidate.person.names.last).flatMap((word) => word.split("-"));
  const listWords = onList.words.flatMap((word) => word.split("-"));
  const listFirst = onList.words[0];
  const listLast = onList.words.at(-1);
  if (!listFirst || !listLast || surname.length === 0) return null;

  const filedWords = filed.words.flatMap((word) => word.split("-"));
  // "Ashley Hinson" on the list, "Ashley Hinson Arenholz" at the FEC: every listed word is in the filing.
  const surnameExact =
    surname.every((word) => listWords.includes(word)) ||
    (listWords.length >= 2 && listWords.every((word) => filedWords.includes(word)));
  const surnameSlip =
    !surnameExact &&
    surname.length === 1 &&
    listLast.length >= 6 &&
    oneEditApart(listLast, surname[0]!);
  if (!surnameExact && !surnameSlip) return null;

  const given = [
    ...plainWords(candidate.person.names.first),
    ...plainWords(candidate.person.names.nickname),
    filed.words[0],
  ].filter((word): word is string => Boolean(word));
  const kinds = given.map((word) => sameGivenName(listFirst, word));
  const first = kinds.includes("exact") ? 3 : kinds.includes("variant") ? 2 : 0;
  if (first === 0) return null;
  if (surnameSlip && first !== 3) return null;

  const filedMiddle = [
    ...filed.initials,
    ...filed.words.slice(1).filter((word) => !surname.includes(word) && !word.includes("-")),
  ].map((word) => word[0]!);
  const listMiddle = [
    ...onList.initials,
    ...onList.words.slice(1, -1).filter((word) => !surname.includes(word)),
  ].map((word) => word[0]!);
  let middle = 0;
  if (listMiddle.length > 0 && filedMiddle.length > 0) {
    if (!listMiddle.some((letter) => filedMiddle.includes(letter))) return null;
    middle = 1;
  }
  if (onList.suffix && filed.suffix && onList.suffix !== filed.suffix) return null;
  const suffix = onList.suffix && onList.suffix === filed.suffix ? 1 : 0;
  const party = listed.party === candidate.candidacy.party ? 1 : 0;
  return first + middle + suffix + party - (surnameSlip ? 1 : 0);
}

export interface StateListMatch {
  listed: ListedCandidate;
  /** The FEC filing for this name, when one fits; null for anyone who has not filed under it. */
  filing: BallotCandidate | null;
}

/**
 * Pairs each name on a state's list with at most one FEC filing, best fits first. Filings left over are
 * the "other FEC filings", minus repeat filings of a matched campaign (same principal committee).
 */
export function matchStateList(
  listed: readonly ListedCandidate[],
  filings: readonly BallotCandidate[],
): { entries: StateListMatch[]; others: BallotCandidate[] } {
  const pairs = listed
    .flatMap((entry, i) =>
      filings.flatMap((candidate, j) => {
        const score = fit(entry, candidate);
        return score === null ? [] : [{ i, j, score }];
      }),
    )
    .toSorted((a, b) => b.score - a.score || a.i - b.i || a.j - b.j);
  const byListed = new Map<number, number>();
  const used = new Set<number>();
  for (const { i, j } of pairs) {
    if (byListed.has(i) || used.has(j)) continue;
    byListed.set(i, j);
    used.add(j);
  }
  const entries = listed.map((entry, i) => {
    const j = byListed.get(i);
    return { listed: entry, filing: j === undefined ? null : filings[j]! };
  });
  const matchedCommittees = new Set(
    entries.flatMap((entry) => entry.filing?.finance?.financeCommitteeId ?? []),
  );
  const others = filings
    .filter((_, j) => !used.has(j))
    .filter(
      (candidate) =>
        !candidate.finance || !matchedCommittees.has(candidate.finance.financeCommitteeId),
    )
    .toSorted(compareCandidates);
  return { entries, others };
}

export interface StateListEntry {
  /** The name as the state prints it. */
  name: string;
  party: Party;
  partyLabel: string;
  /** As the state's list marks it. */
  incumbent: boolean;
  filing: BallotCandidate | null;
}

export interface BallotStateList {
  status: StateListStatus;
  source: Source;
  note: string | null;
  /** The names on the state's list, alphabetical by last name. Empty while the list is pending. */
  entries: StateListEntry[];
  /** FEC filers for the seat who are not on the state's list. Never choices; empty while pending. */
  otherFilings: BallotCandidate[];
}

/** The filing's last name when there is one (it knows compound surnames), else the printed name's last word. */
function lastNameOf(entry: StateListEntry): string {
  if (entry.filing) return entry.filing.person.names.last;
  const words = entry.name.replace(/,/g, " ").split(/\s+/).filter(Boolean);
  while (words.length > 2 && SUFFIXES.has(words.at(-1)!.toLowerCase().replace(/\./g, "")))
    words.pop();
  return words.at(-1) ?? entry.name;
}

/** A race's state list applied to its FEC filings. A pending list changes nothing but the wording. */
export function applyStateList(
  race: StateListRace,
  filings: readonly BallotCandidate[],
): BallotStateList {
  const source = stateListSource(race);
  const note = race.note ?? null;
  if (race.status === "pending")
    return { status: race.status, source, note, entries: [], otherFilings: [] };
  const { entries, others } = matchStateList(race.candidates, filings);
  return {
    status: race.status,
    source,
    note,
    entries: entries
      .map(({ listed, filing }) => ({
        name: listed.name,
        party: listed.party,
        partyLabel: listed.partyLabel,
        incumbent: listed.incumbent,
        filing,
      }))
      .toSorted(
        (a, b) => lastNameOf(a).localeCompare(lastNameOf(b)) || a.name.localeCompare(b.name),
      ),
    otherFilings: others,
  };
}
