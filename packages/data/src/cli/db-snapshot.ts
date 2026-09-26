import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { openFileDb, snapshotTarball } from "../db/client";
import { exportSnapshot } from "../db/snapshot";

/** After ingestion: write the bundled CSV snapshot and the local tarball the web app loads. */
const open = await openFileDb();
try {
  const counts = await exportSnapshot(open.pglite!);
  console.log("snapshot tables:", JSON.stringify(counts));
  const tarball = await open.pglite!.dumpDataDir("gzip");
  await mkdir(dirname(snapshotTarball()), { recursive: true });
  await writeFile(snapshotTarball(), Buffer.from(await tarball.arrayBuffer()));
  console.log(`wrote ${snapshotTarball()}`);
} finally {
  await open.close();
}
