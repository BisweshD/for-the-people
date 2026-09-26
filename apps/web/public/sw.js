/*
 * For The People service worker. One job: the ballot cheat sheet works offline.
 *
 * - Install: precache the cheat sheet page, every /_next/static asset its HTML references, and the
 *   Election Day calendar file.
 * - Navigations: network first. Offline, serve the cached page, or send the visitor to the cheat sheet.
 * - /_next/static: cache first only for responses the server marked immutable (production builds);
 *   everything else is network first with the cache as a fallback, so development never goes stale.
 * - GET /api/ballot (public race lists keyed by district, never an address): network first, cached for offline.
 *   The runtime cache keeps its newest RUNTIME_LIMIT entries, and "Clear all your data" deletes it
 *   (src/lib/offline-cache.ts).
 */

const VERSION = "v1";
const SHELL = `for-the-people-shell-${VERSION}`;
const RUNTIME = `for-the-people-runtime-${VERSION}`;
const CHEAT_SHEET = "/ballot/cheat-sheet";
const STATIC_FILES = ["/election-day-2026.ics", "/icon.png", "/brand/symbol.png", "/manifest.webmanifest"];
const RUNTIME_LIMIT = 150;

const ASSET_PATTERN = /\/_next\/static\/[A-Za-z0-9_\-./~%]+?\.(?:js|css|woff2?)/g;

async function putIfOk(cache, url) {
  try {
    const response = await fetch(url, { credentials: "same-origin" });
    if (response.ok) await cache.put(url, response);
  } catch {
    // Offline or the asset moved; the next online visit fills it in.
  }
}

/** Caches the cheat sheet's HTML and every static asset it references. */
async function cacheShell(pageResponse) {
  const cache = await caches.open(SHELL);
  const response =
    pageResponse ?? (await fetch(CHEAT_SHEET, { cache: "no-store", credentials: "same-origin" }));
  if (!response.ok) return;
  const html = await response.clone().text();
  await cache.put(CHEAT_SHEET, response);
  const assets = [...new Set(html.match(ASSET_PATTERN) ?? [])];
  await Promise.all([...assets, ...STATIC_FILES].map((url) => putIfOk(cache, url)));
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheShell(null).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL, RUNTIME]);
      for (const name of await caches.keys()) {
        if (name.startsWith("for-the-people-") && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  for (const request of keys.slice(0, Math.max(0, keys.length - RUNTIME_LIMIT))) {
    await cache.delete(request);
  }
}

async function navigate(event, url) {
  try {
    const response = await fetch(event.request);
    if (url.pathname === CHEAT_SHEET && response.ok) {
      event.waitUntil(cacheShell(response.clone()));
    }
    return response;
  } catch {
    const cache = await caches.open(SHELL);
    const cached = await cache.match(url.pathname);
    if (cached) return cached;
    if (await cache.match(CHEAT_SHEET)) return Response.redirect(CHEAT_SHEET, 302);
    return Response.error();
  }
}

async function staticAsset(event) {
  const cached = await caches.match(event.request);
  if (cached && (cached.headers.get("cache-control") ?? "").includes("immutable")) return cached;
  try {
    const response = await fetch(event.request);
    if (response.ok) {
      const cache = await caches.open(RUNTIME);
      event.waitUntil(cache.put(event.request, response.clone()).then(() => trim(cache)));
    }
    return response;
  } catch {
    return cached ?? Response.error();
  }
}

async function networkFirst(event) {
  const cache = await caches.open(RUNTIME);
  try {
    const response = await fetch(event.request);
    if (response.ok)
      event.waitUntil(cache.put(event.request, response.clone()).then(() => trim(cache)));
    return response;
  } catch {
    return (await caches.match(event.request)) ?? Response.error();
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(navigate(event, url));
  } else if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(staticAsset(event));
  } else if (url.pathname === "/api/ballot" || url.pathname.startsWith("/districts/")) {
    event.respondWith(networkFirst(event));
  } else if (STATIC_FILES.includes(url.pathname)) {
    event.respondWith(caches.match(request).then((cached) => cached ?? fetch(request)));
  }
});
