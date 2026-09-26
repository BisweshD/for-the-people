import Link from "next/link";
import { Suspense } from "react";
import {
  BottomTabs,
  BottomTabsView,
  TopLinks,
  TopLinksView,
  YouLink,
  YouLinkView,
} from "@/components/shell/nav-links";
import { CommandMenu, SearchIconButton, SearchPill } from "@/components/search/command-menu";
import { SiteFooter } from "@/components/shell/site-footer";
import { Wordmark } from "@/components/shell/wordmark";

/**
 * Page frame: a top bar, the page, and the phone tab bar. Phones get the wordmark and a search button up
 * top and the five tabs below. From 768px the top bar carries every destination as a visible link; the
 * search pill joins it from 1024px, where there is room for its label, and a search button stands in
 * between.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-control bg-ink px-4 py-2 font-bold text-paper focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b border-hairline bg-paper [view-transition-name:site-header]">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 md:h-16 md:px-6 lg:gap-4">
          <Link
            href="/"
            className="inline-flex min-h-11 shrink-0 items-center rounded-control text-[18px] lg:text-[22px]"
            aria-label="For The People home"
          >
            <Wordmark />
          </Link>
          <nav aria-label="Primary" className="hidden md:block">
            <Suspense fallback={<TopLinksView pathname={null} />}>
              <TopLinks />
            </Suspense>
          </nav>
          <div className="hidden min-w-0 flex-1 justify-end lg:flex">
            <SearchPill className="w-full max-w-sm" />
          </div>
          <div className="flex items-center gap-1 md:gap-2">
            <SearchIconButton className="-mr-2 md:mr-0 lg:hidden" />
            <Suspense fallback={<YouLinkView pathname={null} />}>
              <YouLink />
            </Suspense>
          </div>
        </div>
      </header>
      <CommandMenu />
      <main
        id="main"
        className="mx-auto w-full max-w-6xl flex-1 px-4 pt-5 pb-12 md:px-6 md:pt-10 md:pb-20"
      >
        {children}
      </main>
      <SiteFooter />
      <Suspense fallback={<BottomTabsView pathname={null} />}>
        <BottomTabs />
      </Suspense>
    </div>
  );
}
