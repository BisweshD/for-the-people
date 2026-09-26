/**
 * The service worker (public/sw.js) keeps /api/ballot answers, which are keyed by district ids, in its
 * runtime cache ("for-the-people-runtime-<version>") so the ballot works offline. "Clear all your data" deletes
 * that cache too. The shell cache holds only the static cheat
 * sheet page and assets, nothing about the voter, so it stays for offline use.
 */

export const RUNTIME_CACHE_PREFIX = "for-the-people-runtime-";

export async function clearRuntimeCaches(
  storage: CacheStorage | undefined = globalThis.caches,
): Promise<void> {
  if (!storage) return;
  try {
    const names = await storage.keys();
    await Promise.all(
      names
        .filter((name) => name.startsWith(RUNTIME_CACHE_PREFIX))
        .map((name) => storage.delete(name)),
    );
  } catch {
    // Cache Storage is off (some private windows); the service worker cannot have cached anything.
  }
}
