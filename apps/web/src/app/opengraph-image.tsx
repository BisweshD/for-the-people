import { ImageResponse } from "next/og";
import { OgFrame, OgOval, OgWordmark } from "@/lib/og/parts";
import { OG, OG_SIZE, ogFonts } from "@/lib/og/theme";
import { getDeckCards } from "@/server/data";

export const alt =
  "For The People: see how Congress actually voted, then find who votes like you. Free, nonpartisan, and every fact links to the official record.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The default share card for every page without its own. */
export default async function Image() {
  const cards = await getDeckCards();
  return new ImageResponse(
    <OgFrame padding={72}>
      <OgWordmark size={52} />
      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", gap: 24 }}>
        <div
          style={{
            display: "flex",
            fontSize: 66,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
            maxWidth: 1056,
          }}
        >
          See how Congress actually voted, then find who votes like you.
        </div>
        <div style={{ display: "flex", fontSize: 30, color: OG.ink2, maxWidth: 900 }}>
          Free and nonpartisan. Every fact links to the official record.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 48 }}>
        <div style={{ display: "flex", gap: 10 }}>
          {cards.map((card, index) => (
            <OgOval key={card.id} width={34} filled={index < 3} />
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 24, color: OG.ink3 }}>
          {`${cards.length} key votes, each checked against the official House and Senate record`}
        </div>
      </div>
    </OgFrame>,
    { ...size, fonts: await ogFonts() },
  );
}
