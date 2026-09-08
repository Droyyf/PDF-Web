// export.js — render compositions at full resolution and download them.
// The global Packaging control (3-way) drives what gets exported:
//   combined  → one file for all citations across all docs
//   perdoc    → one file per doc (all its citations)
//   perpage   → one file per citation across all docs
// Filenames use each doc's real baseName (Feature 1). Same-named docs get _2, _3 suffixes.

import { state, docsWithCitations } from './state.js';
import { getCoverHiRes, fracToPixels, coverAspectOf, renderPageAtScale } from './composition.js';
import { getFrame, frameCanvasBorder, composeBook, composeSliced } from './frames.js';
import { toast } from './pdf-loader.js';

const PDFLib = window.PDFLib;
const EXPORT_SCALE = 2;

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
    const canvases = await collectCanvases(docs);
    const name = docs.length === 1 ? docs[0].baseName : `${docs[0].baseName}+${docs.length - 1}-more`;
    if (format === 'pdf') await exportPDF(canvases, name);
    else await exportCombinedImage(canvases, format, name);
}

async function exportPerDoc(docs, format) {
    const names = dedupeBaseNames(docs);
    for (let i = 0; i < docs.length; i++) {
        const canvases = await collectCanvases([docs[i]]);
        if (format === 'pdf') await exportPDF(canvases, names[i]);
        else await exportCombinedImage(canvases, format, names[i]);
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
        const cover = await getCoverHiRes(doc);
        const citations = [...doc.selectedCitations].sort((a, b) => a - b);

        for (const ci of citations) {
            if (!first) await pause(150);
            first = false;
            const page = await doc.pdfDoc.getPage(ci + 1);
            const canvas = await composeForExport(doc, page, cover);
            const filename = `${names[i]}_p${ci + 1}.${ext}`;

            if (format === 'pdf') {
                const pdfDoc = await PDFLib.PDFDocument.create();
                const img = await pdfDoc.embedPng(dataURLToBytes(canvas.toDataURL('image/png')));
                const pageRef = pdfDoc.addPage([canvas.width, canvas.height]);
                pageRef.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
                downloadBlob(new Blob([await pdfDoc.save()], { type: 'application/pdf' }),
                    `${names[i]}_p${ci + 1}.pdf`);
            } else {
                const blob = await new Promise((res) => canvas.toBlob(res, mime, 0.95));
                downloadBlob(blob, filename);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Collect composed canvases for all citations across the given docs, in order. */
async function collectCanvases(docs) {
    const canvases = [];
    for (const doc of docs) {
        const cover = await getCoverHiRes(doc);
        const citations = [...doc.selectedCitations].sort((a, b) => a - b);
        for (const ci of citations) {
            const page = await doc.pdfDoc.getPage(ci + 1);
            canvases.push(await composeForExport(doc, page, cover));
        }
    }
    return canvases;
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

/** Full-resolution composed canvas for one citation, matching the doc's mode AND frame. */
async function composeForExport(doc, citationPage, cover) {
    const frame = getFrame(doc.frame);
    const citationCanvas = await renderPageAtScale(citationPage, EXPORT_SCALE);

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

async function exportPDF(canvases, name) {
    const pdfDoc = await PDFLib.PDFDocument.create();
    for (const canvas of canvases) {
        const pngBytes = dataURLToBytes(canvas.toDataURL('image/png'));
        const img = await pdfDoc.embedPng(pngBytes);
        const pageRef = pdfDoc.addPage([canvas.width, canvas.height]);
        pageRef.drawImage(img, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    }
    downloadBlob(new Blob([await pdfDoc.save()], { type: 'application/pdf' }), `${name}.pdf`);
}

async function exportCombinedImage(canvases, format, name) {
    const GAP = 0;
    const maxW = Math.max(...canvases.map((c) => c.width));
    const totalH = canvases.reduce((s, c) => s + c.height, 0) + GAP * (canvases.length - 1);
    const LIMIT = 16000;
    const scale = Math.min(1, LIMIT / Math.max(maxW, totalH));

    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(maxW * scale));
    out.height = Math.max(1, Math.round(totalH * scale));
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, out.width, out.height);

    let y = 0;
    for (const c of canvases) {
        const w = c.width * scale;
        const h = c.height * scale;
        ctx.drawImage(c, (out.width - w) / 2, y, w, h);
        y += h + GAP * scale;
    }

    const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
    const ext = format === 'jpeg' ? 'jpg' : 'png';
    downloadBlob(await new Promise((res) => out.toBlob(res, mime, 0.95)), `${name}.${ext}`);
}

function dataURLToBytes(dataURL) {
    const base64 = dataURL.split(',')[1];
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
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
