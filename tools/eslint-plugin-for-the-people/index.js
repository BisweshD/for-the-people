/**
 * For The People's own lint rules: neutral voice and anti-slop design rules,
 * enforced on the code people actually ship.
 */

// The same stems as BANNED_WORD_PATTERNS in packages/core/src/neutrality.ts (a core test keeps them equal).
const BANNED_WORDS = [
  { word: "conflict", pattern: /\bconflict\w*/i },
  { word: "corrupt", pattern: /\b(?:un)?corrupt\w*/i },
  { word: "flip-flop", pattern: /\bflip[\s-]?flop\w*/i },
  { word: "extreme", pattern: /\bextrem(?:e|es|ely|ist|ists|ism|isms|ity|ities)\b/i },
  { word: "radical", pattern: /\bradical\w*/i },
  { word: "patriot", pattern: /\b(?:un)?patriot\w*/i },
  { word: "traitor", pattern: /\btraitor\w*/i },
  { word: "rigged", pattern: /\brigg(?:ed|ing|er|ers)\b/i },
];

const BANNED_FONTS =
  /\b(Inter|Geist|Space Grotesk|Plus Jakarta Sans|Instrument Serif|Poppins|DM Sans)\b/;

/** Class-name patterns that break the visual system. */
const SLOP_CLASSES = [
  {
    pattern: /\bbg-(gradient|linear|radial|conic)-/,
    message: "Gradients are banned (8.7). Use flat tokens.",
  },
  { pattern: /\bbg-clip-text\b/, message: "Gradient text is banned (8.7)." },
  { pattern: /\bbackdrop-blur/, message: "Glassmorphism is banned as decoration (8.7)." },
  {
    pattern: /\bshadow-\[0_0_/,
    message: "Glows are banned (8.7). Elevation tokens are shadow-1 to shadow-5.",
  },
  {
    pattern:
      /\buppercase\b[^"'`]*\btracking-(wide|wider|widest)\b|\btracking-(wide|wider|widest)\b[^"'`]*\buppercase\b/,
    message: "All-caps tracked eyebrow labels are banned (8.7).",
  },
  { pattern: /\bfont-mono\b/, message: "Monospace data labels are banned (8.7)." },
  {
    pattern: /\bhover:(-?translate-y-|scale-10[1-9]|scale-1[1-9]0)/,
    message: "Hover lift is banned (8.7).",
  },
  {
    pattern: /\banimate-(pulse|bounce|ping)\b/,
    message: "Generic attention animations are banned; use the motion tokens.",
  },
];

const EMOJI = /\p{Extended_Pictographic}/u;

function textOfLiteral(node) {
  if (node.type === "Literal" && typeof node.value === "string") return node.value;
  if (node.type === "TemplateLiteral")
    return node.quasis.map((quasi) => quasi.value.cooked ?? "").join(" ");
  if (node.type === "JSXText") return node.value;
  return null;
}

/** Strings that are not user-facing copy: imports, object keys, JSX attribute names other than copy, and CSS class lists. */
function isCodeString(node) {
  const parent = node.parent;
  if (!parent) return false;
  if (
    parent.type === "ImportDeclaration" ||
    parent.type === "ExportNamedDeclaration" ||
    parent.type === "ExportAllDeclaration"
  )
    return true;
  if (parent.type === "Property" && parent.key === node) return true;
  if (parent.type === "JSXAttribute") {
    const name = parent.name && parent.name.name;
    return !["aria-label", "title", "alt", "placeholder", "aria-description", "label"].includes(
      name,
    );
  }
  return false;
}

/** True when a JSX node sits inside an <a> or <Link> element. */
function insideLink(node) {
  for (let parent = node.parent; parent; parent = parent.parent) {
    if (parent.type === "JSXElement") {
      const name = parent.openingElement.name.name;
      if (name === "a" || name === "Link") return true;
    }
  }
  return false;
}

const neutralVoice = {
  meta: {
    type: "problem",
    docs: { description: "Bans loaded words from UI copy." },
    messages: {
      banned:
        'The word "{{word}}" is banned in For The People copy (8.8). Use plain, neutral words.',
    },
    schema: [],
  },
  create(context) {
    const check = (node) => {
      const text = textOfLiteral(node);
      if (!text || isCodeString(node)) return;
      for (const { word, pattern } of BANNED_WORDS) {
        if (pattern.test(text)) context.report({ node, messageId: "banned", data: { word } });
      }
    };
    return { Literal: check, TemplateLiteral: check, JSXText: check };
  },
};

const antiSlop = {
  meta: {
    type: "problem",
    docs: { description: "Enforces the anti-slop design rules." },
    messages: {
      slop: "{{message}}",
      font: "Banned font: {{font}} (8.7). For The People uses Public Sans and Source Serif 4.",
      emoji: "Emoji are not icons (8.7). Use a Lucide icon.",
      arrow: 'Do not append "→" to link text (8.7).',
      framer: 'Import from "motion/react", never "framer-motion".',
      registry: "Third-party animated component registries are banned (8.7).",
      sparkles: "The Sparkles icon is banned decoration (8.7).",
    },
    schema: [],
  },
  create(context) {
    const checkClasses = (node, text) => {
      for (const { pattern, message } of SLOP_CLASSES) {
        if (pattern.test(text)) context.report({ node, messageId: "slop", data: { message } });
      }
    };
    return {
      ImportDeclaration(node) {
        const source = String(node.source.value);
        if (source === "framer-motion" || source.startsWith("framer-motion/"))
          context.report({ node, messageId: "framer" });
        if (/(magicui|aceternity|react-bits|kokonut|mvpblocks)/i.test(source))
          context.report({ node, messageId: "registry" });
        if (source === "lucide-react") {
          for (const specifier of node.specifiers) {
            if (specifier.imported && /^Sparkles?(Icon)?$/.test(specifier.imported.name))
              context.report({ node: specifier, messageId: "sparkles" });
          }
        }
      },
      JSXAttribute(node) {
        const name = node.name && node.name.name;
        if (name !== "className" && name !== "class") return;
        const value = node.value;
        if (!value) return;
        if (value.type === "Literal") checkClasses(node, String(value.value));
        if (value.type === "JSXExpressionContainer") {
          const source = context.sourceCode.getText(value.expression);
          checkClasses(node, source);
        }
      },
      Literal(node) {
        if (typeof node.value !== "string") return;
        const fontMatch = BANNED_FONTS.exec(node.value);
        if (fontMatch && /font|family/i.test(context.sourceCode.getText(node.parent))) {
          context.report({ node, messageId: "font", data: { font: fontMatch[1] } });
        }
      },
      JSXText(node) {
        if (EMOJI.test(node.value)) context.report({ node, messageId: "emoji" });
        if (/→\s*$/.test(node.value.trim()) && insideLink(node))
          context.report({ node, messageId: "arrow" });
      },
    };
  },
};

export default {
  meta: { name: "eslint-plugin-for-the-people", version: "0.1.0" },
  rules: { "neutral-voice": neutralVoice, "anti-slop": antiSlop },
};

export { BANNED_WORDS };
