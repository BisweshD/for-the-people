import type { Metadata } from "next";
import { PageHeader } from "@/components/trust/page-header";
import { YouView, type StanceCard } from "@/components/you/you-view";
import { getDeckCards } from "@/server/data";

export const metadata: Metadata = {
  title: "You",
  description:
    "Your answers, location, and theme, all saved only on this device. Change or clear them any time.",
};

export default async function YouPage() {
  const cards: StanceCard[] = (await getDeckCards()).map((card) => ({
    id: card.id,
    title: card.card.title,
    issueLabel: card.issue.label,
    issueIcon: card.issue.icon,
  }));
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        title="You"
        lede="Your answers, your location, and how For The People looks. Everything here is saved on this device only."
      />
      <YouView cards={cards} />
    </div>
  );
}
