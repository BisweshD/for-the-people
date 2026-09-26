import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { localDataDir, openFileDb, openMemoryDb, snapshotTarball } from "../db/client";
import { importSnapshot, snapshotDir } from "../db/snapshot";

/**
 * Local setup: migrate an empty PGlite, restore the bundled snapshot, and write the tarball
 * that every web process loads into memory. Needs no network and no API keys.
 *
 * With --folder it instead restores the snapshot into the local ingestion folder (.data/pglite), so
 * `pnpm ingest` builds on the bundled data. The folder must not exist yet: move the old one aside.
 */
if (!existsSync(join(snapshotDir(), "manifest.json"))) {
  throw new Error(
    `No bundled snapshot in ${snapshotDir()}. Run "pnpm ingest" and "pnpm db:snapshot" first.`,
  );
}
const started = Date.now();
if (process.argv.includes("--folder")) {
  if (existsSync(localDataDir()))
    throw new Error(`${localDataDir()} already exists. Move it aside first; nothing was changed.`);
  const folder = await openFileDb();
  try {
    await importSnapshot(folder.pglite!);
  } finally {
    await folder.close();
  }
  console.log(`db:setup --folder restored the snapshot into ${localDataDir()}`);
  process.exit(0);
}
const open = await openMemoryDb({ migrate: true });
try {
  await importSnapshot(open.pglite!);
  const tarball = await open.pglite!.dumpDataDir("gzip");
  await mkdir(dirname(snapshotTarball()), { recursive: true });
  await writeFile(snapshotTarball(), Buffer.from(await tarball.arrayBuffer()));
  console.log(
    `db:setup restored the snapshot into ${snapshotTarball()} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
} finally {
  await open.close();
}
