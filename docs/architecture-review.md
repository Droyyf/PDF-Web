# Architecture Review — PDF Composer

**Date:** 2026-09-09 · **Scope:** scalability & maintainability assessment of the current
client-heavy architecture, with prioritized recommendations.

## System shape

```
server.js (Express 5, ~70 lines)     ← static files + CSP + compression + /api/health
public/
  index.html                         ← one-page cockpit shell (header / rail / main)
  sw.js                              ← offline cache (app shell + fonts), stale-while-revalidate
  js/
    state.js        (93 lines)   ← doc model + tiny pub/sub, imports nothing
    pdf-loader.js  (470+)        ← file intake, lazy thumbnails, selection, toasts
    composition.js (150+)        ← fracToPixels contract, hi-res cover cache, render primitives
    preview.js     (350+)        ← live cards, drag/resize cover, selection diffing
    documents-view.js (300+)     ← rail + combined view + navigation
    frames.js      (450+)        ← 3 frame engines (border 9-slice, procedural book, sliced N-window)
    frame-detect.js (100)        ← window detection from image transparency
    frame-upload.js / frame-store.js / help.js
    export.js      (290)         ← streaming export, 3 packagings × 3 formats
```

All PDF processing is client-side (pdf.js worker + pdf-lib); the server never touches
documents. Multi-user scalability is therefore a **CDN problem, not a compute problem** —
the origin serves ~immutable static assets and nothing else.

## What's working well

1. **State isolation.** `state.js` imports nothing; every module talks through
   `subscribe(reason)`/`notify(reason)`. No cycles, easy to reason about, trivially testable.
2. **One rendering contract.** The shared cover transform + `fracToPixels()` is the single
   source of truth for preview and export — the hardest class of bug (WYSIWYG drift) is
   structurally prevented.
3. **Streaming discipline.** Thumbnails, page previews, and export all compose
   incrementally and release resources; combined-image export holds compressed blobs.
   Memory is bounded regardless of document size (measured: 150-page session ≈ 7 MB heap).
4. **Asset normalization at the boundary.** Frame assets are measured/trimmed/re-derived on
   load, so bad assets can't reintroduce layout bugs — the system self-heals rather than
   trusting hand-tuned constants.
5. **Server minimalism.** No uploads, no sessions, no DB → no backend attack surface beyond
   static serving; CSP has no `'unsafe-inline'`; deps are 3.

## Scalability limits (and why they're acceptable — for now)

| Dimension | Current ceiling | Boundary | When it matters |
|---|---|---|---|
| Pages per doc | ~10k practical | DOM nodes per card (content-visibility mitigates paint, not node count) | 500+ page lists scroll fine; 10k+ needs virtualization |
| Documents per session | ~20–50 | Each doc holds a pdf.js worker doc + cover cache (~25 MB) | Rail rows stay cheap; memory is the limiter, not the UI |
| Export size | ~100s of pages | pdf-lib holds the whole output PDF in memory by necessity | 100-page PDF export ≈ fine; 1000-page image-heavy export will strain |
| Concurrent users | CDN-scale | Origin is stateless | Deploy behind any static host/CDN (Netlify/Vercel/Cloudflare) with zero changes |

## Maintainability risks, prioritized

1. **[P1] No client-side tests.** The server has a smoke suite; the 2,600 lines of UI logic
   (the fracToPixels contract, the sliced engine, export math) have none. These are pure
   functions — extractable and unit-testable with `node --test` + a canvas stub.
2. **[P1] String-typed pub/sub reasons.** `notify('selection')` / `if (['tab', 'loaded'…]…`
   — adding a reason requires grepping every subscriber. Cheap fix: a frozen `REASONS`
   enum in state.js; a typed event map if/when TS arrives.
3. **[P2] Per-module element caching.** Each module caches `getElementById` at init. IDs are
   the de-facto module contract but nothing enforces them (a renamed ID fails silently at
   runtime). A single `ids` map module (or simply consistency discipline) reduces drift.
4. **[P2] README drift.** The README still describes the pre-cockpit app. New-contributor
   onboarding starts with wrong information.
5. **[P3] No TypeScript/JSDoc types.** Doc shape lives implicitly in `createDoc()`. JSDoc
   typedefs for `Doc`, `Frame`, `Window` would cost little and buy editor-level safety.
6. **[P3] Single-person bus factor.** All context lives in this conversation + two docs.
   The ADR/spec folder should grow with each significant decision (the cockpit spec and
   this review are the pattern).

## Recommended next steps

1. Extract pure logic (`composition.js` mapping/clamping, `frame-detect.js`, export naming)
   into testable units; add a `node --test` suite with a minimal canvas mock. *(P1)*
2. Introduce a `REASONS` const and use it at every `notify`/`subscribe` site. *(P1)*
3. Rewrite the README to match the cockpit app; link `docs/architecture-review.md`. *(P2)*
4. If the feature set keeps growing (reordering, annotations, presets), adopt JSDoc typedefs
   first, then a type-check step (`tsc --noEmit --allowJs --checkJs`) in CI. *(P3)*
5. Deployment story: any static host + a one-line SW cache-version bump per release
   (already the convention). Add a `VERSION` constant surfaced in Help for supportability.
