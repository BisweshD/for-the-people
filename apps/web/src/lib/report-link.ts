import { isMeasureId, isRollCallId, personIdFromSlug } from "@for-the-people/core/client";

/**
 * "Report a mistake" links carry the page they were opened from (?record=/people/S000033), so the form can
 * name the record. Only two kinds of path are accepted: a record
 * page whose id is well formed (a member, a bill, a roll call), and a fixed list of real pages, named by
 * their own titles. Anything else names nothing, so a crafted path is never shown as the page someone
 * came from.
 */

/** Pages with a fixed address a report can name, with each page's own title. */
export const REPORTABLE_PAGES = {
  "/ask": "Ask For The People",
  "/ballot": "Your 2026 ballot",
  "/changelog": "Changelog",
  "/compare": "Compare with a friend",
  "/duel": "Vote Duel",
  "/election": "Election Day 2026",
  "/explore": "Explore Congress",
  "/matches": "Your matches",
  "/methodology": "How For The People works",
  "/sources": "Sources",
  "/status": "Data status",
  "/swipe": "Swipe your stance",
  "/you": "You",
} as const satisfies Record<string, string>;

type ReportablePage = keyof typeof REPORTABLE_PAGES;

/** The corrections API accepts a target id of at most 120 characters. */
const MAX_LENGTH = 120;
const SEGMENT = /^[A-Za-z0-9._~-]+$/;

const RECORD_IDS: Record<string, (id: string) => boolean> = {
  people: (slug) => personIdFromSlug(slug) !== null,
  bills: isMeasureId,
  votes: isRollCallId,
};

const isReportablePage = (path: string): path is ReportablePage =>
  Object.hasOwn(REPORTABLE_PAGES, path);

/** The title of a fixed page a report can name, or null. */
export function reportablePageName(path: string): string | null {
  return isReportablePage(path) ? REPORTABLE_PAGES[path] : null;
}

export function recordFromQuery(raw: string | null | undefined): string | null {
  if (!raw || raw.length > MAX_LENGTH || !raw.startsWith("/")) return null;
  const path = raw.length > 1 && raw.endsWith("/") ? raw.slice(0, -1) : raw;
  const segments = path.slice(1).split("/");
  if (segments.some((segment) => !SEGMENT.test(segment) || segment === "." || segment === ".."))
    return null;
  if (isReportablePage(path)) return path;
  const [section, id, ...rest] = segments;
  if (!section || !id || rest.length > 0 || !Object.hasOwn(RECORD_IDS, section)) return null;
  return RECORD_IDS[section]!(id) ? path : null;
}

export type RecordKind = "person" | "measure" | "rollCall";

/** What a record page is about, when its path says so. */
export function kindForRecord(path: string): RecordKind | null {
  if (path.startsWith("/people/")) return "person";
  if (path.startsWith("/bills/")) return "measure";
  if (path.startsWith("/votes/")) return "rollCall";
  return null;
}

/** The corrections form, carrying the current page when there is one to name. */
export function reportHref(
  pathname: string | null,
): "/corrections" | `/corrections?record=${string}` {
  const record = recordFromQuery(pathname);
  return record ? `/corrections?record=${encodeURIComponent(record)}` : "/corrections";
}
