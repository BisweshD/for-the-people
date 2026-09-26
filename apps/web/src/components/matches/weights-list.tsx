"use client";

import type { Weight } from "@for-the-people/core/client";
import { useState } from "react";
import { WeightPicker } from "@/components/swipe/weight-picker";
import type { CardView } from "@/lib/views";
import { voterActions } from "@/lib/voter-store";

export type Answered = { card: CardView; stance: { choice: string; weight: Weight } };

/** Applies a weight. Matches passes one that first brings the top of the list into view. */
export type ChangeWeight = (keyVoteId: string, weight: Weight) => Promise<void>;

const saveWeight: ChangeWeight = async (keyVoteId, weight) =>
  voterActions.setWeight(keyVoteId, weight);

export function WeightsList({
  answered,
  onChange = saveWeight,
}: {
  answered: Answered[];
  onChange?: ChangeWeight;
}) {
  // The picker shows a choice at once, even while the page scrolls before saving it.
  const [pending, setPending] = useState<Record<string, Weight>>({});
  const choose = (keyVoteId: string, weight: Weight) => {
    setPending((current) => ({ ...current, [keyVoteId]: weight }));
    void onChange(keyVoteId, weight).finally(() =>
      setPending((current) => {
        if (current[keyVoteId] !== weight) return current;
        const next = { ...current };
        delete next[keyVoteId];
        return next;
      }),
    );
  };
  return (
    <ul className="flex flex-col divide-y divide-hairline">
      {answered.map(({ card, stance }) => (
        <li key={card.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
          <div>
            <p className="line-clamp-2 text-sm font-semibold text-ink">{card.card.title}</p>
            <p className="text-sm text-ink-2">You said {stance.choice}</p>
          </div>
          <WeightPicker
            value={pending[card.id] ?? stance.weight}
            label={`How much you care about: ${card.card.title}`}
            onChange={(weight: Weight) => choose(card.id, weight)}
          />
        </li>
      ))}
    </ul>
  );
}
