import type { Metadata } from "next";
import { MatchesView } from "@/components/matches/matches-view";
import { getBallotDistrictOptions } from "@/server/ballot";
import { getDeckCards, getKeyVoteRecord, getMemberIndex } from "@/server/data";

export const metadata: Metadata = {
  title: "Your matches",
  description: "See which members of Congress voted the way you would have.",
};

export default async function MatchesPage() {
  const [cards, record, members, districtOptions] = await Promise.all([
    getDeckCards(),
    getKeyVoteRecord(),
    getMemberIndex(),
    getBallotDistrictOptions(),
  ]);
  return (
    <MatchesView
      cards={cards}
      record={record}
      members={members}
      districtOptions={districtOptions}
    />
  );
}
