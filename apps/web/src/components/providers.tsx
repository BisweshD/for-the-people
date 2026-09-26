"use client";

import { ThemeProvider } from "next-themes";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { useToasterWanted } from "@/lib/toast";

const Toaster = dynamic(() => import("@/components/ui/sonner").then((module) => module.Toaster), {
  ssr: false,
});

/** Mounts the Toaster only once something asks for a toast (lib/toast.ts). */
function ToastHost() {
  return useToasterWanted() ? <Toaster position="top-center" /> : null;
}

/**
 * App-wide client context: theme (no flash) and toasts loaded on demand. Page animations use CSS and
 * the Web Animations API; URL state (nuqs) wraps only the pages that use it. Both keep every page inside
 * the first-load budget.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  // Effects run children first, so this marks the page ready once every listener is attached.
  // End-to-end tests wait for it instead of guessing with timeouts.
  useEffect(() => {
    document.documentElement.dataset.hydratedAt = String(Math.round(performance.now()));
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      {children}
      <ToastHost />
    </ThemeProvider>
  );
}
