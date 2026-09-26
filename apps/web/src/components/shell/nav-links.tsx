"use client";

import { UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { preloadAskChat } from "@/components/ask/ask-chat-loader";
import {
  currentValue,
  isActive,
  isTopLinkActive,
  NAV_ITEMS,
  TOP_LINKS,
} from "@/components/shell/nav-items";
import { cn } from "@/lib/utils";

/** Pointer, touch and focus handlers that start loading a page's heavy client code before the tap lands. */
const warm = (href: string) =>
  href === "/ask"
    ? { onPointerEnter: preloadAskChat, onTouchStart: preloadAskChat, onFocus: preloadAskChat }
    : {};

/** Mobile bottom tab bar. Reads the pathname, so it renders inside <Suspense> with a static fallback. */
export function BottomTabs() {
  const pathname = usePathname();
  return <BottomTabsView pathname={pathname} />;
}

/**
 * The active tab says so three ways, never by weight alone: a 2px ink bar at the top edge, a filled and
 * heavier icon, and a bold ink label (the others are regular, in the secondary ink).
 */
export function BottomTabsView({ pathname }: { pathname: string | null }) {
  return (
    <nav
      aria-label="Main"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-paper pb-[env(safe-area-inset-bottom)] [view-transition-name:site-tabs] md:hidden"
    >
      <ul className="mx-auto grid max-w-md grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const active = pathname !== null && isActive(item, pathname);
          const Icon = item.icon;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={currentValue(active, pathname, item.href)}
                {...warm(item.href)}
                className={cn(
                  "relative flex min-h-14 flex-col items-center justify-center gap-0.5 text-sm transition-colors duration-(--dur-fast)",
                  active ? "font-bold text-ink" : "font-normal text-ink-2 can-hover:text-ink",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute top-0 h-0.5 w-10 rounded-full bg-ink transition-transform duration-(--dur-base) ease-out-soft",
                    active ? "scale-x-100" : "scale-x-0",
                  )}
                />
                <Icon
                  className={cn("size-6", active && "fill-ink/15")}
                  strokeWidth={active ? 2.5 : 1.75}
                  aria-hidden
                />
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop links in the top bar. */
export function TopLinks() {
  const pathname = usePathname();
  return <TopLinksView pathname={pathname} />;
}

export function TopLinksView({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-center gap-0.5 lg:gap-1">
      {TOP_LINKS.map((link) => {
        const active = pathname !== null && isTopLinkActive(link, pathname);
        return (
          <li key={link.href}>
            <Link
              href={link.href}
              aria-current={currentValue(active, pathname, link.href)}
              {...warm(link.href)}
              className={cn(
                "relative inline-flex min-h-11 items-center rounded-control px-2.5 text-sm transition-colors duration-(--dur-fast) lg:px-3 lg:text-base",
                active
                  ? "font-bold text-ink"
                  : "font-normal text-ink-2 can-hover:bg-badge can-hover:text-ink",
              )}
            >
              {link.label}
              {active && (
                <span
                  className="absolute inset-x-2.5 bottom-1 h-0.5 rounded-full bg-ink lg:inset-x-3"
                  aria-hidden
                />
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The desktop account button ("You"), lit on the You page like the links beside it. */
export function YouLink() {
  const pathname = usePathname();
  return <YouLinkView pathname={pathname} />;
}

export function YouLinkView({ pathname }: { pathname: string | null }) {
  const active = pathname !== null && (pathname === "/you" || pathname.startsWith("/you/"));
  return (
    <Link
      href="/you"
      aria-label="You: your answers and data"
      aria-current={currentValue(active, pathname, "/you")}
      className={cn(
        "hidden size-11 shrink-0 items-center justify-center rounded-full border transition-colors duration-(--dur-fast) md:inline-flex",
        active
          ? "border-ink bg-badge text-ink"
          : "border-input bg-paper text-ink-2 can-hover:bg-badge can-hover:text-ink",
      )}
    >
      <UserRound className="size-5" strokeWidth={active ? 2.5 : 2} aria-hidden />
    </Link>
  );
}
