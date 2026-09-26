import { personIdFromSlug } from "@for-the-people/core";
import { ImageResponse } from "next/og";
import { formatInteger, formatShare, officeLine } from "@/lib/format";
import { OgFrame, OgPartyTag, OgPortrait, OgWordmark } from "@/lib/og/parts";
import { portraitDataUrl } from "@/lib/og/portrait";
import { OG, OG_SIZE, ogFonts } from "@/lib/og/theme";
import { getMemberIndex, getPersonProfile } from "@/server/data";

export const alt =
  "A member of Congress on For The People, with how often they voted with their party.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Profile share card: portrait, name, office, and party-line voting from the official record. */
export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const id = personIdFromSlug((await params).id);
  const [profile, members] = await Promise.all([
    id ? getPersonProfile(id) : null,
    getMemberIndex(),
  ]);
  const member = members.find((candidate) => candidate.id === id);
  const fonts = await ogFonts();
  if (!profile || !member) {
    return new ImageResponse(
      <OgFrame padding={72}>
        <OgWordmark size={52} />
        <div style={{ display: "flex", marginTop: "auto", fontSize: 56, fontWeight: 800 }}>
          Member not found
        </div>
      </OgFrame>,
      { ...size, fonts },
    );
  }
  const { person, stats } = profile;
  const portrait = await portraitDataUrl(person.portrait?.asset);
  const unity = stats ? formatShare(stats.partyUnityVotes, stats.partyUnityEligible) : null;

  return new ImageResponse(
    <OgFrame padding={64} direction="row">
      <OgPortrait src={portrait} name={person.names.full} width={400} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 56 }}>
        <OgWordmark size={34} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 44 }}>
          <div
            style={{
              display: "flex",
              fontSize: person.names.full.length > 22 ? 52 : 64,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: "-0.025em",
            }}
          >
            {person.names.full}
          </div>
          <div style={{ display: "flex", fontSize: 28, color: OG.ink2 }}>
            {member.serving ? officeLine(member) : `Former member, ${officeLine(member)}`}
          </div>
          <OgPartyTag party={member.party} size={22} />
        </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            marginTop: "auto",
            paddingTop: 24,
            borderTop: `2px solid ${OG.hairline}`,
            gap: 6,
          }}
        >
          {stats && unity && stats.partyUnityEligible > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", fontSize: 31, fontWeight: 700 }}>
                {`Voted with their party on ${unity} of split votes`}
              </div>
              <div style={{ display: "flex", fontSize: 22, color: OG.ink3 }}>
                {`${formatInteger(stats.partyUnityVotes)} of ${formatInteger(stats.partyUnityEligible)} roll calls where most Democrats and most Republicans voted opposite ways, 119th Congress`}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>
              No voting record yet
            </div>
          )}
        </div>
      </div>
    </OgFrame>,
    { ...size, fonts },
  );
}
