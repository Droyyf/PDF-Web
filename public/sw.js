// sw.js — service worker. Caches the app shell + vendored libraries so a returning visitor
// loads the app from disk instead of re-downloading ~2 MB of pdf.js + pdf-lib from the network.
//
// Strategy: stale-while-revalidate for same-origin GETs. Serves the cached copy immediately
// (instant), kicks off a network refresh in the background, and stores the new copy for next
// time. Cross-origin requests (Google Fonts, etc.) pass straight through to the network so the
// SW never accidentally caches an opaque response we can't introspect.
//
// To force a fresh shell after a release, bump CACHE_NAME.

const CACHE_NAME = 'pdfw-v2';

const PRECACHE = [
    '/',
    '/index.html',
    '/css/styles.css',
    '/js/main.js',
    '/js/state.js',
    '/js/pdf-loader.js',
    '/js/preview.js',
    '/js/composition.js',
    '/js/export.js',
    '/js/frames.js',
    '/js/frame-store.js',
    '/js/frame-upload.js',
    '/js/frame-detect.js',
    '/js/documents-view.js',
    '/vendor/pdf.min.js',
    '/vendor/pdf.worker.min.js',
    '/vendor/pdf-lib.min.js',
    '/frames/sbs-book.svg',
    '/frames/sbs-ornate.svg',
    '/frames/top-classic.svg',
    '/frames/celtic.png',
    '/frames/leather-book.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) =>
                // Cache each asset independently: cache.addAll is all-or-nothing, so a
                // single 404 (e.g. a removed module still listed above) would fail the
                // whole install and the SW would never update again.
                Promise.allSettled(
                    PRECACHE.map((url) =>
                        fetch(url).then((res) => {
                            if (res.ok) return cache.put(url, res);
                        })
                    )
                )
            )
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((names) => Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n))))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    // Only handle GET requests on this origin. Anything else (POST, cross-origin) bypasses the SW.
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    if (url.origin !== self.location.origin) return;

    event.respondWith(
        caches.open(CACHE_NAME).then(async (cache) => {
            const cached = await cache.match(req);
            const networkFetch = fetch(req)
                .then((response) => {
                    // Only cache successful responses (status 200, basic type — same-origin, not opaque).
                    if (response && response.status === 200 && response.type === 'basic') {
                        cache.put(req, response.clone());
                    }
                    return response;
                })
                .catch(() => cached); // if the network is gone, fall back to whatever we had
            return cached || networkFetch;
        })
    );
});
