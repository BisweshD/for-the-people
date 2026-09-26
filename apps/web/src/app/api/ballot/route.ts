import { DistrictId, StateCode } from "@for-the-people/core";
import { z } from "zod";
import { getBallot } from "@/server/ballot";

/**
 * The 2026 races for a state and its ballot districts (never an address). Public civic data, so it may be
 * cached by the browser and the service worker for the offline cheat sheet.
 */

const Query = z.object({
  state: StateCode,
  districts: z
    .string()
    .optional()
    .transform((value) => (value ? value.split(",") : []))
    .pipe(z.array(DistrictId.refine((id) => id.endsWith("@cd120"))).max(2)),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = Query.safeParse({
    state: searchParams.get("state"),
    districts: searchParams.get("districts") ?? undefined,
  });
  if (!query.success || query.data.districts.some((id) => !id.startsWith(`${query.data.state}-`)))
    return Response.json(
      { error: "Expected a state and its 2026 ballot districts." },
      { status: 400 },
    );
  const ballot = await getBallot(query.data.state, query.data.districts.toSorted());
  return Response.json(ballot, {
    headers: { "cache-control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
