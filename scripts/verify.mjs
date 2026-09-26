// pnpm verify: every quality gate for the product, in order. Stops at the first failure.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const PORT = 3200;
const env = {
  ...process.env,
  E2E_PORT: String(PORT),
  LHCI_BASE_URL: `http://localhost:${PORT}`,
  BUNDLE_BASE_URL: `http://localhost:${PORT}`,
};

let step = 0;

function run(name, command) {
  step += 1;
  const label = `${step}. ${name}`;
  const started = Date.now();
  console.log(`\n=== ${label}\n$ ${command}`);
  const result = spawnSync(command, { shell: true, stdio: "inherit", env });
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status !== 0) {
    console.error(`\n✗ ${label} failed after ${seconds}s (exit ${result.status}).`);
    process.exit(result.status ?? 1);
  }
  console.log(`✓ ${label} (${seconds}s)`);
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Not up yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Server at ${url} did not start`);
}

run("Typecheck", "pnpm -s typecheck");
run("ESLint: anti-slop and neutral voice", "pnpm -s exec eslint .");
run("Prettier", "pnpm -s format:check");
run(
  "Unit tests: core, score engine properties and invariants",
  "pnpm -s exec vitest run packages/core",
);
run(
  "Contract tests: parsers, key votes, published implies verified, actions",
  "pnpm -s exec vitest run packages/data",
);
run(
  "Neutrality and anti-slop scan: stylesheets, card copy, stored AI summaries",
  "node scripts/check-slop.mjs",
);
run("Database from the bundled snapshot", "pnpm -s db:setup");
run("Production build", "pnpm --filter @for-the-people/web build");

// A server left over from an earlier run would answer on this port with an old build, and every
// browser gate would test that instead. Refuse to go on rather than test the wrong thing.
try {
  await fetch(`http://localhost:${PORT}/`);
  console.error(
    `\n✗ Something is already listening on port ${PORT}. Stop it (an old \`next start\`?) and rerun.`,
  );
  process.exit(1);
} catch {
  // Nothing there: the port is free.
}

// Next runs as a direct child (no pnpm or shell in between), so killing it really stops the server;
// through a shell on Windows the node process outlived the kill and kept serving the old build.
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)],
  { cwd: "apps/web", stdio: "ignore", env },
);
// A failing gate calls process.exit, which skips `finally`; this still stops the server.
process.on("exit", () => server.kill());
try {
  await waitForServer(`http://localhost:${PORT}/`, 120_000);
  run(
    "Playwright: e2e flows, visual snapshots, axe, keyboard, provenance on mobile and desktop",
    "pnpm --filter @for-the-people/web exec playwright test",
  );
  run("First-load JS budget, 180 KB gzipped per route", "node scripts/check-bundle.mjs");
  run("Lighthouse CI: mobile performance, accessibility, CLS", "node scripts/lighthouse.mjs");
  // The Ask evals are a required gate once Ask exists; a missing runner is a failure, not a skip.
  if (!existsSync("apps/web/evals/run.ts")) throw new Error("apps/web/evals/run.ts is missing");
  run("Ask evals, 95% or better", "pnpm --filter @for-the-people/web eval:ask");
} finally {
  server.kill();
}
console.log("\nAll gates passed.");
