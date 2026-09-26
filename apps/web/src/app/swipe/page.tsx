import type { Metadata } from "next";
import { ClosestSoFar } from "@/components/swipe/closest-so-far";
import { MatchDataProvider } from "@/components/swipe/match-data";
import { SwipeDeck } from "@/components/swipe/swipe-deck";
import { getDeckCards, getKeyVoteRecord, getMemberIndex } from "@/server/data";

export const metadata: Metadata = {
  title: "Swipe your stance",
  description: "Say how you would have voted on the bills that shaped this Congress.",
};

export default async function SwipePage() {
  const [cards, record, members] = await Promise.all([
    getDeckCards(),
    getKeyVoteRecord(),
    getMemberIndex(),
  ]);
  return (
    // One copy of the ranking data feeds the desktop rail, the phone strip, the fifth-answer pause,
    // and the completion card.
    <MatchDataProvider value={{ record, members }}>
      <div className="mx-auto grid w-full max-w-xl gap-8 lg:max-w-none lg:grid-cols-[minmax(0,576px)_320px] lg:justify-center lg:gap-12">
        <h1 className="sr-only">Swipe your stance</h1>
        <SwipeDeck cards={cards} variant="page" />
        <aside className="hidden lg:block lg:pt-14">
          <div className="sticky top-24">
            <ClosestSoFar cards={cards} />
          </div>
        </aside>
      </div>
    </MatchDataProvider>
  );
}
