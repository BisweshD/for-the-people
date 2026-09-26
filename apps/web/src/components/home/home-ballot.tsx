"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AddressForm, type DistrictOption } from "@/components/ballot/address-form";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { districtLabel } from "@/lib/format";
import { useVoter } from "@/lib/voter-store";

/**
 * The home page's ballot lookup: the same form as /ballot, opening the ballot once the districts are
 * saved on this device. A visitor who already has a location gets a straight path to their ballot.
 */
export function HomeBallot({ districtOptions }: { districtOptions: DistrictOption[] }) {
  const voter = useVoter();
  const router = useRouter();
  const hydrated = useHydrated();
  const location = hydrated ? voter.location : null;
  if (location) {
    const ballot = location.districts
      .map((id) => /^([A-Z]{2})-(\d{1,2})@cd120$/.exec(id))
      .find((match) => match !== null);
    return (
      <div className="flex flex-col gap-3 rounded-card border border-hairline bg-paper p-5">
        <p className="text-base text-ink-2">
          Your ballot is ready for{" "}
          <span className="font-semibold text-ink">
            {ballot ? districtLabel(location.state, Number(ballot[2])) : location.state}
          </span>
          .
        </p>
        <Button asChild size="lg">
          <Link href="/ballot">Open your 2026 ballot</Link>
        </Button>
      </div>
    );
  }
  return <AddressForm districtOptions={districtOptions} onLocated={() => router.push("/ballot")} />;
}
