import { describe, expect, test } from "vitest";
import { mapScaleCaption } from "./map-caption";

describe("mapScaleCaption", () => {
  test("when every member in view has a value, one count", () => {
    expect(mapScaleCaption({ mode: "party", scope: "members", scored: 539, total: 539 })).toBe(
      "Median share of votes with their party, from 539 members",
    );
  });

  test("a smaller count than the members in view says how many of them and why", () => {
    // 12 answers: 6 delegates and 4 members sworn in after those votes share none of them (529 of 539).
    expect(mapScaleCaption({ mode: "match", scope: "members", scored: 529, total: 539 })).toBe(
      "Median match with you, from the 529 of 539 members who share a vote with you",
    );
    expect(
      mapScaleCaption({ mode: "party", scope: "House members", scored: 430, total: 432 }),
    ).toBe(
      "Median share of votes with their party, from the 430 of 432 House members with votes to count",
    );
  });
});
