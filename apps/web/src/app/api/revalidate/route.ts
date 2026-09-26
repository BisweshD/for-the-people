import {
  REVALIDATE_MIN_SECRET_LENGTH,
  revalidateSecret,
  SIGNATURE_HEADER,
  verifySignedBody,
} from "@for-the-people/core/signing";
import { revalidateTag } from "next/cache";
import { readBodyText } from "@/server/request";

const MAX_BODY_BYTES = 20_000;

/**
 * Ingestion jobs call this with a signed list of cache tags after they write. It is off
 * unless REVALIDATE_SECRET has at least REVALIDATE_MIN_SECRET_LENGTH characters.
 */
export async function POST(request: Request) {
  const secret = revalidateSecret(process.env.REVALIDATE_SECRET);
  if (!secret)
    return Response.json(
      {
        error: `Revalidation is not configured (REVALIDATE_SECRET needs ${REVALIDATE_MIN_SECRET_LENGTH} or more characters)`,
      },
      { status: 503 },
    );
  const body = await readBodyText(request, MAX_BODY_BYTES);
  if (body === null) return Response.json({ error: "Body too large" }, { status: 413 });
  const verified = await verifySignedBody(secret, body, request.headers.get(SIGNATURE_HEADER));
  if (!verified.ok) return Response.json({ error: "Unauthorized" }, { status: 401 });
  for (const tag of verified.request.tags) revalidateTag(tag, "max");
  return Response.json({ revalidated: verified.request.tags.length });
}
