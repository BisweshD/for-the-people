import { formatDateLong, officeLine } from "@/lib/format";
import { ballotLine, honorific, matchLine, plural } from "@/lib/share";
import type { MemberView } from "@/lib/views";
import { OgFrame, OgOval, OgPartyTag, OgPortrait, OgWordmark } from "./parts";
import { OG } from "./theme";

/**
 * ShareCard layouts for both formats: "og" (1200x630, link previews) and "story" (1080x1920,
 * phone stories). Every number on a card comes from the validated card or the public record.
 */

type Format = "og" | "story";

function Footer({
  children,
  story,
  marginTop = "auto",
}: {
  children: string;
  story: boolean;
  marginTop?: number | "auto";
}) {
  return (
    <div
      style={{
        display: "flex",
        marginTop,
        paddingTop: story ? 40 : 22,
        borderTop: `2px solid ${OG.hairline}`,
        fontSize: story ? 32 : 22,
        color: OG.ink3,
      }}
    >
      {children}
    </div>
  );
}

function Score({ score, story }: { score: number; story: boolean }) {
  const percent = Math.round(score * 100);
  const agree = score >= 0.5;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: story ? 24 : 16 }}>
      <OgOval width={story ? 88 : 56} filled tone={agree ? "agree" : "split"} />
      <div
        style={{
          display: "flex",
          fontSize: story ? 96 : 60,
          fontWeight: 800,
          letterSpacing: "-0.03em",
        }}
      >
        {`${percent}%`}
      </div>
      <div style={{ display: "flex", fontSize: story ? 40 : 28, color: OG.ink2 }}>match</div>
    </div>
  );
}

export function MatchShareCard({
  member,
  portrait,
  score,
  n,
  agreements,
  format,
}: {
  member: MemberView;
  portrait: string | null;
  score: number;
  n: number;
  agreements: number;
  format: Format;
}) {
  const story = format === "story";
  const line = matchLine(`${honorific(member)} ${member.name}`, agreements, n);
  const footer =
    "Compared with their recorded votes on the key votes I answered, on For The People";
  if (story) {
    return (
      <OgFrame padding={96}>
        <OgWordmark size={56} />
        <div style={{ display: "flex", marginTop: 88 }}>
          <OgPortrait src={portrait} name={member.name} width={560} />
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 72,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
          }}
        >
          {line}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 36 }}>
          <div style={{ display: "flex", fontSize: 36, color: OG.ink2 }}>{officeLine(member)}</div>
          <OgPartyTag party={member.party} size={30} />
        </div>
        <div style={{ display: "flex", marginTop: 56 }}>
          <Score score={score} story />
        </div>
        <Footer story>{footer}</Footer>
      </OgFrame>
    );
  }
  return (
    <OgFrame padding={64} direction="row">
      <OgPortrait src={portrait} name={member.name} width={400} />
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 56 }}>
        <OgWordmark size={34} />
        <div
          style={{
            display: "flex",
            marginTop: 36,
            fontSize: line.length > 48 ? 46 : 54,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
          }}
        >
          {line}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
          <OgPartyTag party={member.party} size={20} />
          <div style={{ display: "flex", fontSize: 24, color: OG.ink2 }}>{officeLine(member)}</div>
        </div>
        <div style={{ display: "flex", marginTop: 28 }}>
          <Score score={score} story={false} />
        </div>
        <Footer story={false}>{footer}</Footer>
      </div>
    </OgFrame>
  );
}

/** A row of agreement markers: filled ovals for votes alike, slashed hollow ovals for votes that split. */
function AgreementRow({
  agreed,
  shared,
  width,
}: {
  agreed: number;
  shared: number;
  width: number;
}) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: Math.round(width / 3) }}>
      {Array.from({ length: shared }, (_, index) => (
        <OgOval
          key={index}
          width={width}
          filled={index < agreed}
          tone={index < agreed ? "agree" : "split"}
          slashed={index >= agreed}
        />
      ))}
    </div>
  );
}

export function DuelShareCard({
  a,
  b,
  portraits,
  shared,
  agreed,
  format,
}: {
  a: MemberView;
  b: MemberView;
  portraits: [string | null, string | null];
  shared: number;
  agreed: number;
  format: Format;
}) {
  const story = format === "story";
  const title = `${a.lastName} vs ${b.lastName}`;
  const line =
    shared === 0
      ? "No shared key votes yet"
      : `Agree on ${agreed} of ${plural(shared, "key vote")}`;
  const detail =
    shared === 0
      ? a.chamber === b.chamber
        ? "They have not both voted Yea or Nay on the same key vote."
        : "They serve in different chambers, so they never voted on the same roll call."
      : `${plural(agreed, "vote")} alike, ${plural(shared - agreed, "vote")} split, from the official roll calls`;
  const portraitWidth = story ? 400 : 230;
  const people = (
    <div style={{ display: "flex", alignItems: "flex-start", gap: story ? 40 : 24 }}>
      {[a, b].map((member, index) => (
        <div
          key={member.id}
          style={{ display: "flex", flexDirection: "column", gap: story ? 18 : 12 }}
        >
          <OgPortrait src={portraits[index] ?? null} name={member.name} width={portraitWidth} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6, width: portraitWidth }}>
            <div style={{ display: "flex", fontSize: story ? 36 : 22, fontWeight: 700 }}>
              {`${honorific(member)} ${member.name}`}
            </div>
            <OgPartyTag party={member.party} size={story ? 26 : 16} />
          </div>
        </div>
      ))}
    </div>
  );
  if (story) {
    return (
      <OgFrame padding={96}>
        <OgWordmark size={56} />
        <div style={{ display: "flex", marginTop: 80 }}>{people}</div>
        <div
          style={{
            display: "flex",
            marginTop: 72,
            fontSize: 84,
            fontWeight: 800,
            letterSpacing: "-0.025em",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 52, fontWeight: 700 }}>{line}</div>
        <div style={{ display: "flex", marginTop: 40 }}>
          <AgreementRow agreed={agreed} shared={shared} width={64} />
        </div>
        <div style={{ display: "flex", marginTop: 32, fontSize: 34, color: OG.ink2 }}>{detail}</div>
        <Footer story>Real votes side by side, on For The People</Footer>
      </OgFrame>
    );
  }
  return (
    <OgFrame padding={64} direction="row">
      {people}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 48 }}>
        <OgWordmark size={34} />
        <div
          style={{
            display: "flex",
            marginTop: 40,
            fontSize: title.length > 20 ? 48 : 58,
            fontWeight: 800,
            letterSpacing: "-0.025em",
          }}
        >
          {title}
        </div>
        <div style={{ display: "flex", marginTop: 10, fontSize: 36, fontWeight: 700 }}>{line}</div>
        <div style={{ display: "flex", marginTop: 24 }}>
          <AgreementRow agreed={agreed} shared={shared} width={40} />
        </div>
        <div style={{ display: "flex", marginTop: 20, fontSize: 22, color: OG.ink2 }}>{detail}</div>
        <Footer story={false}>Real votes side by side, on For The People</Footer>
      </div>
    </OgFrame>
  );
}

export function BallotShareCard({
  electionId,
  races,
  decided,
  format,
}: {
  electionId: string;
  races: number;
  decided: number;
  format: Format;
}) {
  const story = format === "story";
  const date = /^\d{4}-\d{2}-\d{2}/.exec(electionId)?.[0];
  const line = ballotLine(decided, races);
  const markers = (
    <div style={{ display: "flex", flexWrap: "wrap", gap: story ? 22 : 14 }}>
      {Array.from({ length: races }, (_, index) => (
        <OgOval key={index} width={story ? 72 : 48} filled={index < decided} />
      ))}
    </div>
  );
  return (
    <OgFrame padding={story ? 96 : 72}>
      <OgWordmark size={story ? 56 : 40} />
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: story ? 40 : 24,
          marginTop: "auto",
        }}
      >
        <div
          style={{ display: "flex", fontSize: story ? 44 : 30, fontWeight: 700, color: OG.ink2 }}
        >
          My 2026 ballot plan
        </div>
        <div
          style={{
            display: "flex",
            fontSize: story ? 88 : 60,
            fontWeight: 800,
            lineHeight: 1.08,
            letterSpacing: "-0.025em",
          }}
        >
          {line}
        </div>
        {markers}
        {date && (
          <div style={{ display: "flex", fontSize: story ? 40 : 28, color: OG.ink2 }}>
            {`Election Day is ${formatDateLong(date)}`}
          </div>
        )}
      </div>
      <Footer story={story} marginTop={story ? "auto" : 40}>
        Make your own plan on For The People. Choices stay on your device.
      </Footer>
    </OgFrame>
  );
}
