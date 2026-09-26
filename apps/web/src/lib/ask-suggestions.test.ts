import type { Location, Stance } from "@for-the-people/core/client";
import { describe, expect, test } from "vitest";
import { classifyQuestion } from "@/server/ask/mock-model";
import {
  billName,
  billQuestion,
  MAX_SUGGESTION,
  personalSuggestion,
  starterSuggestions,
  suggestionsFor,
  type AskSenator,
} from "./ask-suggestions";
import type { CardView, MemberView } from "./views";

const card = (id: string, label: string, title: string) =>
  ({ id, measures: [{ id: `119-${label}`, label, title }] }) as unknown as CardView;

// Titles as Congress.gov records them (data/snapshot measures.title_display).
const cards = [
  card("kv-save-act", "H.R. 22", "SAVE Act"),
  card("kv-ukraine-aid", "H.R. 2913", "Ukraine Support Act"),
  card("kv-federal-worker-unions", "H.R. 2550", "Protect America's Workforce Act"),
  card("kv-obbba", "H.R. 1", "One Big Beautiful Bill Act"),
  card("kv-laken-riley", "S. 5", "Laken Riley Act"),
  card(
    "kv-haiti-tps",
    "H.R. 1689",
    "To require the Secretary of Homeland Security to designate Haiti for temporary protected status.",
  ),
];

const senator = (name: string, lastName: string, state: string): AskSenator => ({
  name,
  lastName,
  state,
  portrait: null,
});
const senators = [
  senator("Ted Cruz", "Cruz", "TX"),
  senator("John Cornyn", "Cornyn", "TX"),
  senator("Catherine Cortez Masto", "Cortez Masto", "NV"),
  senator("Jacky Rosen", "Rosen", "NV"),
];

const location = (state: string): Location => ({
  state: state as Location["state"],
  districts: [],
  ballotDistrictConfirmed: true,
  setAt: "2026-09-23T15:00:00.000Z",
  method: "census-geocoder",
});

const stance = (
  keyVoteId: string,
  choice: Stance["choice"],
  weight: Stance["weight"],
  minute: number,
) => ({
  keyVoteId,
  choice,
  weight,
  answeredAt: `2026-09-23T15:${String(minute).padStart(2, "0")}:00.000Z`,
});

const TODAY = "2026-09-24";

/** The day after `date`, as YYYY-MM-DD. */
const nextDay = (date: string) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

describe("billQuestion", () => {
  test("names a bill by its short title, and by its number when the title is not a name", () => {
    expect(billQuestion({ label: "S. 5", title: "Laken Riley Act" })).toBe(
      "What is the Laken Riley Act?",
    );
    expect(billName("One Big Beautiful Bill Act")).toBe("One Big Beautiful Bill Act");
    expect(
      billQuestion({
        label: "H.R. 1689",
        title:
          "To require the Secretary of Homeland Security to designate Haiti for temporary protected status.",
      }),
    ).toBe("What is H.R. 1689?");
    expect(
      billName(
        "A joint resolution terminating the national emergency declared to impose global tariffs.",
      ),
    ).toBeNull();
    // A name too long for one line falls back to the number, never a shortened, invented name.
    expect(billQuestion({ label: "H.R. 2550", title: "Protect America's Workforce Act" })).toBe(
      "What is H.R. 2550?",
    );
  });
});

describe("starterSuggestions", () => {
  test("every question fits one line and bill rows carry the bill number", () => {
    const members = [
      { id: "C001098", portrait: { asset: "/p/C001098", sourceId: "src_c", placeholder: null } },
    ] as unknown as MemberView[];
    const starters = starterSuggestions(members, cards, TODAY);
    expect(starters.length).toBeGreaterThanOrEqual(5);
    for (const suggestion of starters)
      expect(suggestion.question.length).toBeLessThanOrEqual(MAX_SUGGESTION);
    expect(starters.find((entry) => entry.question.includes("SAVE Act"))?.lead).toEqual({
      kind: "bill",
      label: "H.R. 22",
    });
    expect(starters.find((entry) => entry.question.includes("Ted Cruz"))?.lead).toEqual({
      kind: "people",
      people: [
        {
          name: "Ted Cruz",
          portrait: { asset: "/p/C001098", sourceId: "src_c", placeholder: null },
        },
      ],
    });
  });

  test("bills are named alike, by their short titles, and both senators by their full names", () => {
    const questions = starterSuggestions([], cards, TODAY).map((entry) => entry.question);
    expect(questions).toContain("What is the SAVE Act?");
    expect(questions).toContain("What is the Ukraine Support Act?");
    // No bill is asked about by number when it has a short title that fits.
    expect(questions.filter((question) => /\b(H\.R\.|S\.) \d/.test(question))).toEqual([]);
    expect(questions.some((question) => question.includes("Ted Cruz"))).toBe(true);
    expect(questions.some((question) => question.includes("Chuck Schumer"))).toBe(true);
  });

  test("the first row rotates by day, over the same balanced set", () => {
    const days = [TODAY];
    while (days.length < 6) days.push(nextDay(days.at(-1)!));
    const lists = days.map((day) => starterSuggestions([], cards, day).map((row) => row.question));
    // Every starter leads on one of six days in a row; the set of rows never changes.
    expect(new Set(lists.map((list) => list[0])).size).toBe(6);
    for (const list of lists) expect(list.toSorted()).toEqual(lists[0]!.toSorted());
    // The first row is never the same side two days running.
    const leads = lists.map((list) => list[0]!);
    const side = (question: string) =>
      /Ted Cruz|SAVE Act/.test(question)
        ? "R"
        : /Chuck Schumer|Ukraine Support Act/.test(question)
          ? "D"
          : "neither";
    for (let index = 1; index < leads.length; index++) {
      const [before, after] = [side(leads[index - 1]!), side(leads[index]!)];
      if (before !== "neither") expect(after).not.toBe(before);
    }
  });

  test("the demo model answers every starter", () => {
    for (const { question, lead } of starterSuggestions([], cards, TODAY)) {
      expect(["unknown", "refuse"], question).not.toContain(classifyQuestion(question).kind);
      // A bill row is looked up as a bill, never read as a person named "Ukraine Support".
      if (lead.kind === "bill") expect(classifyQuestion(question).kind, question).toBe("measure");
    }
  });
});

describe("personalSuggestion", () => {
  test("nothing on the device means no personal row", () => {
    expect(personalSuggestion({ stances: [], location: null }, senators, cards)).toBeNull();
  });

  test("a saved location asks about the voter's own senator", () => {
    expect(
      personalSuggestion({ stances: [], location: location("TX") }, senators, cards),
    ).toMatchObject({ question: "How has John Cornyn voted?", note: "Your senator" });
  });

  test("a long name falls back to a shorter form that still fits", () => {
    const suggestion = personalSuggestion(
      { stances: [], location: location("NV") },
      senators,
      cards,
    );
    expect(suggestion?.question).toBe("How has Sen. Cortez Masto voted?");
    expect(suggestion!.question.length).toBeLessThanOrEqual(MAX_SUGGESTION);
  });

  test("without a location, the most-weighted answer's bill is asked about", () => {
    const stances = [
      stance("kv-save-act", "Nay", 2, 0),
      stance("kv-obbba", "Yea", 3, 1),
      stance("kv-federal-worker-unions", "Skip", 3, 2),
    ];
    // "What is the One Big Beautiful Bill Act?" is too long for one line, so the number names it.
    expect(personalSuggestion({ stances, location: null }, senators, cards)).toEqual({
      question: "What is H.R. 1?",
      lead: { kind: "bill", label: "H.R. 1" },
      note: "You answered Yea",
    });
  });

  test("a bill is named like the fixed rows, and replaces the fixed row for it", () => {
    const stances = [stance("kv-save-act", "Nay", 2, 0)];
    const personal = personalSuggestion({ stances, location: null }, senators, cards);
    expect(personal?.question).toBe("What is the SAVE Act?");
    const rows = suggestionsFor(personal, starterSuggestions([], cards, TODAY));
    expect(rows.filter((row) => row.lead.kind === "bill" && row.lead.label === "H.R. 22")).toEqual([
      personal,
    ]);
  });
});

describe("suggestionsFor", () => {
  test("the personal row comes first and is not repeated", () => {
    const starters = starterSuggestions([], cards, TODAY);
    const personal = { ...starters[1]!, note: "You answered Nay" };
    const rows = suggestionsFor(personal, starters);
    expect(rows[0]).toBe(personal);
    expect(rows.filter((row) => row.question === personal.question)).toHaveLength(1);
    expect(suggestionsFor(null, starters)).toEqual(starters);
  });
});
