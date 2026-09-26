import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Shared setup for generated images (OG cards and story cards). Satori cannot read CSS variables, so
 * the light "Paper" tokens from globals.css are repeated here as sRGB hex.
 * Keep the two in step.
 */

export const OG = {
  paper: "#FFFFFF",
  canvas: "#F6F7F9",
  hairline: "#E4E7EC",
  ink: "#161B26",
  ink2: "#4A5365",
  ink3: "#667085",
  marigold: "#F2B01E",
  agree: "#1C7837",
  split: "#762A83",
  party: {
    D: { text: "#3A5A99", fill: "#E9F0FE" },
    R: { text: "#A2413F", fill: "#FEEBEA" },
    I: { text: "#6B7280", fill: "#EEF0F4" },
  },
} as const;

export const partyColors = (party: string) =>
  party === "D" ? OG.party.D : party === "R" ? OG.party.R : OG.party.I;

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const STORY_SIZE = { width: 1080, height: 1920 } as const;

const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");

/** Public Sans static TTFs (Satori cannot read woff2). Read once per server process. */
const fontFiles = Promise.all([
  readFile(join(FONT_DIR, "PublicSans-Regular.ttf")),
  readFile(join(FONT_DIR, "PublicSans-Bold.ttf")),
  readFile(join(FONT_DIR, "PublicSans-ExtraBold.ttf")),
]);

export async function ogFonts() {
  const [regular, bold, extraBold] = await fontFiles;
  return [
    { name: "Public Sans", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Public Sans", data: bold, weight: 700 as const, style: "normal" as const },
    { name: "Public Sans", data: extraBold, weight: 800 as const, style: "normal" as const },
  ];
}
