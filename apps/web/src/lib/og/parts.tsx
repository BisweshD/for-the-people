import { PARTY_NAMES, type Party } from "@for-the-people/core/client";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { OG, partyColors } from "./theme";

const brandSymbol = `data:image/png;base64,${readFileSync(join(process.cwd(), "public", "brand", "symbol.png")).toString("base64")}`;

/**
 * Building blocks for generated images. Satori supports flexbox and a subset of CSS only, so these use
 * inline styles and plain SVG. The oval is the one decorative motif, as on the site.
 */

type OvalTone = "ink" | "marigold" | "agree" | "split";
const TONE: Record<OvalTone, string> = {
  ink: OG.ink,
  marigold: OG.marigold,
  agree: OG.agree,
  split: OG.split,
};

/** A ballot oval at the 1.6:1 ratio. Filled means chosen; a slash marks a split, so meaning never rests on color. */
export function OgOval({
  width,
  filled,
  tone = "ink",
  slashed = false,
}: {
  width: number;
  filled: boolean;
  tone?: OvalTone;
  slashed?: boolean;
}) {
  const color = TONE[tone];
  return (
    <svg width={width} height={Math.round(width / 1.6)} viewBox="0 0 32 20">
      <ellipse
        cx="16"
        cy="10"
        rx="14.25"
        ry="8.25"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth="1.75"
      />
      {slashed && !filled && (
        <line
          x1="8"
          y1="17"
          x2="24"
          y2="3"
          stroke={color}
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/**
 * The full product name beside the supplied people-and-flag emblem.
 */
export function OgWordmark({ size }: { size: number }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        fontSize: size,
        fontWeight: 800,
        color: "#082b5a",
      }}
    >
      <img
        src={brandSymbol}
        alt=""
        width={Math.round(size * 1.8)}
        height={Math.round(size * 1.5)}
        style={{ objectFit: "contain", marginRight: Math.round(size * 0.35) }}
      />
      <span style={{ letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>For The People</span>
    </div>
  );
}

/** A 4:5 official portrait with the card radius, or initials when there is no portrait on file. */
export function OgPortrait({
  src,
  name,
  width,
}: {
  src: string | null;
  name: string;
  width: number;
}) {
  const height = Math.round(width * 1.25);
  if (src) {
    return (
      <img
        src={src}
        width={width}
        height={height}
        alt=""
        style={{ borderRadius: 20, objectFit: "cover", border: `1px solid ${OG.hairline}` }}
      />
    );
  }
  const letters = name
    .split(/\s+/)
    .filter((part) => /^[A-Za-zÀ-ÿ]/.test(part))
    .map((part) => part[0]);
  return (
    <div
      style={{
        display: "flex",
        width,
        height,
        alignItems: "center",
        justifyContent: "center",
        borderRadius: 20,
        backgroundColor: OG.paper,
        border: `1px solid ${OG.hairline}`,
        color: OG.ink3,
        fontSize: Math.round(width / 4),
        fontWeight: 700,
      }}
    >
      {`${letters[0] ?? ""}${letters.at(-1) ?? ""}`.toUpperCase()}
    </div>
  );
}

/** Party as a tag with its name, never color alone. */
export function OgPartyTag({ party, size }: { party: Party; size: number }) {
  const colors = partyColors(party);
  return (
    <div
      style={{
        display: "flex",
        alignSelf: "flex-start",
        padding: `${Math.round(size * 0.25)}px ${Math.round(size * 0.55)}px`,
        borderRadius: 10,
        backgroundColor: colors.fill,
        color: colors.text,
        fontSize: size,
        fontWeight: 700,
      }}
    >
      {PARTY_NAMES[party]}
    </div>
  );
}

/** The page frame every generated image shares: canvas background and generous padding. */
export function OgFrame({
  children,
  padding,
  direction = "column",
}: {
  children: React.ReactNode;
  padding: number;
  direction?: "row" | "column";
}) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: direction,
        width: "100%",
        height: "100%",
        padding,
        backgroundColor: OG.canvas,
        fontFamily: "Public Sans",
        color: OG.ink,
      }}
    >
      {children}
    </div>
  );
}

/** Cuts long text at a word boundary for fixed-size cards. */
export function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" "))}…`;
}
