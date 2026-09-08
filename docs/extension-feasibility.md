# Extension Feasibility Report — PDF Composer as a browser extension

**Date:** 2026-09-09 · **Verdict: FEASIBLE — proven empirically, not just by analysis.**
The app already runs cleanly under a simulated Manifest V3 `extension_pages` CSP with zero
violations; the remaining work is packaging, not re-architecture.

## Why it was never really a "website backend" problem

The server is a static file server — it computes nothing. Extension pages are served from
the `chrome-extension://` origin, so every part of the app (ES modules, vendored pdf.js +
pdf-lib, workers, IndexedDB, blob URLs, canvas) is already available there. The single
process boundary the app depends on is the pdf.js Web Worker, which MV3 permits
(`worker-src` falls back to `script-src 'self'` — our worker is a bundled same-origin file).

## What was tested (empirical, this repo)

`MV3_SIM=1 node server.js` serves the app with CSP approximating MV3's
`extension_pages` policy: `script-src 'self'` (eval hard-banned), `style-src 'self'`
(no remote stylesheets), `font-src 'self'` (nothing remote at all).

Under that policy, the full user flow was executed in a real browser with a
`securitypolicyviolation` collector installed:

| Check | Result |
|---|---|
| CSP violations across the whole flow | **0** |
| Self-hosted fonts load (Anton / Space Grotesk / IBM Plex Mono) | ✓ all three |
| PDF parse in worker (`isEvalSupported: false`, the MV3-safe pdf.js path) | ✓ |
| Thumbnail renders, citation selection, Leather-frame composition | ✓ |
| Combined preview (2 composed cards) | ✓ |
| Console errors | 0 (only benign `RenderingCancelledException` from intentional render-token cancellation) |

Changes that made this pass (all committed, all also benefit the website):
1. **Fonts self-hosted** (`public/fonts/`, SIL OFL — Anton, Space Grotesk variable,
   IBM Plex Mono; ~43 KB total). The Google Fonts `<link>` is gone; the website is now
   fully offline too.
2. **`isEvalSupported: false`** passed to `getDocument` — pdf.js stays on its
   non-evaluating code path, which MV3's hard eval ban requires.
3. **`MV3_SIM=1` server mode** kept as a permanent regression harness: `npm start`
   stays normal; CI/manual checks can assert the app never regresses toward remote
   dependencies.

## Shipping checklist (what an actual extension needs)

1. **`manifest.json` (MV3)** — `action.default_popup` won't fit this app; ship it as a
   full-tab page (`chrome.tabs.create({ url: 'index.html' })` from a minimal background
   service worker, or let users pin it as their new-tab). `icons/` 16/32/48/128.
2. **Drop `sw.js` + its registration** — extension pages can't register a page service
   worker, and local assets need no caching layer. The service worker becomes the tiny
   background script instead (context menus, message relay).
3. **pdf.js companion assets** — the vendored build lacks `cmaps/` and
   `standard_fonts/`; most PDFs render fine, but CJK/odd-encoding documents need them.
   Bundle both directories from the pdf.js release and set `cMapUrl`/`standardFontDataUrl`.
4. **Content counter-indications** — none found: no eval, no remote code, no remote
   requests at all (now that fonts are local), which is exactly what Chrome Web Store
   review wants to see.

## Extension-only opportunities (the reason to do it)

- **Zero hosting**: the "server" disappears; distribution is the Web Store / an unpacked
  folder. No cost, no ops, full offline.
- **Context menu compose**: right-click any PDF link → "Compose with PDF Composer" — the
  background worker fetches it (no CORS problem with `host_permissions`) and hands the
  bytes to the app via messaging. Currently impossible on the web.
- **Local file access**: with "Allow access to file URLs", compose `file://` PDFs
  directly, or intercept PDF navigation into the composer.
- **`chrome.downloads`** for exports instead of `<a download>` (more reliable, and
  multi-file "per page" exports stop fighting the browser's multi-download prompt).

## Effort estimate

Packaging + manifest + icons + SW removal + CMaps: **half a day**. Context-menu /
remote-PDF ingestion with tests: **1–2 days**. Store listing, screenshots, review
buffers: **~1 day**. No architectural risk identified at any point.
