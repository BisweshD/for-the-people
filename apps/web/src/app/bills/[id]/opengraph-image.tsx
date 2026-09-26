import { MeasureId } from "@for-the-people/core";
import { ImageResponse } from "next/og";
import { chamberName, formatDate, formatInteger, measureLabel } from "@/lib/format";
import { clip, OgFrame, OgOval, OgWordmark } from "@/lib/og/parts";
import { OG, OG_SIZE, ogFonts } from "@/lib/og/theme";
import { getMeasureDetail } from "@/server/data";

export const alt = "A bill on For The People, with its recorded floor votes.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Bill share card: number, title, status, and the latest recorded vote in each chamber. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const detail = MeasureId.safeParse(id).success ? await getMeasureDetail(id) : null;
  const fonts = await ogFonts();
  if (!detail) {
    return new ImageResponse(
      <OgFrame padding={72}>
        <OgWordmark size={52} />
        <div style={{ display: "flex", marginTop: "auto", fontSize: 56, fontWeight: 800 }}>
          Bill not found
        </div>
      </OgFrame>,
      { ...size, fonts },
    );
  }
  const { measure, rollCalls } = detail;
  const latest = (["house", "senate"] as const).flatMap((chamber) => {
    const last = rollCalls.filter((rollCall) => rollCall.chamber === chamber).at(-1);
    return last ? [last] : [];
  });
  const title = clip(measure.titles.display, 120);

  return new ImageResponse(
    <OgFrame padding={72}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <OgWordmark size={40} />
        <div style={{ display: "flex", fontSize: 24, color: OG.ink3 }}>
          {measure.status.becameLaw
            ? "Became law"
            : `Latest action ${formatDate(measure.status.latestActionDate)}`}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 56 }}>
        <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: OG.ink2 }}>
          {measureLabel(measure.id)}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: title.length > 70 ? 50 : 64,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
          }}
        >
          {title}
        </div>
      </div>
      <div style={{ display: "flex", gap: 20, marginTop: "auto" }}>
        {latest.length === 0 ? (
          <div style={{ display: "flex", fontSize: 28, color: OG.ink2 }}>No recorded vote yet</div>
        ) : (
          latest.map((rollCall) => (
            <div
              key={rollCall.id}
              style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                gap: 10,
                padding: "20px 24px",
                borderRadius: 20,
                backgroundColor: OG.paper,
                border: `1px solid ${OG.hairline}`,
              }}
            >
              <div style={{ display: "flex", fontSize: 22, color: OG.ink3 }}>
                {`${chamberName(rollCall.chamber)} roll call ${rollCall.number}, ${formatDate(rollCall.date)}`}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 24, fontSize: 28 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
                  <OgOval width={32} filled />
                  {`Yea ${formatInteger(rollCall.totals.yea)}`}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700 }}>
                  <OgOval width={32} filled={false} />
                  {`Nay ${formatInteger(rollCall.totals.nay)}`}
                </div>
                <div style={{ display: "flex", color: OG.ink2 }}>{clip(rollCall.result, 28)}</div>
              </div>
              {rollCall.tieBreaker && (
                <div style={{ display: "flex", fontSize: 22, color: OG.ink2 }}>
                  {`The Vice President broke the tie, voting ${rollCall.tieBreaker.vote}`}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </OgFrame>,
    { ...size, fonts },
  );
}
