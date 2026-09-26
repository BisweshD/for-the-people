import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { clearRuntimeCaches, RUNTIME_CACHE_PREFIX } from "../src/lib/offline-cache";

/**
 * R2-L4: "Clear all your data" also deletes the service worker's
 * runtime cache, which holds /api/ballot answers keyed by district ids, and that cache stays bounded.
 */

const SW = readFileSync(join(__dirname, "..", "public", "sw.js"), "utf8");

type Key = { url: string };

/** Enough of the Cache Storage API for sw.js: named caches of responses, in insertion order. */
class FakeCaches {
  readonly stores = new Map<string, Map<string, Response>>();

  async open(name: string) {
    let store = this.stores.get(name);
    if (!store) this.stores.set(name, (store = new Map()));
    const entries = store;
    const urlOf = (request: Key | string) => (typeof request === "string" ? request : request.url);
    return {
      put: async (request: Key | string, response: Response) => {
        entries.delete(urlOf(request));
        entries.set(urlOf(request), response);
      },
      match: async (request: Key | string) => entries.get(urlOf(request)),
      keys: async () => [...entries.keys()].map((url) => ({ url })),
      delete: async (request: Key | string) => entries.delete(urlOf(request)),
    };
  }

  async match(request: Key) {
    for (const store of this.stores.values()) {
      const hit = store.get(request.url);
      if (hit) return hit;
    }
    return undefined;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }

  async has(name: string) {
    return this.stores.has(name);
  }
}

function loadWorker() {
  const caches = new FakeCaches();
  const handlers = new Map<string, (event: unknown) => void>();
  const origin = "https://for-the-people.example";
  runInNewContext(SW, {
    self: {
      location: { origin },
      addEventListener: (type: string, handler: (event: unknown) => void) =>
        handlers.set(type, handler),
      clients: { claim: async () => undefined },
      skipWaiting: async () => undefined,
    },
    caches,
    fetch: async () => new Response("{}", { status: 200 }),
    Response,
    URL,
    Promise,
    Set,
  });
  const runtimeName = /const RUNTIME = `([^`]+)\$\{VERSION\}`/.exec(SW)?.[1];
  const version = /const VERSION = "([^"]+)"/.exec(SW)?.[1];
  const limit = Number(/const RUNTIME_LIMIT = (\d+)/.exec(SW)?.[1]);

  async function get(path: string) {
    const pending: Promise<unknown>[] = [];
    let response: Promise<Response> | undefined;
    handlers.get("fetch")!({
      request: { method: "GET", url: `${origin}${path}`, mode: "cors" },
      respondWith: (value: Promise<Response>) => (response = value),
      waitUntil: (value: Promise<unknown>) => pending.push(value),
    });
    await response;
    await Promise.all(pending);
  }

  return { caches, get, runtime: `${runtimeName}${version}`, limit };
}

describe("the service worker's runtime cache", () => {
  test("is the cache Clear all your data deletes", () => {
    const { runtime } = loadWorker();
    expect(runtime).toBe("for-the-people-runtime-v1");
    expect(runtime.startsWith(RUNTIME_CACHE_PREFIX)).toBe(true);
  });

  test("network-first responses are trimmed to a bounded size", async () => {
    const { caches, get, runtime, limit } = loadWorker();
    expect(limit).toBeGreaterThan(0);
    for (let index = 0; index < limit + 40; index++)
      await get(`/api/ballot?districts=TX-${index}%40cd120`);
    const store = caches.stores.get(runtime)!;
    expect(store.size).toBeLessThanOrEqual(limit);
    // The oldest entries go first.
    expect(store.has("https://for-the-people.example/api/ballot?districts=TX-0%40cd120")).toBe(
      false,
    );
    expect(
      store.has(`https://for-the-people.example/api/ballot?districts=TX-${limit + 39}%40cd120`),
    ).toBe(true);
  });
});

describe("clearRuntimeCaches", () => {
  test("deletes every runtime cache and keeps the offline cheat sheet's shell", async () => {
    const caches = new FakeCaches();
    await caches.open("for-the-people-runtime-v1");
    await caches.open("for-the-people-runtime-v0");
    await caches.open("for-the-people-shell-v1");
    await clearRuntimeCaches(caches as unknown as CacheStorage);
    expect(await caches.keys()).toEqual(["for-the-people-shell-v1"]);
  });

  test("does nothing where Cache Storage is missing or refuses", async () => {
    await expect(clearRuntimeCaches(undefined)).resolves.toBeUndefined();
    const refusing = {
      keys: async () => {
        throw new Error("SecurityError");
      },
    } as unknown as CacheStorage;
    await expect(clearRuntimeCaches(refusing)).resolves.toBeUndefined();
  });
});
