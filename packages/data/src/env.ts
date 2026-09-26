import { join, resolve } from "node:path";

/** Project root, resolved from this file so CLIs work from any working directory. */
export const repoRoot = (): string => process.env.FOR_THE_PEOPLE_ROOT ?? resolve(import.meta.dirname, "../../..");

export const rawCacheDir = (): string => join(repoRoot(), ".cache", "raw");
