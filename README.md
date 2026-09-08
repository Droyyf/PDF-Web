# PDF Composer

A browser-based tool for composing a **cover page** onto selected **citation pages** of a PDF.
All processing happens client-side (PDF.js + pdf-lib via CDN); the Node server only serves the
static files.

## Features

1. **Upload any PDF, any size** — loaded entirely in the browser (no upload limit). Page
   thumbnails render on demand as you scroll, so large documents (hundreds of pages) stay fast.
2. **Page list** — every page shown as a thumbnail with citation / cover toggles.
3. **Auto cover + multi-citation** — the first page is auto-selected as the cover; select any number
   of citation pages.
4. **Live preview** — every selected citation is previewed simultaneously, each composed with the
   cover.
5. **Two modes**
   - **Side-by-side** (default): citation and cover rendered at equal size, flush, no gap.
   - **Top**: the cover is overlaid on the citation at 10% (default), draggable and resizable.
6. **Synced editing** — in top mode, moving/resizing the cover on any one page updates every page
   at once (the transform is stored as fractions of the page, so it applies identically everywhere).
7. **Export** *(optional)* — a **Batch** toggle (shown when more than one citation is selected)
   controls packaging:
   - **Batch on** (default): a single file — a multi-page PDF, or one combined image with every
     page stacked into a single PNG/JPEG.
   - **Batch off**: one file per citation — a single-page PDF each, or one image each (the browser
     may prompt to allow multiple downloads).

## Run

```bash
npm install
npm start            # serves http://localhost:3000  (or: npm run dev)
```

## Architecture

```
server.js                 # static file server + CSP (no PDF processing)
public/
  index.html              # markup
  css/styles.css          # functional styling
  js/
    main.js               # bootstrap + mode switch wiring
    state.js              # shared state + pub/sub + shared cover transform
    pdf-loader.js         # client-side load, page list, on-demand thumbnails, selection
    composition.js        # render core: fracToPixels contract, hi-res cover cache, both modes
    preview.js            # live per-citation cards + interactive (drag/resize) cover, synced
    export.js             # multi-page PDF / per-page image export
```

Key design point: the shared cover transform `{xFrac, yFrac, scaleFrac}` and a single
`fracToPixels()` mapping are used by both the live preview and export, so the exported result
always matches what you positioned on screen.

## Notes

- Requires a modern browser (ES modules, IntersectionObserver, Pointer Events).
- "Any size" is bounded by available browser memory; the page list is rendered on demand to push
  that bound as high as practical.
