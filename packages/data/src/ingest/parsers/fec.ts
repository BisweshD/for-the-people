import { unzipSync } from "fflate";
import * as z from "zod";

/**
 * FEC bulk files (https://www.fec.gov/data/browse-data/?tab=bulk-data), pipe-delimited inside a zip.
 * Only the columns we use are read. Candidate mailing addresses and committee treasurer names are
 * never read into our types, so they cannot reach the database.
 */

export function unzipSingleText(zip: Buffer): string {
  const files = unzipSync(new Uint8Array(zip));
  const [name] = Object.keys(files);
  if (!name) throw new Error("Empty FEC zip");
  return Buffer.from(files[name]!).toString("latin1");
}

const rows = (text: string) =>
  text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "")
    .map((line) => line.split("|"));

const money = z
  .string()
  .transform((value) => (value.trim() === "" ? 0 : Number(value)))
  .pipe(z.number().finite());

/** cn: candidate master. */
export const FecCandidateRow = z.object({
  candidateId: z.string().regex(/^[HSP][0-9][A-Z0-9]{2}[0-9]{5}$/),
  name: z.string().min(1),
  party: z.string(),
  electionYear: z.coerce.number().int(),
  officeState: z.string(),
  office: z.enum(["H", "S", "P"]),
  officeDistrict: z.string(),
  incumbentChallenger: z.string(),
  status: z.string(),
  principalCommitteeId: z.string(),
});
export type FecCandidateRow = z.infer<typeof FecCandidateRow>;

/** Rows that fail validation (for example a filing with no name) are dropped, never guessed at. */
export function parseCandidateMaster(text: string): FecCandidateRow[] {
  return rows(text).flatMap((cols) => {
    const parsed = FecCandidateRow.safeParse({
      candidateId: cols[0],
      name: cols[1],
      party: cols[2] ?? "",
      electionYear: cols[3],
      officeState: cols[4] ?? "",
      office: cols[5],
      officeDistrict: cols[6] ?? "",
      incumbentChallenger: cols[7] ?? "",
      status: cols[8] ?? "",
      principalCommitteeId: cols[9] ?? "",
    });
    return parsed.success ? [parsed.data] : [];
  });
}

/** weball: all-candidates summary, aggregate totals only. */
export const FecSummaryRow = z.object({
  candidateId: z.string(),
  receipts: money,
  /** TRANS_FROM_AUTH: transfers from the candidate's other authorized committees (mostly joint fundraising). */
  transfersFromAuthorized: money,
  cashOnHand: money,
  candidateContributions: money,
  candidateLoans: money,
  debts: money,
  individual: money,
  otherCommittees: money,
  partyCommittees: money,
  coverageEnd: z.string(),
});
export type FecSummaryRow = z.infer<typeof FecSummaryRow>;

export function parseAllCandidates(text: string): FecSummaryRow[] {
  return rows(text).map((cols) =>
    FecSummaryRow.parse({
      candidateId: cols[0],
      receipts: cols[5] ?? "",
      transfersFromAuthorized: cols[6] ?? "",
      cashOnHand: cols[10] ?? "",
      candidateContributions: cols[11] ?? "",
      candidateLoans: cols[12] ?? "",
      debts: cols[16] ?? "",
      individual: cols[17] ?? "",
      otherCommittees: cols[25] ?? "",
      partyCommittees: cols[26] ?? "",
      coverageEnd: cols[27] ?? "",
    }),
  );
}

/** cm: committee master (id, name, designation, candidate). */
export interface FecCommitteeRow {
  committeeId: string;
  name: string;
  designation: string;
  candidateId: string;
}

export function parseCommitteeMaster(text: string): FecCommitteeRow[] {
  return rows(text).map((cols) => ({
    committeeId: cols[0] ?? "",
    name: cols[1] ?? "",
    designation: cols[8] ?? "",
    candidateId: cols[14] ?? "",
  }));
}

/** "06/30/2026" becomes "2026-06-30"; blank stays null. */
export function fecDate(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  return match ? `${match[3]}-${match[1]}-${match[2]}` : null;
}

const SUFFIXES = new Set(["JR", "SR", "II", "III", "IV", "V"]);
const TITLES = /^(MR|MRS|MS|DR|HON|REV)\.?$/;

/** "CARL, JERRY LEE, JR" becomes { first: "Jerry", last: "Carl", suffix: "Jr." } in title case. */
export function parseFecName(raw: string): {
  first: string;
  last: string;
  suffix: string | null;
  full: string;
} {
  const titleCase = (value: string) =>
    value
      .toLowerCase()
      .replace(
        /(^|[\s'-])([a-zà-ÿ])/g,
        (_match, lead: string, letter: string) => lead + letter.toUpperCase(),
      )
      .replace(/\bMc([a-z])/g, (_match, letter: string) => `Mc${letter.toUpperCase()}`);
  const [lastPart = "", restPart = ""] = raw.split(",", 2).map((part) => part.trim());
  const rest = raw.split(",").slice(1).join(" ").replace(/\s+/g, " ").trim() || restPart;
  const tokens = rest.split(" ").filter((token) => token && !TITLES.test(token.replace(/\./g, "")));
  const suffixToken = tokens.find((token) => SUFFIXES.has(token.replace(/\./g, "")));
  const given = tokens.filter((token) => token !== suffixToken);
  const first = titleCase(given[0] ?? lastPart);
  const last = titleCase(lastPart);
  const suffix = suffixToken
    ? /^(JR|SR)$/.test(suffixToken.replace(/\./g, ""))
      ? `${titleCase(suffixToken.replace(/\./g, ""))}.`
      : suffixToken
    : null;
  const middle = given
    .slice(1)
    .map((token) => (token.length === 1 ? `${token}.` : titleCase(token)));
  const full = [first, ...middle, last].join(" ") + (suffix ? `, ${suffix}` : "");
  return { first, last, suffix, full };
}
