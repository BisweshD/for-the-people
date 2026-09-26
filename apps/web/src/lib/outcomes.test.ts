import { describe, expect, test } from "vitest";
import {
  measureKindNote,
  measureOutcome,
  measureShortName,
  plainVoteTitle,
  questionGloss,
  resultText,
  shortMeasureTitle,
  thresholdText,
} from "./outcomes";
import { requirementText, resultLabel, resultTone, voteMargin } from "./vote-margin";

/** Cases copied from the bundled snapshot (official BILLSTATUS latest actions and roll calls). */

const vote = (
  chamber: "house" | "senate",
  date: string,
  number: number,
  question: string,
  result: string,
) => ({
  chamber,
  date,
  number,
  question,
  result,
});
const RECONSIDER = "Motion to reconsider laid on the table Agreed to without objection.";
const OVERRIDE_QUESTION = "Passage, Objections of the President To The Contrary Notwithstanding";

describe("measure outcomes", () => {
  test("a concurrent resolution agreed to by both chambers is not 'Not law'", () => {
    const outcome = measureOutcome(
      {
        type: "hconres",
        becameLaw: false,
        latestAction: "Message on Senate action sent to the House.",
      },
      [
        vote("house", "2026-06-03", 199, "On Agreeing to the Resolution", "Passed"),
        vote(
          "senate",
          "2026-06-23",
          184,
          "On the Concurrent Resolution",
          "Concurrent Resolution Agreed to",
        ),
      ],
    );
    expect(outcome.label).toBe("Agreed to by both chambers");
    expect(outcome.note).toContain("does not go to the President");
  });

  test("a procedural latest action never decides the outcome", () => {
    const adopted = measureOutcome({ type: "hres", becameLaw: false, latestAction: RECONSIDER }, [
      vote("house", "2025-09-19", 282, "On Agreeing to the Resolution", "Passed"),
    ]);
    expect(adopted.label).toBe("Adopted by the House");
    const failed = measureOutcome({ type: "hconres", becameLaw: false, latestAction: RECONSIDER }, [
      vote("house", "2026-06-30", 232, "On Agreeing to the Resolution", "Failed"),
    ]);
    expect(failed.label).toBe("Not agreed to by the House");
  });

  test("a resolution the House tabled reads as tabled", () => {
    expect(
      measureOutcome(
        {
          type: "hres",
          becameLaw: false,
          latestAction: "On motion to table Agreed to by the Yeas and Nays",
        },
        [vote("house", "2025-09-03", 223, "On Motion to Table", "Passed")],
      ).label,
    ).toBe("Tabled");
  });

  test("bills: law, one chamber, failure, and no final vote", () => {
    expect(
      measureOutcome(
        { type: "hjres", becameLaw: true, latestAction: "Became Public Law No: 119-16." },
        [],
      ).label,
    ).toBe("Became law");
    expect(
      measureOutcome({ type: "hr", becameLaw: false, latestAction: "Received in the Senate." }, [
        vote("house", "2025-04-10", 101, "On Motion to Recommit", "Failed"),
        vote("house", "2025-04-10", 102, "On Passage", "Passed"),
      ]).label,
    ).toBe("Passed the House");
    expect(
      measureOutcome({ type: "sjres", becameLaw: false, latestAction: "Held at the desk." }, [
        vote("senate", "2025-10-30", 600, "On the Joint Resolution", "Joint Resolution Passed"),
      ]).label,
    ).toBe("Passed the Senate");
    expect(
      measureOutcome(
        {
          type: "hr",
          becameLaw: false,
          latestAction: "On motion to suspend the rules and pass the bill Failed",
        },
        [vote("house", "2026-06-11", 221, "On Motion to Suspend the Rules and Pass", "Failed")],
      ).label,
    ).toBe("Failed in the House");
    expect(
      measureOutcome(
        {
          type: "sjres",
          becameLaw: false,
          latestAction: "Motion to discharge Senate Committee on Foreign Relations rejected",
        },
        [
          vote(
            "senate",
            "2026-03-04",
            46,
            "On the Motion to Discharge",
            "Motion to Discharge Rejected",
          ),
        ],
      ).label,
    ).toBe("Not passed");
  });

  test("H.R. 131 and H.R. 504: vetoed, and the House failed to override", () => {
    const NOTIFY = "The Chair directed the Clerk to notify the Senate of the action of the House.";
    const hr131 = measureOutcome({ type: "hr", becameLaw: false, latestAction: NOTIFY }, [
      vote("house", "2026-01-08", 8, OVERRIDE_QUESTION, "Failed"),
    ]);
    expect(hr131).toEqual({
      label: "Vetoed; override failed in the House",
      tone: "failed",
      note: null,
    });
    const hr504 = measureOutcome({ type: "hr", becameLaw: false, latestAction: NOTIFY }, [
      vote("house", "2026-01-08", 9, OVERRIDE_QUESTION, "Failed"),
    ]);
    expect(hr504.label).toBe("Vetoed; override failed in the House");
  });

  test("a veto override names the chamber, and a successful override reads as such", () => {
    const passedBoth = [
      vote("house", "2026-02-01", 30, "On Passage", "Passed"),
      vote("senate", "2026-02-10", 40, "On Passage of the Bill", "Bill Passed"),
    ];
    expect(
      measureOutcome({ type: "hr", becameLaw: false, latestAction: "Vetoed by President." }, [
        ...passedBoth,
        vote("house", "2026-03-01", 50, "On Overriding the Veto", "Passed"),
        vote("senate", "2026-03-02", 60, "On Overriding the Veto", "Veto Sustained"),
      ]).label,
    ).toBe("Vetoed; override failed in the Senate");
    expect(
      measureOutcome(
        { type: "hr", becameLaw: false, latestAction: "Passed over veto in Senate." },
        [
          ...passedBoth,
          vote("house", "2026-03-01", 50, "On Overriding the Veto", "Passed"),
          vote("senate", "2026-03-02", 60, "On Overriding the Veto", "Veto Overridden"),
        ],
      ),
    ).toEqual({ label: "Vetoed; override succeeded", tone: "law", note: null });
    expect(
      measureOutcome(
        { type: "hr", becameLaw: true, latestAction: "Became Public Law No: 119-90." },
        [
          ...passedBoth,
          vote("house", "2026-03-01", 50, OVERRIDE_QUESTION, "Passed"),
          vote("senate", "2026-03-02", 60, "On Overriding the Veto", "Veto Overridden"),
        ],
      ).label,
    ).toBe("Became law");
  });

  test("a bill still under consideration or postponed has no final vote yet", () => {
    // S. 4668: cloture on the motion to proceed and the motion to proceed agreed to; now being considered.
    expect(
      measureOutcome(
        {
          type: "s",
          becameLaw: false,
          latestAction: "Considered by Senate. (consideration: CR S4851)",
        },
        [
          vote(
            "senate",
            "2026-09-15",
            235,
            "On Cloture on the Motion to Proceed",
            "Cloture on the Motion to Proceed Agreed to",
          ),
          vote(
            "senate",
            "2026-09-17",
            236,
            "On the Motion to Proceed",
            "Motion to Proceed Agreed to",
          ),
        ],
      ),
    ).toEqual({ label: "No final vote yet", tone: "pending", note: null });
    // H.R. 2270: a failed motion to recommit, then further proceedings postponed.
    expect(
      measureOutcome(
        {
          type: "hr",
          becameLaw: false,
          latestAction:
            "POSTPONED PROCEEDINGS - Pursuant to clause 1(c) of rule XIX, the Chair announced that further proceedings on H.R. 2270 is postponed.",
        },
        [vote("house", "2026-01-13", 20, "On Motion to Recommit", "Failed")],
      ).label,
    ).toBe("No final vote yet");
    // S. 2806: cloture was not invoked, but a motion to reconsider that vote is pending.
    expect(
      measureOutcome(
        {
          type: "s",
          becameLaw: false,
          latestAction:
            "Motion by Senator Thune to reconsider the vote by which cloture on the motion to proceed to S. 2806 was not invoked (Record Vote No. 533) made in Senate.",
        },
        [],
      ).label,
    ).toBe("No final vote yet");
  });

  test("a bill stopped by a failed vote to take it up reads as not passed", () => {
    expect(
      measureOutcome(
        {
          type: "s",
          becameLaw: false,
          latestAction:
            "Cloture on the motion to proceed to the measure not invoked in Senate by Yea-Nay Vote. 52 - 47. Record Vote Number: 11. (CR S294-295)",
        },
        [],
      ).label,
    ).toBe("Not passed");
    expect(
      measureOutcome(
        {
          type: "sjres",
          becameLaw: false,
          latestAction: "Indefinitely postponed by Senate by Unanimous Consent.",
        },
        [],
      ).label,
    ).toBe("Not passed");
  });

  test("H.R. 3944: both chambers passed it, but in different versions, and a conference is requested", () => {
    expect(
      measureOutcome(
        {
          type: "hr",
          becameLaw: false,
          latestAction:
            "Message on House action received in Senate and at desk: House requests a conference.",
        },
        [
          vote("house", "2025-06-25", 182, "On Passage", "Passed"),
          vote("house", "2025-09-11", 263, "On Motion to Instruct Conferees", "Failed"),
          vote("senate", "2025-08-01", 480, "On Passage of the Bill", "Bill Passed"),
        ],
      ),
    ).toEqual({ label: "Passed both chambers in different versions", tone: "passed", note: null });
  });

  test("a House bill passed by voice vote reads as passed from the Senate's receipt of it", () => {
    expect(
      measureOutcome({ type: "hr", becameLaw: false, latestAction: "Received in the Senate." }, [])
        .label,
    ).toBe("Passed the House");
  });
});

describe("roll call results", () => {
  test("supermajority thresholds are spelled out; simple majorities are not", () => {
    expect(thresholdText({ chamber: "house", requires: "2/3" })).toBe(
      "Needed two-thirds of those voting",
    );
    expect(thresholdText({ chamber: "senate", requires: "3/5" })).toBe(
      "Needed three-fifths of all senators (60 when every seat is filled)",
    );
    expect(thresholdText({ chamber: "house", requires: "1/2" })).toBeNull();
    expect(thresholdText({ chamber: "senate", requires: null })).toBeNull();
  });

  test("results read in sentence case on the page; the receipt keeps the clerk's words", () => {
    const vote = (question: string, result: string) => ({
      question,
      result,
      totals: { yea: 50, nay: 50, present: 0, notVoting: 0 },
    });
    expect(resultLabel(vote("On Passage of the Bill", "Bill Passed"))).toBe("Bill passed");
    expect(resultLabel(vote("On the Motion", "Motion Rejected"))).toBe("Motion rejected");
    expect(resultLabel(vote("On Passage", "Passed"))).toBe("Passed");
    expect(resultLabel(vote("Call of the House", "Passed"))).toBe("Quorum present, 0 answered");
  });

  test("procedural questions get a fixed plain-words gloss; unknown ones get none", () => {
    expect(questionGloss("On Motion to Concur in the Senate Amendment")).toBe(
      "A vote to accept the Senate's changes to the bill",
    );
    expect(questionGloss("On the Cloture Motion")).toBe(
      "A vote to end debate and move toward a final vote",
    );
    expect(questionGloss("On Cloture on the Motion to Proceed")).toBe(
      "A vote to end debate on whether to take up the measure",
    );
    expect(questionGloss("On Motion to Suspend the Rules and Pass, as Amended")).toBe(
      "A vote to pass the bill under a fast-track process that needs a two-thirds vote",
    );
    expect(questionGloss("On the Nomination")).toBe("A vote to confirm the nominee");
    // "The rule" is House jargon, so the gloss says what it is.
    expect(questionGloss("On Ordering the Previous Question")).toBe(
      "A vote to end debate on the rule (the terms for debating a bill) and vote on it",
    );
    expect(
      questionGloss("Passage, Objections of the President To The Contrary Notwithstanding"),
    ).toBe("A vote to override the President's veto");
    expect(questionGloss("On the Motion")).toBeNull();
    expect(
      questionGloss(
        "On the Motion",
        "Wyden Motion to Commit S. 2 to the Committee on the Judiciary with Instructions",
      ),
    ).toBe("A vote to send the bill back to committee with changes");
    expect(
      questionGloss("On the Motion", "Motion to Waive All Budgetary Discipline Re: Lee Amdt."),
    ).toBe("A vote to set aside a budget rule");
    expect(questionGloss("On the Motion", "Schumer Amdt. No. 12")).toBeNull();
    expect(questionGloss("On Retaining Division A")).toBeNull();
  });

  test("the roll call page names every requirement, a simple majority included", () => {
    expect(requirementText({ chamber: "house", requires: "1/2" })).toBe(
      "Needed a simple majority of those voting",
    );
    expect(requirementText({ chamber: "house", requires: "2/3" })).toBe(
      "Needed two-thirds of those voting",
    );
    expect(requirementText({ chamber: "senate", requires: null })).toBeNull();
  });

  test("a quorum call reads as members answering, not as passed", () => {
    expect(
      resultText({
        question: "Call of the House",
        result: "Passed",
        totals: { yea: 0, nay: 0, present: 406, notVoting: 24 },
      }),
    ).toBe("Quorum present, 406 answered");
    expect(
      resultText({
        question: "On Passage",
        result: "Passed",
        totals: { yea: 1, nay: 0, present: 0, notVoting: 0 },
      }),
    ).toBe("Passed");
  });
});

describe("short titles", () => {
  test("special rules read as the rule for the measure they bring up", () => {
    expect(
      shortMeasureTitle({
        display:
          "Providing for consideration of the bill (H.R. 9576) to establish the National Fraud Enforcement Division of the Department of Justice, and for other purposes.",
        short: null,
      }),
    ).toBe("Rule for considering H.R. 9576");
    expect(
      shortMeasureTitle({
        display:
          "Providing for consideration of the bill (H.R. 7148) making further consolidated appropriations; and providing for consideration of the joint resolution (H.J. Res. 12) relating to a national emergency.",
        short: null,
      }),
    ).toBe("Rule for considering H.R. 7148 and other measures");
    expect(
      shortMeasureTitle({
        display:
          "Providing for disposition of the Senate amendment to the bill (H.R. 7147) making further consolidated appropriations for the fiscal year ending September 30, 2026.",
        short: null,
      }),
    ).toBe("Rule for considering the Senate amendment to H.R. 7147");
  });

  test("a short title wins, and long titles are clipped at a word", () => {
    expect(shortMeasureTitle({ display: "Anything", short: "SAVE Act" })).toBe("SAVE Act");
    const clipped = shortMeasureTitle({ display: `${"word ".repeat(40)}end`, short: null });
    expect(clipped.length).toBeLessThanOrEqual(90);
    expect(clipped.endsWith("word…")).toBe(true);
  });
});

describe("measureKindNote", () => {
  // Official titles copied from the bundled snapshot (BILLSTATUS).
  test("a joint resolution proposing an amendment says it goes to the states, not the President", () => {
    expect(
      measureKindNote({
        type: "hjres",
        label: "H.J.Res. 139",
        officialTitle:
          "Proposing an amendment to the Constitution of the United States requiring a balanced budget for the Federal Government.",
      }),
    ).toBe(
      "H.J.Res. 139 is a joint resolution that proposes a change to the Constitution. It needs two-thirds of both the House and Senate, then approval by three-fourths of the states. It does not go to the President.",
    );
  });

  test("a Congressional Review Act resolution is named and explained", () => {
    const note = measureKindNote({
      type: "sjres",
      label: "S.J.Res. 103",
      officialTitle:
        'A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Department of Veterans Affairs relating to "Reproductive Health Services".',
    });
    expect(note).toBe(
      "S.J.Res. 103 is a joint resolution under the Congressional Review Act. It would cancel a rule from the Department of Veterans Affairs. Like a bill, it must pass the House and Senate. It becomes law when the President signs it, or when Congress overrides a veto.",
    );
    // "issued by" and a name without "the" read the same; a title that names no agency falls back.
    expect(
      measureKindNote({
        type: "sjres",
        label: "S.J.Res. 99",
        officialTitle:
          'A joint resolution providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by U.S. Citizenship and Immigration Services relating to "Removal of the Automatic Extension of Employment Authorization Documents".',
      }),
    ).toContain("It would cancel a rule from the U.S. Citizenship and Immigration Services.");
    expect(
      measureKindNote({
        type: "hjres",
        label: "H.J.Res. 213",
        officialTitle:
          'Providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule issued by the Environmental Protection Agency relating to the "California State Nonroad Engine Pollution Control Standards; Commercial Harbor Craft Regulations; Notice of Decision".',
      }),
    ).toContain("It would cancel a rule from the Environmental Protection Agency.");
    expect(
      measureKindNote({
        type: "hjres",
        label: "H.J.Res. 1",
        officialTitle:
          "Providing for congressional disapproval under chapter 8 of title 5 of a rule.",
      }),
    ).toContain("It would cancel a rule issued by a federal agency.");
  });

  test("any other joint resolution reads like a bill", () => {
    expect(
      measureKindNote({
        type: "hjres",
        label: "H.J.Res. 72",
        officialTitle: "Relating to a national emergency by the President on February 1, 2025.",
      }),
    ).toBe(
      "H.J.Res. 72 is a joint resolution. Like a bill, it must pass the House and Senate. It becomes law when the President signs it, or when Congress overrides a veto.",
    );
  });

  test("bills and simple or concurrent resolutions get no line (their outcome note covers them)", () => {
    for (const type of ["hr", "s", "hres", "sres", "hconres", "sconres"] as const)
      expect(measureKindNote({ type, label: "X", officialTitle: "To do a thing." })).toBeNull();
  });
});

describe("plain vote titles", () => {
  test("the gloss names the measure by its short name, else its number", () => {
    const concur = { question: "On Motion to Concur in the Senate Amendment", title: null };
    expect(plainVoteTitle(concur, "One Big Beautiful Bill Act")).toBe(
      "A vote to accept the Senate's changes to the One Big Beautiful Bill Act",
    );
    expect(plainVoteTitle(concur, "H.R. 1")).toBe(
      "A vote to accept the Senate's changes to H.R. 1",
    );
    expect(plainVoteTitle(concur, null)).toBe("A vote to accept the Senate's changes to the bill");
    expect(plainVoteTitle({ question: "On Passage of the Bill" }, "Laken Riley Act")).toBe(
      "A vote to pass the Laken Riley Act",
    );
    expect(plainVoteTitle({ question: "On the Joint Resolution" }, "H.J.Res. 88")).toBe(
      "A vote to pass H.J.Res. 88",
    );
    expect(plainVoteTitle({ question: "On the Amendment" }, "One Big Beautiful Bill Act")).toBe(
      "A vote to change the text of the One Big Beautiful Bill Act",
    );
    expect(plainVoteTitle({ question: "On Cloture on the Motion to Proceed" }, "GENIUS Act")).toBe(
      "A vote to end debate on whether to take up the GENIUS Act",
    );
  });

  test("a gloss that names no measure is kept as written, and an unknown question has none", () => {
    expect(plainVoteTitle({ question: "On the Nomination" }, "H.R. 1")).toBe(
      "A vote to confirm the nominee",
    );
    expect(plainVoteTitle({ question: "On Ordering the Previous Question" }, "H.Res. 566")).toBe(
      "A vote to end debate on the rule (the terms for debating a bill) and vote on it",
    );
    expect(plainVoteTitle({ question: "On the Point of No Return" }, "H.R. 1")).toBeNull();
  });

  test("a nomination names the nominee from the Senate's own description", () => {
    expect(
      plainVoteTitle({
        question: "On the Nomination",
        title:
          "Confirmation: Kara Marie Westercamp, of Virginia, to be a Judge of the U.S. Court of International Trade",
      }),
    ).toBe(
      "A vote to confirm Kara Marie Westercamp, of Virginia, to be a Judge of the U.S. Court of International Trade",
    );
    // Any other description keeps the fixed gloss.
    expect(
      plainVoteTitle({ question: "On the Nomination", title: "PN12-3: Jane Doe to be Ambassador" }),
    ).toBe("A vote to confirm the nominee");
  });

  test("the short name is the shorter of the popular and short titles, never a long title", () => {
    expect(measureShortName({ short: "One Big Beautiful Bill Act", popular: null })).toBe(
      "One Big Beautiful Bill Act",
    );
    expect(
      measureShortName({
        short: "Guiding and Establishing National Innovation for U.S. Stablecoins Act",
        popular: "GENIUS Act",
      }),
    ).toBe("GENIUS Act");
    expect(
      measureShortName({
        short: null,
        popular:
          "Directing the President, pursuant to section 5(c) of the War Powers Resolution, to remove United States Armed Forces from hostilities against the Islamic Republic of Iran",
      }),
    ).toBeNull();
    expect(measureShortName({ short: null, popular: null })).toBeNull();
  });
});

describe("vote margins", () => {
  const rollCall = (
    overrides: Partial<{
      chamber: "house" | "senate";
      question: string;
      result: string;
      requires: string | null;
      yea: number;
      nay: number;
      present: number;
      notVoting: number;
      tieBreaker: { by: string; vote: "Yea" | "Nay" } | null;
    }>,
  ) => {
    const { yea = 218, nay = 214, present = 0, notVoting = 0, ...rest } = overrides;
    return {
      chamber: "house" as const,
      question: "On Motion to Concur in the Senate Amendment",
      result: "Passed",
      requires: "1/2",
      tieBreaker: null,
      ...rest,
      totals: { yea, nay, present, notVoting },
    };
  };

  test("a simple majority reads as the margin, with the tick at the votes needed", () => {
    expect(voteMargin(rollCall({}))).toEqual({
      needed: 217,
      scale: 432,
      label: "Passed by 4 votes",
    });
    expect(
      voteMargin(rollCall({ chamber: "senate", result: "Motion Rejected", yea: 47, nay: 53 })),
    ).toEqual({ needed: 51, scale: 100, label: "Motion rejected by 6 votes" });
    expect(voteMargin(rollCall({ yea: 216, nay: 215 }))?.label).toBe("Passed by 1 vote");
  });

  test("a supermajority reads as the votes needed", () => {
    expect(
      voteMargin(
        rollCall({
          question: "On Motion to Suspend the Rules and Pass",
          requires: "2/3",
          yea: 300,
          nay: 100,
          present: 1,
        }),
      ),
    ).toEqual({ needed: 267, scale: 400, label: "Passed: 300 Yea, 267 needed" });
    expect(
      voteMargin(
        rollCall({
          chamber: "senate",
          question: "On the Cloture Motion",
          result: "Cloture Motion Rejected",
          requires: "3/5",
          yea: 51,
          nay: 47,
          notVoting: 2,
        }),
      ),
    ).toEqual({ needed: 60, scale: 98, label: "Cloture motion rejected: 51 Yea, 60 needed" });
    // Three-fifths of the senators sworn in, read from the roll call itself: 98 seats need 59.
    expect(
      voteMargin(
        rollCall({
          chamber: "senate",
          result: "Cloture Motion Agreed to",
          requires: "3/5",
          yea: 59,
          nay: 37,
          notVoting: 2,
        }),
      )?.needed,
    ).toBe(59);
  });

  test("the margin is left out whenever it would not match the official result", () => {
    // A tie the Vice President broke: the result stands, with no margin to state.
    expect(
      voteMargin(
        rollCall({
          chamber: "senate",
          yea: 50,
          nay: 50,
          tieBreaker: { by: "Vice President of the United States", vote: "Yea" },
        }),
      ),
    ).toEqual({ needed: 51, scale: 100, label: "Passed, 50 to 50" });
    // The count and the recorded result disagree: say only what the record says.
    expect(voteMargin(rollCall({ result: "Failed" }))?.label).toBe("Failed, 218 to 214");
    // No recorded requirement: no tick.
    expect(voteMargin(rollCall({ requires: null }))).toEqual({
      needed: null,
      scale: 432,
      label: "Passed, 218 to 214",
    });
  });

  test("a quorum call or a vote with no Yea or Nay has no bar", () => {
    expect(
      voteMargin(rollCall({ question: "Call of the House", yea: 0, nay: 0, present: 400 })),
    ).toBeNull();
    expect(voteMargin(rollCall({ yea: 0, nay: 0 }))).toBeNull();
  });

  test("a result's tone comes from the chamber's own words", () => {
    expect(resultTone("Passed")).toBe("passed");
    expect(resultTone("Motion to Table Agreed to")).toBe("passed");
    expect(resultTone("Cloture Motion Rejected")).toBe("failed");
    expect(resultTone("Failed")).toBe("failed");
    expect(resultTone("Veto Sustained")).toBeNull();
  });
});
