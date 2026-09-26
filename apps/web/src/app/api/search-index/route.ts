import { getSearchIndex } from "@/server/search";

/** The ⌘K index. Prerendered from cached data; the palette fetches it the first time it opens. */
export async function GET() {
  return Response.json(await getSearchIndex(), {
    headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" },
  });
}
