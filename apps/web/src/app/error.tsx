"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

/**
 * A page that failed to render. It says so plainly, offers a retry, and points at /status, where
 * the last data runs are listed. The error's message is never shown: it can carry internal detail.
 */
export default function PageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    // Move focus to the explanation, so keyboard and screen-reader users are not left on a control
    // that no longer exists.
    headingRef.current?.focus();
    console.error(error);
  }, [error]);

  return (
    <section
      aria-labelledby="error-title"
      className="mx-auto flex w-full max-w-[560px] flex-col items-start gap-5 py-10 md:py-20"
    >
      <h1
        id="error-title"
        ref={headingRef}
        tabIndex={-1}
        className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-ink outline-none md:text-5xl"
      >
        This page did not load
      </h1>
      <p className="text-lg text-ink-2">
        Your answers are safe on this device. Try again, or check the status page to see whether the
        data is being updated.
        {error.digest ? (
          <span className="mt-2 block text-sm text-ink-3">Reference {error.digest}</span>
        ) : null}
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {/* A plain button, not the shared Button: this boundary ships with every route. */}
        <button
          type="button"
          onClick={reset}
          className="inline-flex h-12 items-center justify-center rounded-control bg-ink px-6 text-base font-bold text-paper transition-transform hover:bg-ink/85 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink active:scale-[0.98]"
        >
          Try again
        </button>
        <Link
          href="/status"
          className="inline-flex min-h-12 items-center rounded-control px-3 text-base font-semibold text-ink underline underline-offset-4"
        >
          Data status
        </Link>
      </div>
    </section>
  );
}
