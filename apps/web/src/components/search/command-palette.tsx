"use client";

import { looksLikeAddress } from "@for-the-people/core/client";
import { Command as CommandPrimitive, defaultFilter } from "cmdk";
import {
  BookOpen,
  CalendarDays,
  Columns2,
  Compass,
  Eraser,
  FileText,
  Gauge,
  House,
  Landmark,
  Layers,
  MapPin,
  MessageCircleQuestion,
  Moon,
  Sun,
  UsersRound,
  Vote,
  type LucideIcon,
} from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "@/lib/toast";
import { PartyTag } from "@/components/party-tag";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import type { SearchIndex, SearchPerson } from "@/lib/search-index";
import { useVoter, voterActions } from "@/lib/voter-store";

/** The ⌘K palette: people, bills, districts, pages, actions, and "Ask". Loaded on first open. */

let indexRequest: Promise<SearchIndex> | null = null;

/** Fetches the search index once per visit; a failed request is retried on the next open. */
export function preloadSearchIndex(): Promise<SearchIndex> {
  indexRequest ??= fetch("/api/search-index").then((response) => {
    if (!response.ok) throw new Error(`Search index returned ${response.status}`);
    return response.json() as Promise<SearchIndex>;
  });
  indexRequest.catch(() => {
    indexRequest = null;
  });
  return indexRequest;
}

interface PageLink {
  label: string;
  href: string;
  icon: LucideIcon;
  keywords: string[];
}

const PAGES: PageLink[] = [
  { label: "Home", href: "/", icon: House, keywords: ["start", "for-the-people"] },
  { label: "Swipe the key votes", href: "/swipe", icon: Layers, keywords: ["cards", "answer"] },
  { label: "Your matches", href: "/matches", icon: UsersRound, keywords: ["match", "score"] },
  { label: "Explore members", href: "/explore", icon: Compass, keywords: ["browse", "issues"] },
  {
    label: "My ballot",
    href: "/ballot",
    icon: Vote,
    keywords: ["address", "candidates", "2026", "races"],
  },
  {
    label: "Ask For The People",
    href: "/ask",
    icon: MessageCircleQuestion,
    keywords: ["question"],
  },
  {
    label: "Compare with a friend",
    href: "/compare",
    icon: UsersRound,
    keywords: ["friend", "share"],
  },
  {
    label: "Vote Duel",
    href: "/duel",
    icon: Columns2,
    keywords: ["compare", "members", "side by side"],
  },
  { label: "Methodology", href: "/methodology", icon: BookOpen, keywords: ["formula", "method"] },
  { label: "Sources", href: "/sources", icon: FileText, keywords: ["receipts", "data"] },
  {
    label: "Election hub",
    href: "/election",
    icon: CalendarDays,
    keywords: ["deadlines", "register", "november"],
  },
  { label: "Data status", href: "/status", icon: Gauge, keywords: ["freshness", "ingestion"] },
];

/** Scattered subsequence matches below this score are noise across 1,500 entries. */
const MIN_SCORE = 0.1;
const LIMITS = { people: 8, bills: 8, districts: 5 } as const;

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const words = (text: string) =>
  fold(text)
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const compact = (text: string) => fold(text).replace(/[^a-z0-9]/g, "");

/** True when at most one insertion, deletion or substitution turns `a` into `b`. */
function withinOneEdit(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i) ||
    a.slice(i) === b.slice(i + 1)
  );
}

/**
 * How well an entry matches, best first:
 * 2, every word of the query starts a word of the entry ("warner" finds Mark R. Warner), or the query
 *   without spaces and dots starts the entry ("hr1" and "ca 12" find H.R. 1 and CA-12);
 * 1, the same, allowing one typo in words of four letters or more ("warnr" still finds Warner);
 * 0, a scattered-letter match.
 */
function tierOf(query: string, text: string, keywords: string[]): 0 | 1 | 2 {
  const squeezed = compact(query);
  if (squeezed.length > 1 && compact(text).startsWith(squeezed)) return 2;
  const asked = words(query);
  if (asked.length === 0) return 0;
  const target = words(`${text} ${keywords.join(" ")}`);
  if (asked.every((part) => target.some((word) => word.startsWith(part)))) return 2;
  const near = asked.every((part) =>
    target.some(
      (word) =>
        word.startsWith(part) ||
        (part.length >= 4 &&
          [part.length - 1, part.length, part.length + 1].some((n) =>
            withinOneEdit(part, word.slice(0, n)),
          )),
    ),
  );
  return near ? 1 : 0;
}

interface Scored<T> {
  item: T;
  score: number;
  tier: 0 | 1 | 2;
}

/**
 * Scores entries with cmdk's fuzzy scorer within each tier. The palette does its own ranking
 * (shouldFilter off) so each group shows only its best few hits and groups are ordered by their best
 * hit.
 */
function score<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => string,
  keywords: (item: T) => string[],
): Scored<T>[] {
  return items
    .map((item) => {
      const tier = tierOf(query, text(item), keywords(item));
      return { item, tier, score: defaultFilter(text(item), query, keywords(item)) + tier };
    })
    .filter(({ score, tier }) => tier > 0 || score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}

function topTier<T>(...groups: Scored<T>[][]): number {
  return Math.max(0, ...groups.flatMap((group) => group.map(({ tier }) => tier)));
}

/**
 * Only the best tier found anywhere is shown: "warner" lists Warner, not Wagner and Edwards, and a
 * typo with no close word still falls back to scattered-letter results.
 */
function pick<T>(scored: Scored<T>[], tier: number, limit: number) {
  const kept = scored.filter((entry) => entry.tier >= tier);
  return { hits: kept.slice(0, limit).map(({ item }) => item), best: kept[0]?.score ?? 0 };
}

function rank<T>(
  items: readonly T[],
  query: string,
  text: (item: T) => string,
  keywords: (item: T) => string[],
  limit = Infinity,
): { hits: T[]; best: number } {
  if (!query) return { hits: items.slice(0, limit), best: 0 };
  const scored = score(items, query, text, keywords);
  return pick(scored, topTier(scored), limit);
}

interface Section {
  heading: string;
  best: number;
  items: ReactNode[];
}

const PERSON_THUMB =
  "grid h-10 w-8 shrink-0 place-items-center overflow-hidden rounded-input bg-canvas";

function PersonThumb({ person }: { person: SearchPerson }) {
  if (!person.portrait) {
    const letters = person.name
      .split(/\s+/)
      .filter((part) => /^[A-Za-zÀ-ÿ]/.test(part))
      .map((part) => part[0]);
    return (
      <span className={PERSON_THUMB} aria-hidden>
        <span className="text-xs font-bold text-ink-3">
          {`${letters[0] ?? ""}${letters.at(-1) ?? ""}`.toUpperCase()}
        </span>
      </span>
    );
  }
  return (
    <span className={PERSON_THUMB} aria-hidden>
      <img
        src={`${person.portrait}-160.webp`}
        alt=""
        width={32}
        height={40}
        loading="lazy"
        decoding="async"
        className="size-full object-cover"
      />
    </span>
  );
}

export default function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const voter = useVoter();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState<"root" | "clear">("root");
  const [index, setIndex] = useState<SearchIndex | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || index) return;
    let live = true;
    preloadSearchIndex().then(
      (loaded) => live && setIndex(loaded),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, [open, index]);

  const query = search.trim();
  const addressLike = looksLikeAddress(query);
  const loading = query !== "" && !index && !failed;
  const list = useRef<HTMLDivElement>(null);

  // A new query starts at the top, where the best hit is (cmdk keeps the old scroll position).
  useEffect(() => {
    const frame = requestAnimationFrame(() => list.current?.scrollTo({ top: 0 }));
    return () => cancelAnimationFrame(frame);
  }, [query, index, page]);
  const answers = voter.stances.length;
  const dark = resolvedTheme === "dark";

  // Each open starts fresh. The reset happens on open, not on close, so the closing palette fades
  // out with the results that were on it instead of flashing back to the empty list.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSearch("");
      setPage("root");
      setFailed(false);
    }
  }

  const changeOpen = (next: boolean) => onOpenChange(next);

  const go = (href: string) => {
    changeOpen(false);
    router.push(href as Route);
  };

  const clearAnswers = () => {
    for (const stance of voter.stances) voterActions.undoStance(stance.keyVoteId);
    changeOpen(false);
    toast("Cleared your answers");
  };

  const toggleTheme = () => {
    const next = dark ? "light" : "dark";
    setTheme(next);
    voterActions.setTheme(next);
    changeOpen(false);
  };

  const hits = useMemo(() => {
    if (!query || !index) return null;
    const people = score(
      index.people,
      query,
      (person) => `${person.name} ${person.office}`,
      (person) => person.keywords,
    );
    const bills = score(
      index.bills,
      query,
      (bill) => `${bill.label} ${bill.title}`,
      (bill) => bill.keywords,
    );
    const districts = score(
      index.districts,
      query,
      (district) => `${district.label} ${district.personName}`,
      (district) => district.keywords,
    );
    const tier = topTier<unknown>(people, bills, districts);
    return {
      people: pick(people, tier, LIMITS.people),
      bills: pick(bills, tier, LIMITS.bills),
      districts: pick(districts, tier, LIMITS.districts),
    };
  }, [query, index]);

  const actions = [
    {
      id: "clear",
      label: "Clear my answers",
      keywords: ["reset", "delete", "stances", "start over"],
      icon: Eraser,
      detail: answers === 0 ? "None saved" : `${answers} saved`,
      disabled: answers === 0,
      run: () => {
        setSearch("");
        setPage("clear");
      },
    },
    {
      id: "theme",
      label: dark ? "Turn off dark mode" : "Turn on dark mode",
      keywords: ["toggle dark mode", "theme", "light", "dark"],
      icon: dark ? Sun : Moon,
      detail: null,
      disabled: false,
      run: toggleTheme,
    },
  ];

  const sections: Section[] = [];
  if (hits) {
    sections.push(
      {
        heading: "People",
        best: hits.people.best,
        items: hits.people.hits.map((person) => (
          <CommandItem
            key={person.slug}
            value={`person:${person.slug}`}
            onSelect={() => go(`/people/${person.slug}`)}
          >
            <PersonThumb person={person} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate font-semibold">{person.name}</span>
              <span className="truncate text-sm text-ink-2">{person.office}</span>
            </span>
            <PartyTag party={person.party} />
          </CommandItem>
        )),
      },
      {
        heading: "Bills",
        best: hits.bills.best,
        items: hits.bills.hits.map((bill) => (
          <CommandItem
            key={bill.id}
            value={`bill:${bill.id}`}
            onSelect={() => go(`/bills/${bill.id}`)}
          >
            <Landmark className="text-ink-3" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold tabular-nums">{bill.label}</span>
              <span className="line-clamp-2 text-sm text-ink-2">{bill.title}</span>
            </span>
          </CommandItem>
        )),
      },
      {
        heading: "Districts",
        best: hits.districts.best,
        items: hits.districts.hits.map((district) => (
          <CommandItem
            key={district.label}
            value={`district:${district.label}`}
            onSelect={() => go(`/people/${district.personSlug}`)}
          >
            <MapPin className="text-ink-3" aria-hidden />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold tabular-nums">{district.label}</span>
              <span className="truncate text-sm text-ink-2">
                Represented by {district.personName}
              </span>
            </span>
            <PartyTag party={district.party} />
          </CommandItem>
        )),
      },
    );
  }
  const pages = rank(
    PAGES,
    query,
    (link) => link.label,
    (link) => link.keywords,
  );
  sections.push({
    heading: "Pages",
    best: pages.best,
    items: pages.hits.map((link) => (
      <CommandItem key={link.href} value={`page:${link.href}`} onSelect={() => go(link.href)}>
        <link.icon className="text-ink-3" aria-hidden />
        {link.label}
      </CommandItem>
    )),
  });
  const matchingActions = rank(
    actions,
    query,
    (action) => action.label,
    (action) => action.keywords,
  );
  sections.push({
    heading: "Actions",
    best: matchingActions.best,
    items: matchingActions.hits.map((action) => (
      <CommandItem
        key={action.id}
        value={`action:${action.id}`}
        disabled={action.disabled}
        onSelect={action.run}
      >
        <action.icon className="text-ink-3" aria-hidden />
        <span className="flex-1">{action.label}</span>
        {action.detail && <span className="text-sm text-ink-2 tabular-nums">{action.detail}</span>}
      </CommandItem>
    )),
  });
  // Stable sort: equal scores keep the order above (people, bills, districts, pages, actions).
  if (query) sections.sort((a, b) => b.best - a.best);

  return (
    <CommandDialog
      open={open}
      onOpenChange={changeOpen}
      title="Search For The People"
      description="Find a member of Congress, a bill, a district, or a page. Use the arrow keys to move, Enter to open, and Escape to close."
    >
      <Command label="Search For The People" loop shouldFilter={false}>
        <CommandInput
          value={search}
          onValueChange={setSearch}
          placeholder={
            page === "clear" ? "Clear my answers?" : "Search a name, bill, or district like CA-12"
          }
          onKeyDown={(event) => {
            if (page === "clear" && event.key === "Backspace" && search === "") {
              event.preventDefault();
              setPage("root");
            }
          }}
        />
        <CommandList ref={list}>
          {page === "clear" ? (
            <CommandGroup heading="Clear my answers?">
              <p className="px-2.5 pb-2 text-sm text-ink-2">
                This removes your {answers} {answers === 1 ? "answer" : "answers"} from this device,
                and your matches start over. It cannot be undone.
              </p>
              <CommandItem value="confirm-clear" onSelect={clearAnswers}>
                <Eraser className="text-ink-2" aria-hidden />
                Yes, clear my answers
              </CommandItem>
              <CommandItem value="cancel-clear" onSelect={() => setPage("root")}>
                Keep my answers
              </CommandItem>
            </CommandGroup>
          ) : (
            <>
              <CommandEmpty>No matches. Try a last name, a bill number, or a state.</CommandEmpty>
              {loading && (
                <CommandPrimitive.Loading className="px-2.5 py-3 text-sm text-ink-3">
                  Loading people and bills
                </CommandPrimitive.Loading>
              )}
              {query && failed && (
                <p className="px-2.5 py-3 text-sm text-ink-2">
                  Could not load people and bills. Close search and try again.
                </p>
              )}
              {sections
                .filter((section) => !loading && section.items.length > 0)
                .map((section) => (
                  <CommandGroup key={section.heading} heading={section.heading}>
                    {section.items}
                  </CommandGroup>
                ))}
              {query && !loading && addressLike && (
                // An address never goes into a URL or to Ask: My Ballot takes it in a form instead.
                <CommandGroup heading="My Ballot">
                  <CommandItem value="ballot" onSelect={() => go("/ballot")}>
                    <Vote className="text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">Find your 2026 ballot</span>
                  </CommandItem>
                </CommandGroup>
              )}
              {query && !loading && !addressLike && (
                <CommandGroup heading="Ask For The People">
                  <CommandItem
                    value="ask"
                    onSelect={() => go(`/ask?q=${encodeURIComponent(query)}`)}
                  >
                    <MessageCircleQuestion className="text-ink-3" aria-hidden />
                    <span className="min-w-0 flex-1 truncate">
                      Ask: <span className="font-semibold">{query}</span>
                    </span>
                  </CommandItem>
                </CommandGroup>
              )}
            </>
          )}
        </CommandList>
        <div className="hidden items-center gap-4 border-t border-hairline px-4 py-2.5 text-xs text-ink-3 sm:flex">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> to move
          </span>
          <span>
            <Kbd>Enter</Kbd> to open
          </span>
          <span>
            <Kbd>Esc</Kbd> to close
          </span>
        </div>
      </Command>
    </CommandDialog>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded-input border border-hairline bg-canvas px-1 py-px font-sans text-[11px] font-semibold text-ink-2">
      {children}
    </kbd>
  );
}
