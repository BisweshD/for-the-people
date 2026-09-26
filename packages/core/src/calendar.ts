import * as z from "zod";
import { Source } from "./civic";
import { StateCode } from "./ids";

/**
 * Election key dates by state and the calendar file for Election Day.
 * Deadlines are kept in the official wording (vote.gov states them relative to Election Day), never
 * converted into guessed calendar dates: a deadline that lands on a weekend or holiday follows each
 * state's own rule.
 */

export const GENERAL_ELECTION_2026 = "2026-11-03";

const httpUrl = z.url({ protocol: /^https?$/ });

export const StateElectionInfo = z.object({
  state: StateCode,
  name: z.string().min(1),
  /** The official page this entry was read from, with its retrieval date and content hash. */
  source: Source,
  /** The "Last updated" date printed on the official page, when it shows one. */
  pageUpdated: z.iso.date().nullable(),
  /** False where the state has no voter registration (North Dakota). */
  registrationRequired: z.boolean(),
  /** Official wording for each way to register; null when the page gives no deadline for it. */
  deadlines: z.object({
    online: z.string().min(1).nullable(),
    mail: z.string().min(1).nullable(),
    inPerson: z.string().min(1).nullable(),
  }),
  /** True when the official page says the state does not offer online registration. */
  onlineRegistrationOffered: z.boolean(),
  links: z.object({
    checkRegistration: httpUrl.nullable(),
    registerOnline: httpUrl.nullable(),
    electionOffice: httpUrl,
  }),
});
export type StateElectionInfo = z.infer<typeof StateElectionInfo>;

export const ElectionDatesFile = z.object({
  schema: z.literal("for-the-people.electionDates"),
  version: z.literal(1),
  electionDay: z.iso.date(),
  note: z.string().min(1),
  states: z.array(StateElectionInfo).length(51),
});
export type ElectionDatesFile = z.infer<typeof ElectionDatesFile>;

/** An all-day calendar event. */
export interface CalendarEvent {
  uid: string;
  /** YYYY-MM-DD. */
  date: string;
  summary: string;
  description: string;
  url: string | null;
  /** When this event's content was written (ISO datetime); required by RFC 5545 as DTSTAMP. */
  stamp: string;
  /** Minutes before the start to remind, or null for no reminder. */
  reminderMinutes: number | null;
}

/** Escapes a TEXT value (RFC 5545 section 3.3.11). */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const encoder = new TextEncoder();

/** Folds a content line at 75 octets without splitting a UTF-8 character (RFC 5545 section 3.1). */
export function foldLine(line: string): string {
  const parts: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    const limit = parts.length === 0 ? 75 : 74;
    if (octets + size > limit) {
      parts.push(current);
      current = "";
      octets = 0;
    }
    current += char;
    octets += size;
  }
  parts.push(current);
  return parts.join("\r\n ");
}

const compactDate = (date: string): string => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`Expected YYYY-MM-DD, got ${date}`);
  return date.replaceAll("-", "");
};

const nextDay = (date: string): string => {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

const utcStamp = (iso: string): string => {
  const time = Date.parse(iso);
  if (Number.isNaN(time)) throw new Error(`Invalid stamp: ${iso}`);
  return new Date(time)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
};

/** Builds a VCALENDAR (RFC 5545) with CRLF line endings and folded lines. */
export function icsCalendar(events: readonly CalendarEvent[], productId: string): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${productId}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${utcStamp(event.stamp)}`,
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(nextDay(event.date))}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `DESCRIPTION:${escapeText(event.description)}`,
      "TRANSP:TRANSPARENT",
    );
    if (event.url) lines.push(`URL:${event.url}`);
    if (event.reminderMinutes !== null) {
      lines.push(
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        `DESCRIPTION:${escapeText(event.summary)}`,
        `TRIGGER:-PT${event.reminderMinutes}M`,
        "END:VALARM",
      );
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
}

/** The Election Day event every "Add Election Day to calendar" button downloads. */
export const ELECTION_DAY_EVENT: CalendarEvent = {
  uid: "general-election-2026-11-03@for-the-people",
  date: GENERAL_ELECTION_2026,
  summary: "Election Day: U.S. general election",
  description:
    "Polls open and close at times your state sets. Find your polling place and what to bring on your state's election website, linked from vote.gov.",
  url: "https://vote.gov/",
  stamp: "2026-09-23T00:00:00Z",
  // 9 a.m. the day before: an all-day event starts at midnight local time.
  reminderMinutes: 15 * 60,
};
