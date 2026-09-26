import type { Metadata } from "next";
import { CompareView } from "@/components/compare/compare-view";
import { getDeckCards, getKeyVoteRecord, getMemberIndex } from "@/server/data";

export const metadata: Metadata = {
  title: "Compare with a friend",
  description:
    "See where you and a friend agree on the key votes in Congress, and which members match you both.",
};

/**
 * Friend Compare. The friend's answers arrive in the URL fragment and are read only on this device;
 * the server sends the same public page to everyone.
 */
export default async function ComparePage() {
  const [cards, record, members] = await Promise.all([
    getDeckCards(),
    getKeyVoteRecord(),
    getMemberIndex(),
  ]);
  return <CompareView cards={cards} record={record} members={members} />;
}
