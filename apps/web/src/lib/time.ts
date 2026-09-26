/**
 * Calendar dates for moments in time (fetches, answers). For The People dates events in U.S. Eastern time,
 * the time zone Congress and the official records use, so a fetch late on Sep 23 never reads as Sep 24.
 */
const EASTERN_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/New_York",
});

export const formatEasternDate = (iso: string): string => EASTERN_DATE.format(new Date(iso));
