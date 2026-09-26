# For The People

A free, nonpartisan guide to congressional voting records, campaign finance, and the people on your ballot. Every fact links to its source.

## Run locally

Use Node.js 24 or later and pnpm 11.

```sh
pnpm install --frozen-lockfile
pnpm db:setup
pnpm dev
```

Open http://localhost:3100. Local development uses the bundled civic-data snapshot. API keys are optional; available settings are described in `.env.example`.

## Product files

- `apps/web`: the website, API routes, and browser checks.
- `packages/core`: shared types, scoring, and validation.
- `packages/data`: database access, official-data ingestion, and source verification.
- `data`: current curated data and the bundled snapshot.
- `tests/fixtures`: source samples used by automated checks.
- `scripts` and `tools`: build and quality checks.

## Check and build

```sh
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm start
```

`pnpm verify` runs the full quality suite, including browser, accessibility, performance, and answer-quality checks. `pnpm ingest` refreshes official data using the configured sources.

## Brand assets

The header and share cards use `apps/web/public/brand/symbol.png`. Its transparent source is `apps/web/src/assets/brand/people-flag.png`. Run `node scripts/pwa-icons.mjs` to rebuild the optimized symbol, browser icon, and installable-app icons.

The supplied logo was prepared with the built-in image tool using this prompt: “Extract only the three-person navy-and-red emblem. Preserve its shape, white star, and red and white stripes. Remove the words and outside background, keeping transparent gaps and crisp edges.”
