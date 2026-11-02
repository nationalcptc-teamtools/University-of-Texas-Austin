/**
 * Keeps the app usable offline. Build files come from the cache. Pages come from the network
 * while it answers, and otherwise from a copy of `/`: every signed-in route renders in the
 * browser, so their pages are the same. Project files are cached the first time they load.
 */

type ExtendableEvent = Event & { waitUntil(work: Promise<unknown>): void };
type FetchEvent = ExtendableEvent & {
  request: Request;
  respondWith(response: Promise<Response>): void;
};
type ServiceWorkerScope = {
  addEventListener(type: "install" | "activate", listener: (event: ExtendableEvent) => void): void;
  addEventListener(type: "fetch", listener: (event: FetchEvent) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
};

/** Replaced at build time with the build's files and a hash of their names. */
declare const __BUILD__: { version: string; files: string[] };

const worker = self as unknown as ServiceWorkerScope;
const { version, files } = __BUILD__;
const BUILD_CACHE = `build-${version}`;
const IMAGES_CACHE = "images";
const BUILD_FILES = new Set(files);
const IMAGE_PATH = /^\/api\/p\/[^/]+\/assets\/[^/]+$/;

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(BUILD_CACHE);
      await cache.addAll(["/", ...BUILD_FILES]);
      await worker.skipWaiting();
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith("build-") && name !== BUILD_CACHE) await caches.delete(name);
      }
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== location.origin) return;
  if (request.mode === "navigate") event.respondWith(page(request));
  else if (BUILD_FILES.has(url.pathname)) event.respondWith(cacheFirst(BUILD_CACHE, request));
  else if (IMAGE_PATH.test(url.pathname)) event.respondWith(cacheFirst(IMAGES_CACHE, request));
});

async function page(request: Request) {
  try {
    return await fetch(request);
  } catch (error) {
    const shell = await caches.match("/", { cacheName: BUILD_CACHE });
    if (shell) return shell;
    throw error;
  }
}

async function cacheFirst(cacheName: string, request: Request) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
