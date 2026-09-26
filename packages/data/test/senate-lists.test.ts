import type { FinanceSummary, Party } from "@for-the-people/core";
import { SourceId } from "@for-the-people/core";
import { describe, expect, test } from "vitest";
import type { BallotCandidate } from "../src/read/ballot";
import {
  applyStateList,
  matchStateList,
  SenateListFile,
  senateLists,
  stateListSource,
  stateListSourceById,
  type StateListRace,
} from "../src/read/senate-lists";

/** Official state Senate candidate lists (data/candidates-2026-senate.json) and how they meet FEC filings. */

const SOURCE = "src_00000000000000aa";

function filing(
  fecId: string,
  full: string,
  {
    party = "D" as Party,
    last = full.replace(/,.*$/, "").split(" ").at(-1)!,
    first = full.split(" ")[0]!,
    nickname = null as string | null,
    suffix = null as string | null,
    personId = `fec:${fecId}`,
    committee = null as string | null,
    incumbent = false,
  } = {},
): BallotCandidate {
  const finance: FinanceSummary | null = committee
    ? {
        personId,
        cycle: 2026,
        financeCommitteeId: committee,
        receipts: 1000,
        individual: 1000,
        smallDollarShare: null,
        pacs: 0,
        party: 0,
        selfFunding: 0,
        transfers: 0,
        cashOnHand: 0,
        debts: 0,
        inStateShare: null,
        asOf: "2026-06-30",
        sourceId: SOURCE,
      }
    : null;
  return {
    candidacy: {
      id: `race|${personId}`,
      personId,
      raceId: "race",
      party,
      status: "filed",
      incumbent,
      fecCandidateId: fecId,
      sourceIds: [SOURCE],
    },
    person: {
      id: personId,
      names: { full, first, last, nickname, suffix },
      portrait: null,
      bioguide: personId.startsWith("fec:") ? null : personId,
    },
    finance,
  };
}

const listed = (name: string, party: Party = "D", incumbent = false) => ({
  name,
  party,
  partyLabel: party === "D" ? "Democratic" : party === "R" ? "Republican" : "Other",
  incumbent,
  fecCandidateId: null,
});

function race(overrides: Partial<StateListRace> = {}): StateListRace {
  return {
    state: "CO",
    seatClass: 2,
    special: false,
    status: "certified",
    source: {
      url: "https://www.sos.state.co.us/pubs/elections/vote/generalCandidates.html",
      publisher: "Colorado Secretary of State",
      retrieved: "2026-09-23",
    },
    candidates: [listed("John Hickenlooper", "D", true)],
    ...overrides,
  };
}

const names = (filings: readonly BallotCandidate[]) => filings.map((f) => f.person.names.full);

describe("the bundled file", () => {
  test("validates, and every race is certified, from official primary results, or pending", async () => {
    const file = await senateLists();
    expect(file.races).toHaveLength(35);
    for (const entry of file.races) {
      expect(entry.source.url).toMatch(/^https:\/\//);
      if (entry.status === "pending") expect(entry.candidates).toEqual([]);
      else expect(entry.candidates.length).toBeGreaterThan(0);
    }
    const colorado = file.races.find((entry) => entry.state === "CO");
    expect(colorado?.status).toBe("certified");
    expect(file.races.find((entry) => entry.state === "TX")?.status).toBe("pending");
    expect(file.races.find((entry) => entry.state === "FL")).toMatchObject({
      seatClass: 3,
      special: true,
      status: "official-primary-results",
    });
  });

  test("rejects a list that contradicts its status, a non-https source, or a repeated seat", () => {
    const base = { asOf: "2026-09-23", note: "Official lists." };
    expect(SenateListFile.safeParse({ ...base, races: [race({ candidates: [] })] }).success).toBe(
      false,
    );
    expect(
      SenateListFile.safeParse({ ...base, races: [race({ status: "pending" })] }).success,
    ).toBe(false);
    expect(
      SenateListFile.safeParse({
        ...base,
        races: [
          race({
            source: {
              url: "http://example.org/list",
              publisher: "Colorado Secretary of State",
              retrieved: "2026-09-23",
            },
          }),
        ],
      }).success,
    ).toBe(false);
    expect(SenateListFile.safeParse({ ...base, races: [race(), race()] }).success).toBe(false);
    expect(SenateListFile.safeParse({ ...base, races: [race()] }).success).toBe(true);
  });
});

describe("the state list as a Receipt", () => {
  test("is a stable Source with the state's publisher and page, and resolves by id", async () => {
    const source = stateListSource(race());
    expect(SourceId.safeParse(source.id).success).toBe(true);
    expect(source).toMatchObject({
      publisher: "Colorado Secretary of State",
      url: "https://www.sos.state.co.us/pubs/elections/vote/generalCandidates.html",
      retrievedAt: "2026-09-23T00:00:00.000Z",
    });
    expect(stateListSource(race()).id).toBe(source.id);
    expect(stateListSource(race({ candidates: [listed("Mark Baisley", "R")] })).id).not.toBe(
      source.id,
    );

    const file = await senateLists();
    const colorado = stateListSource(file.races.find((entry) => entry.state === "CO")!);
    expect(await stateListSourceById(colorado.id)).toEqual(colorado);
    expect(await stateListSourceById("src_ffffffffffffffff")).toBeNull();
  });
});

describe("matching the state's names to FEC filings", () => {
  test("matches through middle names, nicknames, accents, and a one-letter spelling slip", () => {
    const filings = [
      filing("S0CO00575", "John W. Hickenlooper", { personId: "H000273" }),
      filing("S6DE00100", "Christopher A. Coons", { personId: "C001088", first: "Christopher" }),
      filing("S6MN00440", "Margaret Flanagan"),
      filing("S6FL00830", "Angela Nixon"),
      filing("S6IA00298", "Joshua Turek"),
      filing("S6IA00314", "Ashley Hinson Arenholz", { party: "R", last: "Arenholz" }),
      filing("S6WV00188", "Rachel Lee Fetty Anderson", { last: "Fetty Anderson" }),
      filing("S6NM00001", "Ben Ray Luján", { personId: "L000570", last: "Luján" }),
      filing("S6FL00863", "Neil Joseph Gilespie", { party: "O" }),
      filing("S6KY00286", "Andy Barr", {
        party: "R",
        personId: "B001282",
        first: "Garland",
        nickname: "Andy",
      }),
      filing("S6MS00001", "Cindy Hyde-Smith", { party: "R", last: "Hyde-Smith" }),
    ];
    const { entries, others } = matchStateList(
      [
        listed("John Hickenlooper"),
        listed("Chris Coons"),
        listed("Peggy Flanagan"),
        listed("Angie Nixon"),
        listed("Josh Turek"),
        listed("Ashley Hinson", "R"),
        listed("Rachel Fetty Anderson"),
        listed("Ben R. Lujan"),
        listed("Neil J. Gillespie", "O"),
        listed("Andy Barr", "R"),
        listed("Cindy Hyde-Smith", "R"),
      ],
      filings,
    );
    expect(
      Object.fromEntries(
        entries.map((entry) => [entry.listed.name, entry.filing?.person.names.full ?? null]),
      ),
    ).toEqual({
      "John Hickenlooper": "John W. Hickenlooper",
      "Chris Coons": "Christopher A. Coons",
      "Peggy Flanagan": "Margaret Flanagan",
      "Angie Nixon": "Angela Nixon",
      "Josh Turek": "Joshua Turek",
      "Ashley Hinson": "Ashley Hinson Arenholz",
      "Rachel Fetty Anderson": "Rachel Lee Fetty Anderson",
      "Ben R. Lujan": "Ben Ray Luján",
      "Neil J. Gillespie": "Neil Joseph Gilespie",
      "Andy Barr": "Andy Barr",
      "Cindy Hyde-Smith": "Cindy Hyde-Smith",
    });
    expect(others).toEqual([]);
  });

  test("tells two people with one last name apart by first name, middle initial, and suffix", () => {
    const { entries, others } = matchStateList(
      [listed("Dan S. Sullivan", "R", true), listed("Daniel J. Sullivan Jr.", "R")],
      [
        filing("S4AK00214", "Dan Sullivan", { party: "R", personId: "S001198", incumbent: true }),
        filing("S6AK00326", "Daniel J. Sullivan", { party: "R" }),
      ],
    );
    expect(entries.map((entry) => entry.filing?.candidacy.fecCandidateId)).toEqual([
      "S4AK00214",
      "S6AK00326",
    ]);
    expect(others).toEqual([]);

    const graham = matchStateList(
      [listed("Darline Graham", "R")],
      [
        filing("S6SC04437", "Darline Graham", { party: "R" }),
        filing("S0SC00149", "Lindsey Graham", { party: "R", personId: "G000359" }),
      ],
    );
    expect(graham.entries[0]!.filing?.person.id).toBe("fec:S6SC04437");
    expect(names(graham.others)).toEqual(["Lindsey Graham"]);
  });

  test("never matches on last name and party alone", () => {
    const { entries, others } = matchStateList(
      [listed("Marisa Simonetti", "I"), listed("Pat Smith")],
      [filing("S6MN00999", "Jordan Smith"), filing("S6MN00998", "Maria Simonetti", { party: "I" })],
    );
    expect(entries.map((entry) => entry.filing)).toEqual([null, null]);
    expect(names(others)).toEqual(["Maria Simonetti", "Jordan Smith"]);
  });

  test("an FEC id printed on the list wins over any name", () => {
    const { entries } = matchStateList(
      [{ ...listed("J. Doe"), fecCandidateId: "S6CO00999" }],
      [filing("S6CO00998", "J. Doe"), filing("S6CO00999", "Jane Doe")],
    );
    expect(entries[0]!.filing?.candidacy.fecCandidateId).toBe("S6CO00999");
  });

  test("uses each filing once, and drops a repeat filing of a matched campaign", () => {
    const { entries, others } = matchStateList(
      [listed("Bob Chew", "O")],
      [
        filing("S6CO00556", "Bob Chew", { party: "O", committee: "C00944298" }),
        filing("S6CO00549", "Robert Chew", { party: "O", committee: "C00944298" }),
        filing("S6CO00408", "Karen Breslin", { committee: "C00897488" }),
      ],
    );
    expect(entries[0]!.filing?.candidacy.fecCandidateId).toBe("S6CO00556");
    expect(names(others)).toEqual(["Karen Breslin"]);
  });
});

describe("applyStateList", () => {
  const coloradoFilings = [
    filing("S6CO00507", "Mark Baisley", { party: "R" }),
    filing("S6CO00408", "Karen Breslin"),
    filing("S6CO00556", "Bob Chew", { party: "O", committee: "C00944298" }),
    filing("S6CO00549", "Robert Chew", { party: "O", committee: "C00944298" }),
    filing("S0CO00575", "John W. Hickenlooper", { personId: "H000273", incumbent: true }),
    filing("S6CO00440", "Janak Joshi", { party: "R" }),
  ];
  const colorado = race({
    candidates: [
      listed("Mark Baisley", "R"),
      listed("John Hickenlooper", "D", true),
      { ...listed("Bob Chew", "O"), partyLabel: "Forward Party" },
      { ...listed("Christopher Baum", "O"), partyLabel: "Approval Voting Party" },
    ],
  });

  test("a certified list names the choices, alphabetically, and sets FEC filers aside", () => {
    const applied = applyStateList(colorado, coloradoFilings);
    expect(applied.status).toBe("certified");
    expect(applied.source).toEqual(stateListSource(colorado));
    expect(applied.entries.map((entry) => entry.name)).toEqual([
      "Mark Baisley",
      "Christopher Baum",
      "Bob Chew",
      "John Hickenlooper",
    ]);
    const baum = applied.entries.find((entry) => entry.name === "Christopher Baum")!;
    expect(baum).toMatchObject({ party: "O", partyLabel: "Approval Voting Party", filing: null });
    expect(
      applied.entries.find((entry) => entry.name === "John Hickenlooper")?.filing?.person.id,
    ).toBe("H000273");
    expect(names(applied.otherFilings)).toEqual(["Karen Breslin", "Janak Joshi"]);
  });

  test("the state's incumbent flag goes with each name on its list", () => {
    const applied = applyStateList(colorado, coloradoFilings);
    expect(
      applied.entries.filter((entry) => entry.incumbent).map((entry) => entry.name),
    ).toEqual(["John Hickenlooper"]);
  });

  test("a pending race keeps the FEC list as it is and carries the file's reason", () => {
    const texas = race({
      state: "TX",
      status: "pending",
      candidates: [],
      note: "The certified ballot list could not be read automatically.",
    });
    const applied = applyStateList(texas, coloradoFilings);
    expect(applied).toMatchObject({
      status: "pending",
      entries: [],
      otherFilings: [],
      note: "The certified ballot list could not be read automatically.",
    });
  });
});
