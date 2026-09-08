// sw.js — service worker. Caches the app shell + vendored libraries so a returning visitor
// loads the app from disk instead of re-downloading ~2 MB of pdf.js + pdf-lib from the network.
//
// Strategy: stale-while-revalidate for same-origin GETs. Serves the cached copy immediately
// (instant), kicks off a network refresh in the background, and stores the new copy for next
// time. Cross-origin requests (Google Fonts, etc.) pass straight through to the network so the
// SW never accidentally caches an opaque response we can't introspect.
//
// To force a fresh shell after a release, bump CACHE_NAME.

const CACHE_NAME = 'pdfw-v5';

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
    '/frames/riso.svg',
    '/frames/deco.svg',
    '/frames/stamp.svg',
    '/frames/rules.svg',
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
    // Only handle GET requests.
    if (req.method !== 'GET') return;
    const url = new URL(req.url);
    // Never intercept blob:/data: URLs — they're context-scoped (pdf.js loads user PDFs via
    // blob URLs) and cannot be fetched from inside the SW.
    if (url.protocol === 'blob:' || url.protocol === 'data:') return;

    // Google Fonts (the only external origin): cache-first with CORS responses, so after the
    // first visit the app — including its typography — works fully offline. The stylesheet
    // <link> carries crossorigin="anonymous", which makes its response CORS-introspectable
    // (cacheable) instead of opaque.
    if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
        event.respondWith(
            caches.open(CACHE_NAME).then(async (cache) => {
                const hit = await cache.match(req.url);
                if (hit) return hit;
                try {
                    const res = await fetch(req);
                    if (res && res.ok && res.type === 'cors') cache.put(req, res.clone());
                    return res;
                } catch (err) {
                    return hit || Response.error();
                }
            })
        );
        return;
    }

    // Anything else cross-origin passes straight through to the network so the SW never
    // accidentally caches an opaque response we can't introspect.
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
