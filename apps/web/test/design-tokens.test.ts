import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The color tokens in globals.css, checked by computation rather than by eye (skill Part 4): text at
 * 4.5:1 or better, control borders, icons, marks and the focus ring at 3:1 or better, in both themes.
 * Values are read from the stylesheet itself, so a token change that breaks a pair fails here.
 */

const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");

type Oklch = readonly [l: number, c: number, h: number];

function declarations(selector: string): Map<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  if (start === -1) throw new Error(`no ${selector} block in globals.css`);
  const end = css.indexOf("\n}", start);
  const block = css.slice(start, end).replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map<string, string>();
  for (const match of block.matchAll(/--([\w-]+):\s*([^;]+);/g))
    out.set(match[1]!, match[2]!.trim());
  return out;
}

const LIGHT = declarations(":root");
const DARK = new Map([...LIGHT, ...declarations(".dark")]);

function parseOklch(value: string): Oklch {
  const match = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  if (!match) throw new Error(`not a plain oklch() color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** color-mix(in oklch, A p%, B): lightness and chroma blend linearly, hue by the shorter arc. */
function mix(a: Oklch, weight: number, b: Oklch): Oklch {
  const hueA = a[1] < 0.002 ? b[2] : a[2];
  const hueB = b[1] < 0.002 ? a[2] : b[2];
  let delta = hueB - hueA;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  const t = 1 - weight;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, hueA + delta * t];
}

function resolve(theme: Map<string, string>, value: string): Oklch {
  const reference = /^var\(--([\w-]+)\)$/.exec(value);
  if (reference) return token(theme, reference[1]!);
  if (value === "black") return [0, 0, 0];
  const mixed = /^color-mix\(in oklch, (.+) ([\d.]+)%, (.+)\)$/.exec(value);
  if (mixed) {
    return mix(resolve(theme, mixed[1]!), Number(mixed[2]) / 100, resolve(theme, mixed[3]!));
  }
  return parseOklch(value);
}

function token(theme: Map<string, string>, name: string): Oklch {
  const value = theme.get(name);
  if (value === undefined) throw new Error(`no --${name} token`);
  return resolve(theme, value);
}

/** Relative luminance (WCAG 2) of an OKLCH color, via OKLab and linear sRGB, clipped to the gamut. */
function luminance([l, c, h]: Oklch): number {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l1 = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m1 = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s1 = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (x: number) => Math.min(1, Math.max(0, x));
  const red = clip(4.0767416621 * l1 - 3.3077115913 * m1 + 0.2309699292 * s1);
  const green = clip(-1.2684380046 * l1 + 2.6097574011 * m1 - 0.3413193965 * s1);
  const blue = clip(-0.0041960863 * l1 - 0.7034186147 * m1 + 1.707614701 * s1);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(theme: Map<string, string>, one: string, two: string): number {
  const x = luminance(token(theme, one));
  const y = luminance(token(theme, two));
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const SURFACES = ["paper", "canvas", "badge-bg", "you-soft"];

/** Text: 4.5:1. [foreground, backgrounds]. */
const TEXT: [string, string[]][] = [
  ["ink", [...SURFACES, "agree-soft", "split-soft", "paper-press"]],
  ["ink-2", SURFACES],
  ["ink-3", SURFACES],
  ["agree", ["paper", "canvas", "agree-soft"]],
  ["split", ["paper", "canvas", "split-soft"]],
  ["danger", ["paper", "canvas"]],
  ["party-r", ["paper", "canvas", "party-r-soft"]],
  ["party-d", ["paper", "canvas", "party-d-soft"]],
  ["party-i", ["paper", "canvas", "party-i-soft"]],
  // A primary button's label on its fill at rest, on hover, and pressed.
  ["paper", ["ink", "ink-hover", "ink-press"]],
];

/** Control borders, icons, marks and the focus ring: 3:1. */
const GRAPHIC: [string, string[]][] = [
  ["input", ["paper", "canvas", "badge-bg"]],
  ["ink", SURFACES],
  ["ink-hover", ["paper", "canvas"]],
  ["ink-press", ["paper", "canvas"]],
  ["ink-3-graphic", ["paper", "canvas"]],
  ["marigold-strong", ["paper", "canvas"]],
  ["agree", ["paper", "canvas"]],
  ["split", ["paper", "canvas"]],
  // A "you" mark: the ink edge must read against the marigold inside it, or the logo's O becomes a dot.
  ["you-edge", ["you-mark", "paper", "canvas"]],
];

describe.each([
  ["light", LIGHT],
  ["dark", DARK],
])("%s theme", (_name, theme) => {
  for (const [foreground, backgrounds] of TEXT) {
    for (const background of backgrounds) {
      it(`${foreground} text on ${background} is 4.5:1 or better`, () => {
        expect(contrast(theme, foreground, background)).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  for (const [foreground, backgrounds] of GRAPHIC) {
    for (const background of backgrounds) {
      it(`${foreground} against ${background} is 3:1 or better`, () => {
        expect(contrast(theme, foreground, background)).toBeGreaterThanOrEqual(3);
      });
    }
  }
  it("a hover wash is visible on a card", () => {
    expect(contrast(theme, "badge-bg", "paper")).toBeGreaterThanOrEqual(1.1);
  });
});

describe("dark cards", () => {
  it("separate from the page by lightness, not only by a hairline", () => {
    expect(contrast(DARK, "paper", "canvas")).toBeGreaterThanOrEqual(1.2);
    expect(contrast(DARK, "hairline", "paper")).toBeGreaterThanOrEqual(1.3);
  });
});
