import type { Metadata } from "next";
import Link from "next/link";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Suspense } from "react";
import { ExploreView } from "@/components/explore/explore-view";
import { Skeleton } from "@/components/ui/skeleton";
import { getDeckCards, getKeyVoteRecord, getMemberIndex } from "@/server/data";
import { getIssueAreas, getPartyUnity } from "@/server/explore";

export const metadata: Metadata = {
  title: "Explore Congress",
  description:
    "Browse every member of Congress serving now by state, House or Senate, party, and issue, with how each one voted on the key votes.",
};

/** Mirrors the page: the issue rail, the filter row, list rows, and the map on desktop. */
function ExploreSkeleton() {
  return (
    <div className="flex flex-col gap-4 md:gap-5" aria-hidden>
      <div className="flex gap-2 overflow-hidden border-b border-hairline pb-2">
        {Array.from({ length: 9 }, (_, index) => (
          <Skeleton key={index} className="h-9 w-28 shrink-0 rounded-control" />
        ))}
      </div>
      <Skeleton className="hidden h-[50px] w-full max-w-3xl rounded-control lg:block" />
      <div className="grid gap-6 pt-1 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-8 xl:grid-cols-[minmax(0,1fr)_440px]">
        <div className="flex flex-col gap-3">
          <div className="flex min-h-11 items-center justify-between">
            <Skeleton className="h-7 w-40 rounded-control" />
            <Skeleton className="h-11 w-28 rounded-full lg:hidden" />
          </div>
          <Skeleton className="h-5 w-full max-w-md rounded-control" />
          <div className="flex flex-col divide-y divide-hairline rounded-card bg-paper">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex items-center gap-3 px-3 py-3 sm:gap-4 sm:px-4">
                <Skeleton className="aspect-[4/5] w-14 shrink-0 rounded-control" />
                <div className="flex flex-1 flex-col gap-2">
                  <Skeleton className="h-4 w-44 rounded-input" />
                  <Skeleton className="h-3.5 w-56 max-w-full rounded-input" />
                </div>
              </div>
            ))}
          </div>
        </div>
        <Skeleton className="hidden h-[520px] rounded-card lg:block" />
      </div>
    </div>
  );
}

export default async function ExplorePage() {
  const [members, cards, record, issues, partyUnity] = await Promise.all([
    getMemberIndex(),
    getDeckCards(),
    getKeyVoteRecord(),
    getIssueAreas(),
    getPartyUnity(),
  ]);
  const serving = members.filter((member) => member.serving);
  return (
    <div className="flex flex-col gap-5 md:gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">
          Explore Congress
        </h1>
        <p className="max-w-[68ch] text-base text-ink-2">
          Every member serving now, and how each one voted on the key votes.{" "}
          <Link
            href="/methodology#match"
            className="font-semibold whitespace-nowrap text-ink underline underline-offset-4"
          >
            How scores work
          </Link>
        </p>
      </header>
      <Suspense fallback={<ExploreSkeleton />}>
        <NuqsAdapter>
          <ExploreView
            members={serving}
            cards={cards}
            record={record}
            issues={issues}
            partyUnity={Object.fromEntries(
              serving.flatMap((member) =>
                partyUnity[member.id] ? [[member.id, partyUnity[member.id]!]] : [],
              ),
            )}
          />
        </NuqsAdapter>
      </Suspense>
    </div>
  );
}
