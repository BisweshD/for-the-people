import type { MeasureType } from "@for-the-people/core/client";
import { describe, expect, test } from "vitest";
import { countryName, groupSponsored } from "./sponsored";

/** Official titles copied from the bundled snapshot (Congress.gov BILLSTATUS). */

const measure = (id: string, display: string, short: string | null = null) => ({
  id,
  type: id.split("-")[1] as MeasureType,
  titles: { display, short },
});

const ISRAEL_SALE =
  "A joint resolution providing for congressional disapproval of the proposed foreign military sale to the Government of Israel of certain defense articles and services.";

describe("groupSponsored", () => {
  test("arms-sale disapprovals with different wording merge under one plain title", () => {
    const groups = groupSponsored([
      measure("119-sjres-138", ISRAEL_SALE),
      measure("119-sjres-32", ISRAEL_SALE),
      measure(
        "119-sjres-41",
        "A joint resolution providing for congressional disapproval of the proposed export of certain defense articles to Israel.",
      ),
      measure(
        "119-sjres-26",
        "A joint resolution providing for congressional disapproval of the proposed foreign military sale to Israel of certain defense articles and services.",
      ),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      title: "Block arms sales to Israel",
      count: "4 resolutions",
      officialTitle: null,
    });
    expect(groups[0]!.items.map((item) => item.measure.id)).toEqual([
      "119-sjres-138",
      "119-sjres-32",
      "119-sjres-41",
      "119-sjres-26",
    ]);
    expect(groups[0]!.items.every((item) => item.detail === null)).toBe(true);
  });

  test("a group of identical titles keeps the official title for reference", () => {
    const [group] = groupSponsored([
      measure("119-sjres-138", ISRAEL_SALE),
      measure("119-sjres-32", ISRAEL_SALE),
    ]);
    expect(group!.officialTitle).toBe(ISRAEL_SALE);
    expect(group!.count).toBe("2 resolutions");
  });

  test("special rules merge, and each keeps the bill it sets up", () => {
    const groups = groupSponsored([
      measure(
        "119-hres-1142",
        "Providing for disposition of the Senate amendment to the bill (H.R. 7147) making further consolidated appropriations for the fiscal year ending September 30, 2026, and for other purposes.",
      ),
      measure(
        "119-hres-122",
        'Providing for consideration of the bill (H.R. 77) to amend chapter 8 of title 5, United States Code, to provide for en bloc consideration in resolutions of disapproval for "midnight rules", and for other purposes.',
      ),
      measure(
        "119-hres-5",
        "Adopting the Rules of the House of Representatives for the One Hundred Nineteenth Congress, and for other purposes.",
      ),
    ]);
    expect(groups.map((group) => group.title)).toEqual([
      "Rules for considering other measures",
      "Adopting the Rules of the House of Representatives for the One Hundred Nineteenth…",
    ]);
    expect(groups[0]!.items.map((item) => item.detail)).toEqual([
      "For the Senate amendment to H.R. 7147",
      "For H.R. 77",
    ]);
    expect(groups[1]!.count).toBeNull();
  });

  test("a rule is a rule even when its title names a disapproval resolution it sets up", () => {
    const groups = groupSponsored([
      measure(
        "119-hres-1530",
        "Providing for consideration of the bill (H.R. 9576) to establish the National Fraud Enforcement Division of the Department of Justice; providing for consideration of the joint resolution (H.J. Res. 210) providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to ‘‘California State Nonroad Engine Pollution Control Standards; Ocean-Going Vessels At-Berth; Notice of Decision''; and for other purposes.",
      ),
      measure(
        "119-hres-211",
        'Providing for consideration of the joint resolution (H.J. Res. 25) providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Internal Revenue Service relating to "Gross Proceeds Reporting by Brokers That Regularly Provide Services Effectuating Digital Asset Sales"; providing for consideration of the bill (H.R. 1156) to amend the CARES Act to extend the statute of limitations for fraud under certain unemployment programs, and for other purposes; providing for consideration of the bill (H.R. 1968) making further continuing appropriations and other extensions for the fiscal year ending September 30, 2025, and for other purposes; and for other purposes.',
      ),
    ]);
    expect(groups.map((group) => [group.title, group.count])).toEqual([
      ["Rules for considering other measures", "2 resolutions"],
    ]);
    expect(groups[0]!.items.map((item) => item.detail)).toEqual([
      "For H.R. 9576 and other measures",
      "For H.J. Res. 25 and other measures",
    ]);
  });

  test("a disapproval title without 'for' still reads as overturning a rule", () => {
    const [group] = groupSponsored([
      measure(
        "119-hjres-88",
        'Providing congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to "California State Motor Vehicle Pollution Control Standards".',
      ),
    ]);
    expect(group!.title).toBe("Overturn a rule from the Environmental Protection Agency");
  });

  test("a single special rule keeps its own short title and no repeated detail", () => {
    const [group] = groupSponsored([
      measure(
        "119-hres-873",
        "Providing for consideration of the Senate amendment to the bill (H.R. 5371) making continuing appropriations and extensions for fiscal year 2026, and for other purposes.",
      ),
    ]);
    expect(group!.title).toBe("Rule for considering the Senate amendment to H.R. 5371");
    expect(group!.items[0]!.detail).toBeNull();
  });

  test("Congressional Review Act resolutions name the agency, and each row names its rule", () => {
    const [group] = groupSponsored([
      measure(
        "119-hjres-60",
        'Providing for congressional disapproval under chapter 8 of title 5, United States Code, of the rule submitted by the Environmental Protection Agency relating to "California State Motor Vehicle and Engine Pollution Control Standards; Heavy-Duty Vehicle and Engine Emission Warranty and Maintenance Provisions".',
      ),
    ]);
    expect(group!.title).toBe("Overturn a rule from the Environmental Protection Agency");
    expect(group!.items[0]!.detail).toBe(
      "California State Motor Vehicle and Engine Pollution Control Standards…",
    );
  });

  test("war powers, emergencies, budgets and en bloc nominations get plain titles", () => {
    const titles = groupSponsored([
      measure(
        "119-sjres-59",
        "A joint resolution to direct the removal of United States Armed Forces from hostilities within or against the Islamic Republic of Iran that have not been authorized by Congress.",
      ),
      measure(
        "119-hconres-38",
        "Directing the President, pursuant to section 5(c) of the War Powers Resolution, to remove United States Armed Forces from hostilities with Iran.",
      ),
      measure(
        "119-sjres-37",
        "A joint resolution terminating the national emergency declared to impose duties on articles imported from Canada.",
      ),
      measure(
        "119-sjres-49",
        "A joint resolution terminating the national emergency declared to impose global tariffs.",
      ),
      measure(
        "119-sconres-7",
        "An original concurrent resolution setting forth the congressional budget for the United States Government for fiscal year 2025 and setting forth the appropriate budgetary levels for fiscal years 2026 through 2034.",
      ),
      measure(
        "119-sres-412",
        "An executive resolution authorizing the en bloc consideration in Executive Session of certain nominations on the Executive Calendar.",
      ),
    ]).map((group) => [group.title, group.count]);
    expect(titles).toEqual([
      ["Remove U.S. forces from hostilities with Iran", "2 resolutions"],
      ["End the national emergency behind tariffs on Canada", null],
      ["End the national emergency behind global tariffs", null],
      ["Congressional budget for fiscal year 2025", null],
      ["Consider nominations as a group", null],
    ]);
  });

  test("a short title wins, and bills and resolutions together count as measures", () => {
    const groups = groupSponsored([
      measure("119-s-2", "Secure America Act", "Secure America Act"),
      measure("119-hr-9", "Secure America Act", "Secure America Act"),
      measure("119-sres-9", "Secure America Act", "Secure America Act"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ title: "Secure America Act", count: "3 measures" });
  });
});

describe("countryName", () => {
  test.each([
    ["the Government of Israel", "Israel"],
    ["the Islamic Republic of Iran", "Iran"],
    ["the Republic of Cuba", "Cuba"],
    ["the Kingdom of Saudi Arabia", "Saudi Arabia"],
    ["Venezuela", "Venezuela"],
    ["the United Arab Emirates", "United Arab Emirates"],
  ])("%s is %s", (raw, name) => {
    expect(countryName(raw)).toBe(name);
  });
});
