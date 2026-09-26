import type { DistrictId } from "@for-the-people/core";
import type { Metadata } from "next";
import { BallotView } from "@/components/ballot/ballot-view";
import { ExampleRace } from "@/components/ballot/example-race";
import { hasStateList, type RaceView } from "@/lib/ballot";
import { getBallot, getBallotDistrictOptions } from "@/server/ballot";
import { mapStatuses, STATE_OFFICES } from "@/server/ballot-reference";
import { getDeckCards } from "@/server/data";

export const metadata: Metadata = {
  title: "Your 2026 ballot",
  description:
    "Find the U.S. Senate and House races on your November 3, 2026 ballot, who is running, and how candidates with a voting record match you.",
};

/**
 * The first-run example: Colorado's U.S. Senate race, whose choices come from the state's certified
 * list. Any race on file with two choices stands in if that list is ever missing.
 */
const EXAMPLE = { state: "CO", districts: ["CO-1@cd120"] as DistrictId[] } as const;

async function exampleRace(): Promise<RaceView | null> {
  const { races } = await getBallot(EXAMPLE.state, EXAMPLE.districts);
  const choices = races.filter((race) => race.candidates.length >= 2);
  return (
    choices.find((race) => race.chamber === "senate" && hasStateList(race)) ?? choices[0] ?? null
  );
}

export default async function BallotPage() {
  const [cards, districtOptions, example] = await Promise.all([
    getDeckCards(),
    getBallotDistrictOptions(),
    exampleRace(),
  ]);
  return (
    <BallotView
      cards={cards}
      districtOptions={districtOptions}
      mapStatuses={mapStatuses()}
      offices={STATE_OFFICES}
      example={example ? <ExampleRace race={example} /> : null}
    />
  );
}
