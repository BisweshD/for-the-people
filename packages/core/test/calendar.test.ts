import { describe, expect, test } from "vitest";
import {
  ELECTION_DAY_EVENT,
  escapeText,
  foldLine,
  icsCalendar,
  type CalendarEvent,
} from "../src/calendar";

const encoder = new TextEncoder();
const unfold = (ics: string) => ics.replace(/\r\n /g, "");

describe("icsCalendar", () => {
  const ics = icsCalendar([ELECTION_DAY_EVENT], "-//For The People//Election Day//EN");

  test("is a valid VCALENDAR with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
    const lines = unfold(ics).split("\r\n");
    expect(lines).toContain("PRODID:-//For The People//Election Day//EN");
    expect(lines.filter((line) => line === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((line) => line === "END:VEVENT")).toHaveLength(1);
  });

  test("Election Day is an all-day event on Nov 3, 2026, ending the next day", () => {
    const lines = unfold(ics).split("\r\n");
    expect(lines).toContain("DTSTART;VALUE=DATE:20261103");
    expect(lines).toContain("DTEND;VALUE=DATE:20261104");
    expect(lines).toContain("DTSTAMP:20260923T000000Z");
    expect(lines).toContain(`UID:${ELECTION_DAY_EVENT.uid}`);
    expect(lines).toContain("TRIGGER:-PT900M");
  });

  test("no line is longer than 75 octets", () => {
    for (const line of ics.split("\r\n"))
      expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
  });

  test("text values are escaped and survive folding", () => {
    const event: CalendarEvent = {
      ...ELECTION_DAY_EVENT,
      summary: "Vote; bring ID, maybe\nand a pen \\ pencil",
      description: "é".repeat(120),
      url: null,
      reminderMinutes: null,
    };
    const out = unfold(icsCalendar([event], "-//test//EN"));
    expect(out).toContain("SUMMARY:Vote\\; bring ID\\, maybe\\nand a pen \\\\ pencil");
    expect(out).toContain(`DESCRIPTION:${"é".repeat(120)}`);
    expect(out).not.toContain("BEGIN:VALARM");
    expect(out).not.toContain("URL:");
  });

  test("months roll over for the end date", () => {
    const out = icsCalendar([{ ...ELECTION_DAY_EVENT, date: "2026-12-31" }], "-//test//EN");
    expect(out).toContain("DTEND;VALUE=DATE:20270101");
  });

  test("rejects malformed dates", () => {
    expect(() => icsCalendar([{ ...ELECTION_DAY_EVENT, date: "Nov 3" }], "-//test//EN")).toThrow();
  });
});

describe("helpers", () => {
  test("escapeText escapes backslash first", () => {
    expect(escapeText("a\\,b")).toBe("a\\\\\\,b");
  });

  test("foldLine never splits a multi-byte character", () => {
    const folded = foldLine(`X:${"€".repeat(40)}`);
    for (const part of folded.split("\r\n ")) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
      expect(part).not.toContain("�");
    }
    expect(folded.replace(/\r\n /g, "")).toBe(`X:${"€".repeat(40)}`);
  });
});
