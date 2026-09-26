// Neutrality and anti-slop checks for what ESLint cannot see: stylesheets, radius roles, curated card copy, and
// stored AI summaries. Exits 1 on any finding.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { gunzipSync } from "node:zlib";
import { BANNED_WORDS } from "../tools/eslint-plugin-for-the-people/index.js";

const root = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const findings = [];

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) walk(path, predicate, out);
    else if (predicate(path)) out.push(path);
  }
  return out;
}

const bannedIn = (text) =>
  BANNED_WORDS.filter(({ pattern }) => pattern.test(text)).map(({ word }) => word);

// 1. Stylesheets: banned fonts and decorative effects.
const CSS_RULES = [
  [
    /\b(Inter|Geist|Space Grotesk|Plus Jakarta Sans|Instrument Serif|Poppins|DM Sans)\b/,
    "banned font",
  ],
  [/(linear|radial|conic)-gradient\(/, "gradient"],
  [/backdrop-filter\s*:/, "glassmorphism"],
  [/text-shadow\s*:/, "glow"],
];
for (const file of walk(join(root, "apps", "web", "src"), (path) => path.endsWith(".css"))) {
  const text = readFileSync(file, "utf8");
  for (const [pattern, label] of CSS_RULES) {
    if (pattern.test(text)) findings.push(`${relative(root, file)}: ${label}`);
  }
}

// 1b. Components: corners come from the radius roles in globals.css (input, control, card, sheet, full).
// Tailwind's numbered sizes are removed from the theme, so one of them would silently render square.
const NUMBERED_RADIUS =
  /(?<![\w-])rounded(?:-(?:t|b|l|r|s|e|x|y|tl|tr|bl|br|ss|se|es|ee))?-(?:xs|sm|md|lg|xl|[2-4]xl)(?![\w-])/;
for (const file of walk(join(root, "apps", "web", "src"), (path) => /\.tsx?$/.test(path))) {
  readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (NUMBERED_RADIUS.test(line))
        findings.push(`${relative(root, file)}:${index + 1}: numbered radius (use a role)`);
    });
}

// 2. Curated card copy.
const keyVotes = JSON.parse(readFileSync(join(root, "data", "key-votes.json"), "utf8"));
for (const card of keyVotes.keyVotes) {
  for (const [field, text] of Object.entries(card.card)) {
    for (const word of bannedIn(text))
      findings.push(`data/key-votes.json ${card.id}.${field}: "${word}"`);
  }
}

// 3. Stored AI summaries in the bundled snapshot.
const measuresCsv = join(root, "data", "snapshot", "measures.csv.gz");
try {
  const csv = gunzipSync(readFileSync(measuresCsv)).toString("utf8");
  for (const match of csv.matchAll(/"\{""text"": ""(.*?)"", ""model""/g)) {
    for (const word of bannedIn(match[1])) findings.push(`stored plain summary: "${word}"`);
  }
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

if (findings.length > 0) {
  console.error(
    `check-slop found ${findings.length} problem(s):\n${findings.map((line) => `  ${line}`).join("\n")}`,
  );
  process.exit(1);
}
console.log("check-slop: stylesheets, radius roles, card copy, and stored summaries are clean");
