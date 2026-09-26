import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Page not found" };

/** Any unknown address, and any member, bill or vote the record does not hold. */
export default function NotFound() {
  return (
    <section
      aria-labelledby="not-found-title"
      className="mx-auto flex w-full max-w-[560px] flex-col items-start gap-5 py-10 md:py-20"
    >
      <h1
        id="not-found-title"
        className="text-4xl leading-[1.05] font-extrabold tracking-tight text-balance text-ink md:text-5xl"
      >
        Nothing on the record here
      </h1>
      <p className="text-lg text-ink-2">
        The link may be old, or the page may have moved. Every member of Congress, bill and roll
        call is still a search away.
      </p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button asChild size="lg" className="h-12 rounded-control px-6 text-base font-bold">
          <Link href="/explore">Find a member</Link>
        </Button>
        <Link
          href="/"
          className="inline-flex min-h-12 items-center rounded-control px-3 text-base font-semibold text-ink underline underline-offset-4"
        >
          Go to the home page
        </Link>
      </div>
    </section>
  );
}
