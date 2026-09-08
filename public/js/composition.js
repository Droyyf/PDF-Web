// composition.js — rendering core shared by the live preview and (later) export.
//
// Two contracts that must never drift between preview and export:
//   1. fracToPixels()/pixelsToFrac() are the SINGLE source of truth for mapping the shared
//      cover transform (fractions of the page) to pixels. The top-mode overlay positions via
//      CSS percentages (mathematically identical to fracToPixels), and export uses fracToPixels
//      directly — so what you drag is what you get.
//   2. The cover is rendered ONCE at high resolution and scaled DOWN (CSS for the overlay,
//      drawImage for export) — never up — so it stays crisp ("no quality loss").

// All functions take their inputs as parameters — no shared-state import needed.

const DPR = Math.min(window.devicePixelRatio || 1, 2);
// Hi-res cover render width. Sized generously so the cover is never upscaled at export:
// side-by-side export draws the cover into a half of width = citationNativeWidth × 2, which is
// ~1190px for A4 / ~1684px for A3 — 2000 covers those without quality loss.
const COVER_CAP_PX = 2000;

export function pageNativeSize(page) {
    const vp = page.getViewport({ scale: 1 });
    return { width: vp.width, height: vp.height };
}

// --- canonical coordinate mapping (the contract) ---------------------------

/**
 * Map the shared cover transform to a pixel rect within a page box.
 * @param {{xFrac,yFrac,scaleFrac}} t
 * @param {{width,height}} pageRect  page box in pixels
 * @param {number} coverAspect       coverNativeHeight / coverNativeWidth
 */
export function fracToPixels(t, pageRect, coverAspect) {
    const w = t.scaleFrac * pageRect.width;
    const h = w * coverAspect;
    return { x: t.xFrac * pageRect.width, y: t.yFrac * pageRect.height, w, h };
}

/** Inverse of fracToPixels for a cover rect's position/size (used by drag read-back). */
export function pixelsToFrac(px, pageRect) {
    return {
        xFrac: px.x / pageRect.width,
        yFrac: px.y / pageRect.height,
        scaleFrac: px.w / pageRect.width,
    };
}

/** Clamp a transform so the cover stays fully inside the page box of the given aspect. */
export function clampTransform(t, pageRect, coverAspect) {
    const scaleFrac = Math.max(0.02, Math.min(t.scaleFrac, 1));
    // cover height as a fraction of page height
    const hFrac = (scaleFrac * pageRect.width * coverAspect) / pageRect.height;
    const xFrac = Math.max(0, Math.min(t.xFrac, 1 - scaleFrac));
    const yFrac = Math.max(0, Math.min(t.yFrac, Math.max(0, 1 - hFrac)));
    return { xFrac, yFrac, scaleFrac };
}

// --- rendering primitives ---------------------------------------------------

/** Render a pdf.js page to a fresh canvas at the given render scale (raw, no CSS sizing). */
export async function renderPageAtScale(page, scale) {
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return canvas;
}

/** Render a pdf.js page to a fresh canvas sized for crisp display at `cssWidth`. */
export async function renderPageToCanvas(page, cssWidth) {
    const native = pageNativeSize(page);
    const canvas = await renderPageAtScale(page, (cssWidth * DPR) / native.width);
    canvas.style.width = cssWidth + 'px';
    canvas.style.height = cssWidth * (native.height / native.width) + 'px';
    return canvas;
}

/** Render (or return cached) the given document's cover page at high resolution. */
export async function getCoverHiRes(doc) {
    if (!doc || doc.coverPage === null) return null;
    const cached = doc._coverHiRes;
    if (cached && cached.page === doc.coverPage && cached.canvas) return cached;

    const page = await doc.pdfDoc.getPage(doc.coverPage + 1);
    const native = pageNativeSize(page);
    const scale = COVER_CAP_PX / native.width;
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width));
    canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    doc._coverHiRes = { page: doc.coverPage, canvas, dataURL: canvas.toDataURL('image/png'), native };
    return doc._coverHiRes;
}

/** Drop a document's cached cover (call when its cover page changes). */
export function invalidateCoverCache(doc) {
    if (doc) doc._coverHiRes = null;
}

export function coverAspectOf(cover) {
    return cover ? cover.native.height / cover.native.width : 1;
}

/**
 * Side-by-side composition: [citation | cover], two equal halves, flush, no gap, same size.
 * Returns a canvas sized for crisp display at total width = 2 * halfCssWidth.
 */
export async function composeSideBySide(citationPage, cover, halfCssWidth) {
    const native = pageNativeSize(citationPage);
    const halfPx = Math.round(halfCssWidth * DPR);
    const hPx = Math.max(1, Math.round(halfPx * (native.height / native.width)));

    const canvas = document.createElement('canvas');
    canvas.width = halfPx * 2;
    canvas.height = hPx;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Citation on the left.
    const scale = halfPx / native.width;
    const vp = citationPage.getViewport({ scale });
    await citationPage.render({ canvasContext: ctx, viewport: vp }).promise;

    // Cover on the right, stretched to the same box (equal size, flush — no separator).
    if (cover) ctx.drawImage(cover.canvas, halfPx, 0, halfPx, hPx);

    canvas.style.width = halfCssWidth * 2 + 'px';
    canvas.style.height = hPx / DPR + 'px';
    return canvas;
}
