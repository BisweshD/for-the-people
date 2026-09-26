import js from "@eslint/js";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";
import civicRules from "./tools/eslint-plugin-for-the-people/index.js";

export default defineConfig([
  globalIgnores([
    "**/node_modules/**",
    "**/.next/**",
    ".data/**",
    ".cache/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    ".lighthouseci/**",
    "apps/web/next-env.d.ts",
    "apps/web/public/**",
    "packages/data/drizzle/**",
  ]),
  {
    files: ["packages/**/*.ts", "scripts/**/*.mjs", "tools/**/*.js", "*.mjs", "*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      globals: {
        process: "readonly",
        console: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    // Components and client libraries take runtime values from the Zod-free browser entry, so the
    // schema library never ships to the browser. Type imports stay allowed.
    files: [
      "apps/web/src/components/**/*.{ts,tsx}",
      "apps/web/src/lib/**/*.{ts,tsx}",
      "apps/web/src/hooks/**/*.{ts,tsx}",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@for-the-people/core",
              message:
                "Import runtime values from @for-the-people/core/client (no Zod in the browser).",
              allowTypeImports: true,
            },
            { name: "zod", message: "Zod stays on the server.", allowTypeImports: true },
          ],
        },
      ],
    },
  },
  {
    // Playwright scripts run some functions inside the page.
    files: ["scripts/screens.mjs", "scripts/check-bundle.mjs"],
    languageOptions: {
      globals: { window: "readonly", document: "readonly", performance: "readonly" },
    },
  },
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    extends: [...nextVitals, ...nextTs],
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@next/next/no-img-element": "off",
    },
  },
  {
    // The web app writes only through the public action: it
    // imports runAction and submitCorrection by path, never a module of ingestion or curation actions.
    files: ["apps/web/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: ["", "/index", "/ingestion", "/curation"].map((suffix) => ({
            name: `@for-the-people/data/actions${suffix}`,
            message:
              "Import runAction from @for-the-people/data/actions/runner and the action from @for-the-people/data/actions/public.",
          })),
        },
      ],
    },
  },
  {
    files: ["apps/web/src/**/*.{ts,tsx}"],
    plugins: { "for-the-people": civicRules },
    rules: { "for-the-people/neutral-voice": "error", "for-the-people/anti-slop": "error" },
  },
]);
