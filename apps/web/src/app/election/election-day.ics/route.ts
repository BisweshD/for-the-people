import { ELECTION_DAY_EVENT, icsCalendar } from "@for-the-people/core/calendar";

/** "Add Election Day to calendar": a standard iCalendar file any calendar app can import. */
export function GET() {
  return new Response(icsCalendar([ELECTION_DAY_EVENT], "-//For The People//Election Day//EN"), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'attachment; filename="election-day-2026.ics"',
      "Cache-Control": "public, max-age=86400",
    },
  });
}
