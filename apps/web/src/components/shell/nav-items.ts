import { House, Layers, MessageCircleQuestion, User, Vote, type LucideIcon } from "lucide-react";

/** True when `pathname` is `section` or a page inside it ("/bills/x" is inside "/bills"; "/billsx" is not). */
const within = (pathname: string, section: string) =>
  pathname === section || pathname.startsWith(`${section}/`);

export interface NavItem {
  href: "/" | "/swipe" | "/ballot" | "/ask" | "/you";
  label: string;
  icon: LucideIcon;
  /** Every section this tab stands for (its own page included). */
  sections: string[];
}

/**
 * The five phone tabs. A tab lights only for pages in its own task:
 * - Swipe also covers Matches and a friend's comparison, the results of swiping.
 * - Ballot also covers the election hub (dates and deadlines for the same election).
 * - Explore and what it leads to (bills, roll calls, Vote Duel) and a member's profile have no phone tab,
 *   so no tab lights there: lighting another tab would say the voter is somewhere they are not.
 */
export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House, sections: [] },
  { href: "/swipe", label: "Swipe", icon: Layers, sections: ["/swipe", "/matches", "/compare"] },
  { href: "/ballot", label: "Ballot", icon: Vote, sections: ["/ballot", "/election"] },
  { href: "/ask", label: "Ask", icon: MessageCircleQuestion, sections: ["/ask"] },
  { href: "/you", label: "You", icon: User, sections: ["/you"] },
];

/**
 * The desktop top bar's links and the sections each one covers. There is room for every destination, so
 * Matches, Explore and the Election hub get their own links. A member's profile belongs to no link:
 * people arrive there from Matches, Explore, Ballot and search alike. "You" is the account button at the
 * far right.
 */
export const TOP_LINKS = [
  { href: "/swipe", label: "Swipe", sections: ["/swipe"] },
  { href: "/matches", label: "Matches", sections: ["/matches", "/compare"] },
  { href: "/explore", label: "Explore", sections: ["/explore", "/bills", "/votes", "/duel"] },
  { href: "/ballot", label: "Ballot", sections: ["/ballot"] },
  { href: "/election", label: "Election", sections: ["/election"] },
  { href: "/ask", label: "Ask", sections: ["/ask"] },
] as const;

export function isTopLinkActive(link: (typeof TOP_LINKS)[number], pathname: string): boolean {
  return link.sections.some((section) => within(pathname, section));
}

export function isActive(item: NavItem, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return item.sections.some((section) => within(pathname, section));
}

/** The aria-current value: "page" on the section's own page, "true" on a page inside it. */
export function currentValue(active: boolean, pathname: string | null, href: string) {
  if (!active) return undefined;
  return pathname === href ? "page" : "true";
}
