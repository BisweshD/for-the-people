import { personIdFromSlug, type Position } from "@for-the-people/core";
import type { Metadata } from "next";
import { Suspense } from "react";
import { DuelView } from "@/components/duel/duel-view";
import { Skeleton } from "@/components/ui/skeleton";
import { loadDuelParams } from "@/lib/duel-params";
import { positionsFor } from "@/lib/matching";
import { getDeckCards, getKeyVoteRecord, getMemberIndex } from "@/server/data";
import { getDuel } from "@/server/duel";

export const metadata: Metadata = {
  title: "Vote Duel",
  description:
    "Pick any two members of Congress and see their real votes side by side: how often they voted the same way, and every vote where they split.",
};

function DuelSkeleton() {
  return (
    <div className="flex flex-col gap-10" aria-hidden>
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <Skeleton className="h-52 rounded-card sm:h-40" />
        <Skeleton className="h-52 rounded-card sm:h-40" />
      </div>
      <Skeleton className="h-44 rounded-card" />
      <Skeleton className="h-96 rounded-card" />
    </div>
  );
}

async function DuelContent({ searchParams }: { searchParams: PageProps<"/duel">["searchParams"] }) {
  const { a, b } = loadDuelParams(await searchParams);
  const [members, cards, record] = await Promise.all([
    getMemberIndex(),
    getDeckCards(),
    getKeyVoteRecord(),
  ]);
  const find = (slug: string | null) => {
    const id = slug ? personIdFromSlug(slug) : null;
    return (id && members.find((member) => member.id === id)) || null;
  };
  const memberA = find(a);
  const memberB = find(b);
  const missing = [...(a && !memberA ? [a] : []), ...(b && !memberB ? [b] : [])];
  const duel =
    memberA && memberB && memberA.id !== memberB.id ? await getDuel(memberA.id, memberB.id) : null;
  const positions = (id: string | undefined): Record<string, Position> =>
    id ? Object.fromEntries(positionsFor(record, id)) : {};
  const roster = members.map(({ portrait: _portrait, ...member }) => member);

  return (
    <DuelView
      roster={roster}
      a={memberA}
      b={memberB}
      missing={missing}
      cards={cards}
      positionsA={positions(memberA?.id)}
      positionsB={positions(memberB?.id)}
      duel={duel}
    />
  );
}

export default function DuelPage({ searchParams }: PageProps<"/duel">) {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-ink md:text-4xl">Vote Duel</h1>
        <p className="max-w-[68ch] text-base text-ink-2">
          Pick any two members of Congress and compare how they really voted, one recorded vote
          (roll call) at a time, from the official record.
        </p>
      </header>
      <Suspense fallback={<DuelSkeleton />}>
        <DuelContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
