# One-Window "Cockpit" — Design Direction

**Date:** 2026-06-04
**Status:** Design direction, agreed in a think-only brainstorming session. No implementation
plan yet — captured for durability.

## Goal

Collapse PDF Composer into a single window. Remove the full-screen "scene" switches
(upload screen → All-Documents overview → per-document workspace → back) that make the app
feel like several separate screens. Keep every existing feature. Make the result compact.

## The constraint that shaped it

The app is multi-document by design (overview grid, per-document tabs, combined / per-doc /
per-page export), and the document count varies — sometimes 2–5, sometimes 15+. So "one
window" cannot mean every document's pages and preview rendered at once. It means **one
persistent surface with no scene-swaps**, where many documents and batch export stay
first-class.

## The layout — "Cockpit"

A persistent shell. Only the main area ever changes content; the top bar and rail are always
present, and the screen never swaps wholesale.

- **Top bar (always):** `+ Add PDFs` · packaging (Combined / Per document / Per page) ·
  format (PDF / PNG / JPEG) · `Export`.
- **Left rail (always):** a single rich document list. Each row = a mini line-art
  shape-poster + document name + summary (e.g. `12p · 3 citations · side-by-side`), carrying
  cover/citation state. `All / combined` is pinned at the top. **The rail replaces both the
  old tab bar and the old overview document grid** (the shape-posters move into the rail —
  one document list, not two).
- **Main area (the only thing whose content changes):**
  - **`All / combined`** — the view you land on: the combined, assembled export rendered
    live (every selected citation across every document, composed with its cover/frame/mode,
    grouped by document).
  - **A focused document** — its workspace, with the **live preview as the dominant column**
    and the page list as a thin strip beside it. (This roominess for the preview is what made
    the "filmstrip / single-focus" option tempting; it's preserved here without leaving one
    window.)

## Where every feature lives — nothing dropped

| Feature | Home in the Cockpit |
|---|---|
| Upload any PDF, any size | Top-bar `+ Add PDFs`, drag-drop over the window, empty-state drop card |
| Page list + on-demand thumbnails | Pages column (focused doc) |
| Auto cover + multi-citation select | Pages column toggles (★ cover / ○ citation) |
| Live preview of all citations | Preview column (focused doc), dominant |
| Side-by-side / Top modes + drag-resize | Preview controls |
| Synced cover transform | Preview (Top mode) |
| Frames (built-in + uploaded) | Frame picker in preview controls; upload/manage as a popover |
| All-Documents overview / combined | `All / combined` rail item → combined preview in main area |
| Export packaging (combined / per-doc / per-page) | Top-bar packaging select |
| Export format + run | Top-bar format select + `Export` |
| Loading / progress | Inline progress row in the rail (no full-screen takeover) |
| Switch documents | Rail (replaces tab bar) |

## Folded-in defaults (each vetoable)

1. **Land on `All`** after upload — already the app's current behavior; preserved, now as the
   rail's top item.
2. **Loading is inline** — a loading document shows as a rail row with a progress bar; no
   full-screen "Loading…" state. (Matters because multiple PDFs are added at once.)
3. **Frame management is a popover** off the Frame picker (upload / choose your own), not a
   separate screen.
4. **Upload lives in the empty state** plus the always-present `+ Add PDFs`; drag-drop works
   over the whole window.
5. **"Compact"** (tighter spacing, less chrome) is a polish pass applied on top of this
   skeleton, once the skeleton is agreed.

## Edge handled

Landing on `All` with documents loaded but **no citations selected yet**: the combined area
shows a prompt that guides the user into their first document (citation selection only happens
in a focused-doc workspace) — never a blank void.

## Out of scope / deferred

- Implementation (no code; this is a think-only design direction).
- The "compact" polish pass specifics (spacing, type, chrome).
- The frame-management popover's internals.
- No new features beyond keeping the existing set. (Cross-document reordering of the assembled
  output was considered and **not** adopted.)
