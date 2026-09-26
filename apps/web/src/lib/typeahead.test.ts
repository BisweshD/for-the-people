import { describe, expect, test } from "vitest";
import { typeaheadMatch } from "./typeahead";

const STATES = ["Alabama", "Florida", "Georgia", "Nebraska", "Nevada", "New Hampshire", "New York"];

describe("typeaheadMatch", () => {
  test("letters typed together narrow the match", () => {
    expect(typeaheadMatch(STATES, 0, "f")).toBe(1);
    expect(typeaheadMatch(STATES, 1, "flo")).toBe(1);
    expect(typeaheadMatch(STATES, 3, "new")).toBe(5);
    expect(typeaheadMatch(STATES, 5, "new y")).toBe(6);
  });

  test("one letter moves on from the current option, wrapping around", () => {
    expect(typeaheadMatch(STATES, 3, "n")).toBe(4);
    expect(typeaheadMatch(STATES, 6, "n")).toBe(3);
  });

  test("the same letter repeated cycles through the options that start with it", () => {
    expect(typeaheadMatch(STATES, 4, "nn")).toBe(5);
  });

  test("case does not matter, and no match keeps the current option", () => {
    expect(typeaheadMatch(STATES, 0, "GEO")).toBe(2);
    expect(typeaheadMatch(STATES, 2, "xyz")).toBe(2);
    expect(typeaheadMatch(STATES, -1, "zzz")).toBe(-1);
  });
});
