import { describe, expect, test } from "vitest";
import { appointedUntilSpecial, missedVotesRule, SPEAKER } from "./voting-record";

describe("missed votes", () => {
  test("the Speaker gets an explanation, not a percentage", () => {
    const rule = missedVotesRule({ id: SPEAKER.personId, title: "U.S. Representative" });
    expect(rule.kind).toBe("speaker");
    expect(rule.kind !== "share" && rule.text).toContain("votes at their discretion");
  });

  test("delegates and the Resident Commissioner get an explanation, not a share of all roll calls", () => {
    expect(missedVotesRule({ id: "N000147", title: "Delegate" }).kind).toBe(
      "committee-of-the-whole",
    );
    const pr = missedVotesRule({ id: "H001103", title: "Resident Commissioner" });
    expect(pr.kind !== "share" && pr.text).toContain("Committee of the Whole");
  });

  test("everyone else gets the share", () => {
    expect(missedVotesRule({ id: "S000033", title: "U.S. Senator" }).kind).toBe("share");
    expect(missedVotesRule(undefined).kind).toBe("share");
  });
});

describe("appointed senators", () => {
  test("a Senate term ending on Election Day is an appointment until the special election", () => {
    expect(appointedUntilSpecial({ chamber: "senate", end: "2026-11-03" })).toBe(true);
    expect(appointedUntilSpecial({ chamber: "senate", end: "2027-01-03" })).toBe(false);
    expect(appointedUntilSpecial({ chamber: "house", end: "2026-11-03" })).toBe(false);
  });
});
