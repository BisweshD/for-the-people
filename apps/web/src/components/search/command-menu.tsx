"use client";

import { Search } from "lucide-react";
import { lazy, Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/**
 * The ⌘K entry points. This file stays tiny: the palette itself (cmdk and the search index) loads only
 * when someone first opens it, so it adds nothing to a page's first-load JavaScript.
 */

const loadPalette = () => import("@/components/search/command-palette");
const CommandPalette = lazy(loadPalette);

let open = false;
const listeners = new Set<() => void>();

function setOpen(next: boolean): void {
  if (open === next) return;
  open = next;
  for (const listener of listeners) listener();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const openCommandMenu = () => setOpen(true);

/** Starts loading the palette code and index before the click lands (hover or focus on a trigger). */
export function preloadCommandMenu(): void {
  void loadPalette().then((module) => module.preloadSearchIndex());
}

/** Mounted once in the app shell: owns ⌘K / Ctrl+K and renders the palette after the first open. */
export function CommandMenu() {
  const isOpen = useSyncExternalStore(
    subscribe,
    () => open,
    () => false,
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey) && !event.altKey) {
        event.preventDefault();
        if (!open) preloadCommandMenu();
        setOpen(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (isOpen && !mounted) setMounted(true);
  if (!mounted) return null;
  return (
    <Suspense fallback={null}>
      <CommandPalette open={isOpen} onOpenChange={setOpen} />
    </Suspense>
  );
}

const noSubscription = () => () => {};

/** "⌘K" on Apple devices, "Ctrl K" elsewhere (and during server rendering). */
function ShortcutHint() {
  const apple = useSyncExternalStore(
    noSubscription,
    () => /Mac|iPhone|iPad/.test(navigator.userAgent),
    () => false,
  );
  return apple ? "⌘K" : "Ctrl K";
}

/**
 * Desktop top-bar search pill. Its name is the visible label, set explicitly so the shortcut hint is not
 * read as part of it (the shortcut itself is announced from aria-keyshortcuts).
 */
export function SearchPill({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      onPointerEnter={preloadCommandMenu}
      onFocus={preloadCommandMenu}
      aria-haspopup="dialog"
      aria-label="Search a name, bill, or address"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "inline-flex h-11 min-w-0 items-center gap-2.5 rounded-full border border-input bg-canvas pr-2 pl-4 text-left text-base text-ink-2 transition-colors duration-(--dur-fast) can-hover:border-ink-2 can-hover:text-ink",
        className,
      )}
    >
      <Search className="size-5 shrink-0 text-ink-2" aria-hidden />
      <span className="min-w-0 flex-1 truncate">Search a name, bill, or address</span>
      <kbd
        aria-hidden
        className="hidden shrink-0 rounded-full border border-hairline bg-paper px-2 py-0.5 font-sans text-sm font-bold text-ink-2 xl:inline"
      >
        <ShortcutHint />
      </kbd>
    </button>
  );
}

/** Mobile top-bar search button. */
export function SearchIconButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={openCommandMenu}
      onPointerDown={preloadCommandMenu}
      onFocus={preloadCommandMenu}
      aria-haspopup="dialog"
      aria-label="Search a name, bill, or address"
      className={cn(
        "inline-flex size-11 items-center justify-center rounded-control text-ink-2 transition-colors duration-(--dur-fast) can-hover:bg-badge can-hover:text-ink",
        className,
      )}
    >
      <Search className="size-5.5" aria-hidden />
    </button>
  );
}
