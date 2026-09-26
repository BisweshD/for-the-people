import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "@neondatabase/serverless";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle as drizzleNeon } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migrateNeon } from "drizzle-orm/neon-serverless/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import * as schema from "./schema";

/**
 * One database interface, three homes:
 * - Neon (DATABASE_URL set): preview and production.
 * - PGlite in memory, restored from the snapshot tarball: local dev, tests, and builds without DATABASE_URL.
 * - PGlite on disk: the ingestion CLI, the only process that writes the local data folder.
 */

export type Schema = typeof schema;
export type Db = PgDatabase<PgQueryResultHKT, Schema>;

export interface OpenDb {
  db: Db;
  /** Present only for PGlite; used for snapshots and COPY. */
  pglite: PGlite | null;
  close(): Promise<void>;
}

/** Finds the workspace root by walking up to pnpm-workspace.yaml (works from any package or from Next.js). */
export function workspaceRoot(from = process.cwd()): string {
  let current = resolve(from);
  while (!existsSync(join(current, "pnpm-workspace.yaml"))) {
    const parent = dirname(current);
    if (parent === current) return resolve(from);
    current = parent;
  }
  return current;
}

export const migrationsFolder = (): string => join(workspaceRoot(), "packages", "data", "drizzle");
export const localDataDir = (): string => join(workspaceRoot(), ".data", "pglite");
export const snapshotTarball = (): string =>
  process.env.FOR_THE_PEOPLE_DB_TARBALL ?? join(workspaceRoot(), ".data", "for-the-people.tar.gz");

function wrapPglite(pglite: PGlite): OpenDb {
  const db = drizzlePglite({ client: pglite, schema }) as unknown as Db;
  return { db, pglite, close: () => pglite.close() };
}

export async function openMemoryDb(
  options: { tarball?: Blob; migrate?: boolean } = {},
): Promise<OpenDb> {
  const pglite = await PGlite.create(options.tarball ? { loadDataDir: options.tarball } : {});
  const open = wrapPglite(pglite);
  if (options.migrate ?? !options.tarball) {
    await migratePglite(drizzlePglite({ client: pglite, schema }), {
      migrationsFolder: migrationsFolder(),
    });
  }
  return open;
}

/** Opens the on-disk PGlite folder for writing. A lock file keeps a second process from forking the data. */
export async function openFileDb(dataDir = localDataDir()): Promise<OpenDb> {
  const lock = `${dataDir}.lock`;
  if (existsSync(lock)) {
    const pid = Number(await readFile(lock, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive && pid !== process.pid) throw new Error(`${dataDir} is in use by process ${pid}.`);
  }
  await mkdir(dirname(dataDir), { recursive: true });
  await writeFile(lock, String(process.pid));
  const pglite = await PGlite.create(dataDir);
  await migratePglite(drizzlePglite({ client: pglite, schema }), {
    migrationsFolder: migrationsFolder(),
  });
  const open = wrapPglite(pglite);
  return {
    ...open,
    close: async () => {
      await pglite.close();
      await rm(lock, { force: true });
    },
  };
}

/** Neon for the ingestion CLI and CI: applies pending migrations in one transaction first. */
export async function openNeonDbMigrated(connectionString: string): Promise<OpenDb> {
  const open = openNeonDb(connectionString);
  await migrateNeon(open.db as unknown as Parameters<typeof migrateNeon>[0], { migrationsFolder: migrationsFolder() });
  return open;
}

export function openNeonDb(connectionString: string): OpenDb {
  const pool = new Pool({ connectionString });
  const db = drizzleNeon({ client: pool, schema }) as unknown as Db;
  return { db, pglite: null, close: () => pool.end() };
}

let shared: Promise<OpenDb> | null = null;

/** The read/write handle for request-time code (the web app). Lazily opened once per process. */
export function getDb(): Promise<Db> {
  shared ??= (async () => {
    const url = process.env.DATABASE_URL;
    if (url) return openNeonDb(url);
    const path = snapshotTarball();
    if (!existsSync(path)) {
      throw new Error(
        `No DATABASE_URL and no local snapshot at ${path}. Run "pnpm db:setup" first.`,
      );
    }
    return openMemoryDb({ tarball: new Blob([await readFile(path)]) });
  })();
  return shared.then((open) => open.db);
}
