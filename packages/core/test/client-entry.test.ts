import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { isFriendCompare, isShareCard } from "../src/share-link";
import { FriendCompare, Location, ShareCard, Voter } from "../src/voter";
import { isLocation, isVoter } from "../src/voter-guard";

const SRC = join(import.meta.dirname, "../src");

/** Runtime (non-type) imports of a module, resolved to files under src. */
function runtimeImports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const specifiers = [
    ...source.matchAll(/^(?:import|export)\s+(?!type\b)[^;]*?from\s+"([^"]+)";/gms),
    ...source.matchAll(/^import\s+"([^"]+)";/gm),
  ].map((match) => match[1]!);
  return specifiers.map((specifier) =>
    specifier.startsWith(".") ? resolveLocal(dirname(file), specifier) : specifier,
  );
}

function resolveLocal(from: string, specifier: string): string {
  const base = resolve(from, specifier);
  for (const candidate of [`${base}.ts`, join(base, "index.ts")]) {
    try {
      readFileSync(candidate);
      return candidate;
    } catch {
      // try the next form
    }
  }
  throw new Error(`Cannot resolve ${specifier} from ${from}`);
}

describe("the browser entry", () => {
  test("never reaches Zod through a runtime import", () => {
    const seen = new Set<string>();
    const packages = new Set<string>();
    const visit = (file: string) => {
      if (seen.has(file)) return;
      seen.add(file);
      for (const target of runtimeImports(file)) {
        if (target.endsWith(".ts")) visit(target);
        else packages.add(target);
      }
    };
    visit(join(SRC, "client.ts"));
    expect([...packages]).toEqual([]);
    expect(seen.size).toBeGreaterThan(3);
  });
});

// The guards must accept exactly what the schemas accept. Inputs are valid values plus single-field
// corruptions, which is where hand-written checks drift from schemas.

const isoDateTime = fc
  .date({
    min: new Date("2000-01-01T00:00:00Z"),
    max: new Date("2099-12-31T23:59:59Z"),
    noInvalidDate: true,
  })
  .map((date) => date.toISOString());
const weird = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.integer(),
  fc.double(),
  fc.boolean(),
  fc.string(),
  fc.constant([]),
  fc.constant({}),
  fc.constantFrom(
    "2026-02-30T10:00:00Z",
    "2026-09-23T25:00:00Z",
    "2026-09-23T10:00Z",
    "2026-09-23T10:00:00+05:30",
    "2026-09-23 10:00:00Z",
    "2026-09-23",
    "kv-",
    "kv-ok",
    "XX-1@cd119",
    "CA-12@cd120",
    "CA-123@cd120",
    "A000370",
    "fec:H6CA12345",
    "00000000-0000-4000-8000-000000000000",
    "not-a-uuid",
  ),
);

const personId = fc.oneof(
  fc.stringMatching(/^[A-Z]\d{6}$/),
  fc.stringMatching(/^[HSP][0-9][A-Z0-9]{2}[0-9]{5}$/).map((id) => `fec:${id}`),
);
const stance = fc.record({
  keyVoteId: fc.stringMatching(/^kv-[a-z0-9-]{1,12}$/),
  choice: fc.constantFrom("Yea", "Nay", "Skip"),
  weight: fc.constantFrom(1, 2, 3),
  answeredAt: isoDateTime,
});
const location = fc.record({
  state: fc.constantFrom("CA", "TX", "DC", "PR", "MO"),
  districts: fc.array(
    fc
      .tuple(
        fc.constantFrom("CA", "TX", "MO"),
        fc.integer({ min: 0, max: 53 }),
        fc.constantFrom("cd119", "cd120"),
      )
      .map(([state, number, map]) => `${state}-${number}@${map}`),
    { maxLength: 4 },
  ),
  ballotDistrictConfirmed: fc.boolean(),
  setAt: isoDateTime,
  method: fc.constantFrom("census-geocoder", "geocodio", "state-file", "manual"),
});
const ballotPlan = fc.record({
  electionId: fc.constantFrom("2026-11-03-general", "2026-12-12-runoff-LA"),
  entries: fc.array(
    fc.record({
      raceId: fc.string({ minLength: 1, maxLength: 20 }),
      choice: fc.oneof(
        fc.record({
          kind: fc.constant("candidacy"),
          candidacyId: fc.string({ minLength: 1, maxLength: 20 }),
        }),
        fc.record({ kind: fc.constant("undecided") }),
      ),
      note: fc.option(fc.string({ maxLength: 300 }), { nil: null }),
    }),
    { maxLength: 4 },
  ),
  updatedAt: isoDateTime,
});
const voter = fc.record({
  localId: fc.uuid(),
  schemaVersion: fc.constant(1),
  preferences: fc.record({ theme: fc.constantFrom("system", "light", "dark") }),
  consent: fc.constant({ analytics: false }),
  journey: fc.constantFrom("new", "swiping", "matched", "planning", "planned", "following"),
  stances: fc.array(stance, { maxLength: 6 }),
  location: fc.option(location, { nil: null }),
  ballotPlan: fc.option(ballotPlan, { nil: null }),
  following: fc.array(personId, { maxLength: 3 }),
});

/** Replaces one value anywhere inside `value` (found by a random path) with a weird value. */
function corrupt<T>(arbitrary: fc.Arbitrary<T>): fc.Arbitrary<unknown> {
  return fc.tuple(arbitrary, weird, fc.nat(), fc.nat()).map(([value, replacement, pick, depth]) => {
    const copy = structuredClone(value) as unknown;
    let node = copy as Record<string, unknown>;
    for (let level = 0; level <= depth % 4; level++) {
      if (typeof node !== "object" || node === null) break;
      const keys = Object.keys(node);
      if (keys.length === 0) break;
      const key = keys[(pick + level) % keys.length]!;
      const child = node[key];
      if (level === depth % 4 || typeof child !== "object" || child === null) {
        node[key] = replacement;
        break;
      }
      node = child as Record<string, unknown>;
    }
    return copy;
  });
}

describe("guards agree with the schemas", () => {
  const cases: Array<
    [
      string,
      fc.Arbitrary<unknown>,
      (value: unknown) => boolean,
      { safeParse(value: unknown): { success: boolean } },
    ]
  > = [
    ["Voter", voter, isVoter, Voter],
    ["Location", location, isLocation, Location],
  ];
  for (const [name, arbitrary, guard, schema] of cases) {
    test(`${name}: valid values`, () => {
      fc.assert(
        fc.property(arbitrary, (value) => {
          expect(guard(value)).toBe(true);
          expect(schema.safeParse(value).success).toBe(true);
        }),
        { numRuns: 300 },
      );
    });
    test(`${name}: corrupted values`, () => {
      fc.assert(
        fc.property(corrupt(arbitrary), (value) => {
          expect(guard(value)).toBe(schema.safeParse(value).success);
        }),
        { numRuns: 2000 },
      );
    });
  }

  const shareCard = fc.oneof(
    fc.record({
      kind: fc.constant("match"),
      personId,
      score: fc.double({ min: 0, max: 1, noNaN: true }),
      n: fc.integer({ min: 1, max: 64 }),
      agreements: fc.integer({ min: 0, max: 64 }),
    }),
    fc.record({ kind: fc.constant("duel"), a: personId, b: personId }),
    fc.record({
      kind: fc.constant("ballot"),
      electionId: fc.constant("2026-11-03-general"),
      races: fc.integer({ min: 0, max: 40 }),
      decided: fc.integer({ min: 0, max: 40 }),
    }),
  );
  const friendCompare = fc.record({
    v: fc.constant(1),
    stances: fc.array(
      fc.record({
        keyVoteId: fc.stringMatching(/^kv-[a-z0-9-]{1,12}$/),
        choice: fc.constantFrom("Yea", "Nay"),
        weight: fc.constantFrom(1, 2, 3),
      }),
      { maxLength: 8 },
    ),
  });
  test("ShareCard and FriendCompare guards", () => {
    fc.assert(
      fc.property(fc.oneof(shareCard, corrupt(shareCard)), (value) => {
        expect(isShareCard(value)).toBe(ShareCard.safeParse(value).success);
      }),
      { numRuns: 2000 },
    );
    fc.assert(
      fc.property(fc.oneof(friendCompare, corrupt(friendCompare)), (value) => {
        expect(isFriendCompare(value)).toBe(FriendCompare.safeParse(value).success);
      }),
      { numRuns: 2000 },
    );
  });
});
