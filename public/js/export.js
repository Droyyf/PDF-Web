// export.js — render compositions at full resolution and download them.
// The global Packaging control (3-way) drives what gets exported:
//   combined  → one file for all citations across all docs
//   perdoc    → one file per doc (all its citations)
//   perpage   → one file per citation across all docs
// Filenames use each doc's real baseName (Feature 1). Same-named docs get _2, _3 suffixes.
//
// Memory discipline for "any size": pages are composed ONE AT A TIME and released
// immediately after they're embedded/downloaded — nothing ever holds all composed canvases
// at once (combined image export holds compressed PNG blobs instead, ~10× smaller than
// raw canvases).

import { state, docsWithCitations } from './state.js';
import { getCoverHiRes, fracToPixels, coverAspectOf, renderPageAtScale } from './composition.js';
import { getFrame, frameCanvasBorder, composeBook, composeSliced } from './frames.js';
import { toast } from './pdf-loader.js';

const PDFLib = window.PDFLib;
const EXPORT_SCALE = 2;
// Canvas caps: keep every export bitmap inside the tightest browser limit (Safari's ~16.7M
// px² area, everyone's 8192px+ side limits) so huge source pages degrade gracefully instead
// of failing to rasterize. Applies per composed page, not per document.
const EXPORT_MAX_SIDE = 8192;
const EXPORT_MAX_AREA = 16_000_000;

export function initExport() {
    document.getElementById('exportBtn')?.addEventListener('click', runExport);
}

async function runExport() {
    const docs = docsWithCitations();
    if (docs.length === 0) return;

    const format = document.getElementById('exportFormat')?.value || 'pdf';
    const btn = document.getElementById('exportBtn');
    const original = btn.textContent;
    btn.textContent = 'Exporting…';
    btn.disabled = true;

    try {
        switch (state.packaging) {
            case 'combined': await exportCombined(docs, format); break;
            case 'perdoc':   await exportPerDoc(docs, format);   break;
            case 'perpage':  await exportPerPage(docs, format);  break;
        }
        const total = docs.reduce((n, d) => n + d.selectedCitations.size, 0);
        toast(`Exported ${total} page(s) · ${state.packaging} · ${format.toUpperCase()}`, 'success');
    } catch (err) {
        console.error('Export failed:', err);
        toast('Export failed: ' + err.message, 'error');
    } finally {
        btn.textContent = original;
        btn.disabled = !state.documents.some((d) => d.selectedCitations.size > 0);
    }
}

// ---------------------------------------------------------------------------
// Three packaging modes
// ---------------------------------------------------------------------------

async function exportCombined(docs, format) {
    const name = docs.length === 1 ? docs[0].baseName : `${docs[0].baseName}+${docs.length - 1}-more`;
    if (format === 'pdf') await exportPDF(docs, name);
    else await exportCombinedImage(docs, format, name);
}

async function exportPerDoc(docs, format) {
    const names = dedupeBaseNames(docs);
    for (let i = 0; i < docs.length; i++) {
        if (format === 'pdf') await exportPDF([docs[i]], names[i]);
        else await exportCombinedImage([docs[i]], format, names[i]);
        if (i < docs.length - 1) await pause(200);
    }
}

async function exportPerPage(docs, format) {
    const names = dedupeBaseNames(docs);
    const ext = format === 'jpeg' ? 'jpg' : format;
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    let first = true;

    for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        const citations = [...doc.selectedCitations].sort((a, b) => a - b);
        const cover = await coverForDoc(doc, citations[0], EXPORT_SCALE);

        for (const ci of citations) {
            if (!first) await pause(150);
            first = false;
            const page = await doc.pdfDoc.getPage(ci + 1);
            const canvas = await composeForExport(doc, page, cover);
            if (format === 'pdf') {
                const pdfDoc = await PDFLib.PDFDocument.create();
                const img = await pdfDoc.embedPng(await canvasToBytes(canvas, 'image/png'));
                const pageRef = pdfDoc.addPage([canvas.width, canvas.height]);
                pageRef.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
                downloadBlob(new Blob([await pdfDoc.save()], { type: 'application/pdf' }),
                    `${names[i]}_p${ci + 1}.pdf`);
            } else {
                const blob = await new Promise((res) => canvas.toBlob(res, mime, 0.95));
                downloadBlob(blob, `${names[i]}_p${ci + 1}.${ext}`);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Stream every citation of the given docs into ONE multi-page PDF, composing and embedding
 * a page at a time. The source canvases become garbage right after each embed; only the
 * PDF's own (compressed) image data accumulates.
 */
async function exportPDF(docs, name) {
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (const doc of docs) {
        const citations = [...doc.selectedCitations].sort((a, b) => a - b);
        const cover = await coverForDoc(doc, citations[0], EXPORT_SCALE);
        for (const ci of citations) {
            const page = await doc.pdfDoc.getPage(ci + 1);
            const canvas = await composeForExport(doc, page, cover);
            const img = await pdfDoc.embedPng(await canvasToBytes(canvas, 'image/png'));
            const pageRef = pdfDoc.addPage([canvas.width, canvas.height]);
            pageRef.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
        }
    }
    downloadBlob(new Blob([await pdfDoc.save()], { type: 'application/pdf' }), `${name}.pdf`);
}

/**
 * Stack every composed page into one image, holding only compressed PNG blobs between the
 * compose pass and the draw pass (raw canvases for a 100-page export would not fit).
 */
async function exportCombinedImage(docs, format, name) {
    const GAP = 0;
    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';

    // Pass 1: compose each page once, keep {blob, w, h}; canvases are dropped immediately.
    const parts = [];
    for (const doc of docs) {
        const citations = [...doc.selectedCitations].sort((a, b) => a - b);
        const cover = await coverForDoc(doc, citations[0], EXPORT_SCALE);
        for (const ci of citations) {
            const page = await doc.pdfDoc.getPage(ci + 1);
            const canvas = await composeForExport(doc, page, cover);
            parts.push({
                blob: await new Promise((res) => canvas.toBlob(res, 'image/png')),
                w: canvas.width,
                h: canvas.height,
            });
        }
    }

    const maxW = Math.max(...parts.map((p) => p.w));
    const totalH = parts.reduce((s, p) => s + p.h, 0) + GAP * (parts.length - 1);
    const LIMIT = 16000;
    const scale = Math.min(1, LIMIT / Math.max(maxW, totalH));

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(maxW * scale));
    out.height = Math.max(1, Math.round(totalH * scale));
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);

    // Pass 2: decode + draw one blob at a time; close each bitmap to free its memory.
    let y = 0;
    for (const p of parts) {
        const bmp = await createImageBitmap(p.blob);
        const w = p.w * scale;
        const h = p.h * scale;
        ctx.drawImage(bmp, (out.width - w) / 2, y, w, h);
        bmp.close();
        y += h + GAP * scale;
    }

    downloadBlob(await new Promise((res) => out.toBlob(res, mime, 0.95)), `${name}.${ext}`);
}

/** Dedupe same-named docs: first keeps its name, duplicates get _2, _3 … */
function dedupeBaseNames(docs) {
    const seen = {};
    return docs.map((doc) => {
        const base = doc.baseName;
        seen[base] = (seen[base] || 0) + 1;
        return seen[base] === 1 ? base : `${base}_${seen[base]}`;
    });
}

/**
 * Cover hi-res for export: ask for citation-native width × export scale so the cover is
 * never upscaled into the composition (capped inside getCoverHiRes). Uses the FIRST citation
 * (same-doc citations share a page size in every realistic case).
 */
async function coverForDoc(doc, firstCi, scale) {
    let minWidth = 0;
    if (doc.coverPage !== null && firstCi !== undefined) {
        const page = await doc.pdfDoc.getPage(firstCi + 1);
        minWidth = page.getViewport({ scale: 1 }).width * scale;
    }
    return getCoverHiRes(doc, minWidth);
}

/**
 * Export render scale for one page: EXPORT_SCALE, capped so the composed bitmap stays
 * within browser canvas limits (huge poster-size pages come out slightly under 2× rather
 * than failing outright).
 */
function exportScaleFor(page) {
    const vp = page.getViewport({ scale: 1 });
    const side = Math.max(vp.width, vp.height);
    const area = vp.width * vp.height;
    return Math.max(
        0.1,
        Math.min(EXPORT_SCALE, EXPORT_MAX_SIDE / side, Math.sqrt(EXPORT_MAX_AREA / area))
    );
}

/** Full-resolution composed canvas for one citation, matching the doc's mode AND frame. */
async function composeForExport(doc, citationPage, cover) {
    const frame = getFrame(doc.frame);
    const citationCanvas = await renderPageAtScale(citationPage, exportScaleFor(citationPage));

    // Two-window frames (side-by-side only): citation + cover composed (same routine as preview).
    if (doc.mode === 'sidebyside' && (frame.type === 'book' || (frame.type === 'sliced' && frame.windows.length >= 2))) {
        const windows = [citationCanvas, cover ? cover.canvas : null];
        return frame.type === 'book'
            ? composeBook(frame, windows, citationCanvas.width * 2)
            : composeSliced(frame, windows, citationCanvas.width * 2);
    }

    let base;
    if (doc.mode === 'sidebyside') {
        const w = citationCanvas.width;
        const h = citationCanvas.height;
        base = document.createElement('canvas');
        base.width = w * 2;
        base.height = h;
        const ctx = base.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, base.width, base.height);
        ctx.drawImage(citationCanvas, 0, 0);
        if (cover) ctx.drawImage(cover.canvas, w, 0, w, h);
    } else {
        // Top mode: burn cover onto citation via the shared fracToPixels contract.
        if (cover) {
            const ctx = citationCanvas.getContext('2d');
            const rect = fracToPixels(
                doc.coverTransform,
                { width: citationCanvas.width, height: citationCanvas.height },
                coverAspectOf(cover)
            );
            ctx.drawImage(cover.canvas, rect.x, rect.y, rect.w, rect.h);
        }
        base = citationCanvas;
    }

    // Single-window frames wrap the whole composition: border (9-slice) or sliced (asymmetric bands).
    if (frame.type === 'border') return frameCanvasBorder(base, frame);
    if (frame.type === 'sliced') return composeSliced(frame, [base], base.width);
    return base;
}

/** PNG bytes via toBlob — no giant base64 data-URL round-trip (33% smaller, far less peak memory). */
async function canvasToBytes(canvas, mime) {
    const blob = await new Promise((res, rej) =>
        canvas.toBlob((b) => (b ? res(b) : rej(new Error('canvas encode failed'))), mime)
    );
    return new Uint8Array(await blob.arrayBuffer());
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

function pause(ms) {
    return new Promise((r) => setTimeout(r, ms));
}

