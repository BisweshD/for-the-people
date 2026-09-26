import { shareCardFromSearchParams } from "@for-the-people/core";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { portraitDataUrl } from "@/lib/og/portrait";
import { BallotShareCard, DuelShareCard, MatchShareCard } from "@/lib/og/share-cards";
import { ogFonts } from "@/lib/og/theme";
import { SHARE_FORMATS, type ShareFormat } from "@/lib/share";
import { getDuelAgreement, getShareMember } from "@/server/share";

/**
 * CreateShareCard: renders a ShareCard as a PNG, 1200x630 ("og", the default) or 1080x1920 ("story").
 * The query holds only public ids and counts, validated with the core ShareCard schema; any other
 * parameter is rejected, so stances can never ride along.
 */
export async function GET(request: NextRequest, context: RouteContext<"/api/share/[kind]">) {
  const { kind } = await context.params;
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const format = params.get("format") ?? "og";
  params.delete("format");
  if (format !== "og" && format !== "story")
    return Response.json({ error: 'format must be "og" or "story"' }, { status: 400 });
  const card = shareCardFromSearchParams(kind, params);
  if (!card) return Response.json({ error: "Not a valid share link" }, { status: 400 });

  const size = SHARE_FORMATS[format as ShareFormat];
  const options = {
    ...size,
    fonts: await ogFonts(),
    headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
  };

  if (card.kind === "match") {
    const member = await getShareMember(card.personId);
    if (!member) return Response.json({ error: "Unknown member" }, { status: 404 });
    const portrait = await portraitDataUrl(member.portrait?.asset);
    return new ImageResponse(
      <MatchShareCard
        member={member}
        portrait={portrait}
        score={card.score}
        n={card.n}
        agreements={card.agreements}
        format={format}
      />,
      options,
    );
  }

  if (card.kind === "duel") {
    const [a, b] = await Promise.all([getShareMember(card.a), getShareMember(card.b)]);
    if (!a || !b) return Response.json({ error: "Unknown member" }, { status: 404 });
    const [agreement, portraitA, portraitB] = await Promise.all([
      getDuelAgreement(a.id, b.id),
      portraitDataUrl(a.portrait?.asset),
      portraitDataUrl(b.portrait?.asset),
    ]);
    return new ImageResponse(
      <DuelShareCard
        a={a}
        b={b}
        portraits={[portraitA, portraitB]}
        shared={agreement.shared}
        agreed={agreement.agreed}
        format={format}
      />,
      options,
    );
  }

  return new ImageResponse(
    <BallotShareCard
      electionId={card.electionId}
      races={card.races}
      decided={card.decided}
      format={format}
    />,
    options,
  );
}
