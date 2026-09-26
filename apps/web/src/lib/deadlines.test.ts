import { describe, expect, test } from "vitest";
import { daysBefore, nextDeadline } from "./deadlines";

/** Wording copied from data/election-dates.json (vote.gov). */

describe("daysBefore", () => {
  test.each([
    ["29 days before Election Day", 29],
    ["Must be postmarked 30 days before Election Day", 30],
    ["Must be postmarked 15 days before and received 10 days before Election Day", 15],
    ["Available up to and including on Election Day", 0],
    ["Must be received by or on Election Day", 0],
    ["Same day registration available during early voting period", null],
  ])("%s", (wording, days) => {
    expect(daysBefore(wording)).toBe(days);
  });
});

describe("nextDeadline", () => {
  test("Florida: the channels that share the first deadline are named together", () => {
    expect(
      nextDeadline(
        {
          online: "29 days before Election Day",
          mail: "Must be postmarked 29 days before Election Day",
          inPerson: "29 days before Election Day",
        },
        41,
      ),
    ).toEqual({ channels: ["online", "in person"], wording: "29 days before Election Day" });
  });

  test("the deadline that closes first comes first", () => {
    expect(
      nextDeadline(
        {
          online: "15 days before Election Day",
          mail: "Must be postmarked 30 days before Election Day",
          inPerson: "Available up to and including on Election Day",
        },
        41,
      ),
    ).toEqual({ channels: ["by mail"], wording: "Must be postmarked 30 days before Election Day" });
  });

  test("a deadline that has passed gives way to the next one", () => {
    expect(
      nextDeadline(
        {
          online: "15 days before Election Day",
          mail: "Must be postmarked 30 days before Election Day",
          inPerson: "Available up to and including on Election Day",
        },
        20,
      ),
    ).toEqual({ channels: ["online"], wording: "15 days before Election Day" });
  });

  test("without today's count, the earliest deadline is shown", () => {
    expect(
      nextDeadline({ online: null, mail: "8 days before Election Day", inPerson: null }, null),
    ).toEqual({ channels: ["by mail"], wording: "8 days before Election Day" });
  });

  test("wording with no day count is kept when nothing else is open", () => {
    expect(
      nextDeadline(
        {
          online: "10 days before Election Day",
          mail: null,
          inPerson: "Same day registration available during early voting period",
        },
        5,
      ),
    ).toEqual({
      channels: ["in person"],
      wording: "Same day registration available during early voting period",
    });
  });

  test("no open deadline, or none on file, is null", () => {
    expect(
      nextDeadline({ online: "29 days before Election Day", mail: null, inPerson: null }, 3),
    ).toBeNull();
    expect(nextDeadline({ online: null, mail: null, inPerson: null }, 41)).toBeNull();
  });
});
