// preview.js — live view for the ACTIVE document. Builds one composition card per selected
// citation so all selected pages are viewable simultaneously (req #4). Side-by-side draws the
// cover into the card canvas; top mode layers a CSS-positioned cover over the citation,
// positioned from that document's shared cover transform (req #5–#8).
//
// buildSideBySideCard / buildTopCard are exported so documents-view.js can reuse them for the
// read-only combined preview (interactive=false skips the resize handle).

import { subscribe, getActiveDoc, DEFAULT_COVER_TRANSFORM } from './state.js';
import {
    renderPageToCanvas,
    composeSideBySide,
    getCoverHiRes,
    invalidateCoverCache,
    clampTransform,
    coverAspectOf,
} from './composition.js';
import { getFrame, borderWidthFor, applyBorderFrameCSS, composeBook, composeSliced, applySlicedBorderCSS } from './frames.js';

const DPR = Math.min(window.devicePixelRatio || 1, 2);

let el = {};
let renderToken = 0;
let currentCover = null; // active doc's hi-res cover (for aspect ratio during drag/resize)
let drag = null;

export function initPreview() {
    el = {
        previewList: document.getElementById('previewList'),
        previewEmpty: document.getElementById('previewEmpty'),
        resetBtn: document.getElementById('resetCoverBtn'),
    };

    el.resetBtn?.addEventListener('click', () => {
        const doc = getActiveDoc();
        if (!doc) return;
        doc.coverTransform = { ...DEFAULT_COVER_TRANSFORM };
        applyCoverTransformToAll();
    });

    // Interactive cover drag/resize (top mode only); any card gesture updates the shared transform.
    el.previewList.addEventListener('pointerdown', onCoverPointerDown);

    subscribe((reason) => {
        if (reason === 'cover' || reason === 'cleared' || reason === 'loaded') {
            invalidateCoverCache(getActiveDoc());
        }
        if (['selection', 'cover', 'mode', 'frame', 'loaded', 'cleared', 'tab', 'docs-added'].includes(reason)) {
            render();
        }
    });

    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(render, 200);
    });
}

async function render() {
    const token = ++renderToken;
    const doc = getActiveDoc();
    const citations = doc ? [...doc.selectedCitations].sort((a, b) => a - b) : [];
    const hasWork = !!doc?.pdfDoc && citations.length > 0;

    if (el.resetBtn) {
        el.resetBtn.classList.toggle(
            'hidden',
            !(hasWork && doc.mode === 'top' && doc.coverPage !== null)
        );
    }

    if (!hasWork) {
        el.previewList.innerHTML = '';
        el.previewList.appendChild(el.previewEmpty);
        el.previewEmpty.classList.remove('hidden');
        return;
    }
    el.previewEmpty.classList.add('hidden');

    const containerW = el.previewList.clientWidth || 700;
    const cover = await getCoverHiRes(doc);
    currentCover = cover;
    if (token !== renderToken) return;

    const frag = document.createDocumentFragment();
    for (const ci of citations) {
        const page = await doc.pdfDoc.getPage(ci + 1);
        if (token !== renderToken) return;
        const card =
            doc.mode === 'sidebyside'
                ? await buildSideBySideCard(doc, page, cover, ci, containerW)
                : await buildTopCard(doc, page, cover, ci, containerW, true);
        if (token !== renderToken) return;
        frag.appendChild(card);
    }

    el.previewList.innerHTML = '';
    el.previewList.appendChild(frag);
    applyCoverTransformToAll();
}

// ---------------------------------------------------------------------------
// Card builders — exported so documents-view.js can reuse them (interactive=false)
// ---------------------------------------------------------------------------

function cardShell(ci) {
    const card = document.createElement('div');
    card.className = 'composition-card';
    card.dataset.citation = String(ci);
    return card;
}

function cardLabel(doc, ci) {
    const label = document.createElement('div');
    label.className = 'composition-label';
    const coverNote = doc.coverPage !== null ? ` + cover p${doc.coverPage + 1}` : '';
    label.textContent = `${doc.baseName} · Page ${ci + 1}${coverNote}`;
    return label;
}

// Usable width for a framed composition inside the preview list, accounting for the box model:
// preview-list padding (20×2) + composition-card padding (10×2) + card border (1×2), plus slack.
function frameBudget(containerW) {
    return containerW - 64;
}

/**
 * Wrap a composition stage in a single-window border frame (CSS 9-slice).
 * If the framed result would overflow availableW, scale content AND border down by the same factor,
 * so the border-to-content ratio — the parity invariant vs the export 9-slice — is preserved exactly
 * (and the content can't be squished by max-width with a fixed-px border).
 */
function wrapWithBorderFrame(stage, frame, canvas, cssW, cssH, availableW) {
    let bw = borderWidthFor(frame, cssW, cssH);
    if (cssW + 2 * bw > availableW) {
        const s = availableW / (cssW + 2 * bw);
        cssW *= s; cssH *= s; bw *= s;
        canvas.style.width = cssW + 'px';
        canvas.style.height = cssH + 'px';
    }
    const wrap = document.createElement('div');
    wrap.className = 'frame-wrap';
    wrap.appendChild(stage);
    applyBorderFrameCSS(wrap, frame, bw);
    return wrap;
}

/**
 * Wrap an interactive stage in a single-window 'sliced' frame (asymmetric CSS border-image).
 * Like wrapWithBorderFrame but per-side; keeps the cover-layer drag working underneath. Scales
 * content + border down together if the framed result would overflow availableW.
 */
async function wrapWithSlicedFrame(stage, frame, canvas, cssW, cssH, availableW) {
    const wrap = document.createElement('div');
    wrap.className = 'frame-wrap';
    wrap.appendChild(stage);
    let bw = await applySlicedBorderCSS(wrap, frame, Math.min(cssW, cssH));
    const totalW = cssW + bw.l + bw.r;
    if (totalW > availableW) {
        const s = availableW / totalW;
        canvas.style.width = cssW * s + 'px';
        canvas.style.height = cssH * s + 'px';
        bw = { t: bw.t * s, r: bw.r * s, b: bw.b * s, l: bw.l * s };
        wrap.style.borderWidth = `${bw.t}px ${bw.r}px ${bw.b}px ${bw.l}px`;
        wrap.style.borderImageWidth = `${bw.t}px ${bw.r}px ${bw.b}px ${bw.l}px`;
    }
    return wrap;
}

export async function buildSideBySideCard(doc, page, cover, ci, containerW) {
    const frame = getFrame(doc.frame);
    const total = Math.min(containerW - 48, 760);
    const card = cardShell(ci);
    const stage = document.createElement('div');
    stage.className = 'composition-stage';

    if (frame.type === 'book' || frame.type === 'sliced') {
        // Two-window frames compose [citation | cover] directly; a single-window sliced frame wraps
        // the whole side-by-side composition. Either way → one canvas (no overlay drag).
        let canvas;
        if (frame.type === 'sliced' && frame.windows.length < 2) {
            const sbs = await composeSideBySide(page, cover, total / 2);
            canvas = await composeSliced(frame, [sbs], total * DPR);
        } else {
            const citation = await renderPageToCanvas(page, Math.round(total * 0.46));
            const windows = [citation, cover ? cover.canvas : null];
            canvas = frame.type === 'book'
                ? await composeBook(frame, windows, total * DPR)
                : await composeSliced(frame, windows, total * DPR);
        }
        canvas.style.width = total + 'px';
        canvas.style.height = 'auto';
        stage.appendChild(canvas);
        card.appendChild(stage);
    } else {
        const canvas = await composeSideBySide(page, cover, total / 2);
        stage.appendChild(canvas);
        if (frame.type === 'border') {
            const cssH = parseFloat(canvas.style.height) || total / 2;
            card.appendChild(wrapWithBorderFrame(stage, frame, canvas, total, cssH, frameBudget(containerW)));
        } else {
            card.appendChild(stage);
        }
    }

    card.appendChild(cardLabel(doc, ci));
    return card;
}

/**
 * Build a top-mode card.
 * @param {boolean} interactive  When false (overview): no resize handle, transform applied inline.
 */
export async function buildTopCard(doc, page, cover, ci, containerW, interactive = true) {
    const frame = getFrame(doc.frame);
    const w = Math.min(containerW - 48, 480);
    const citationCanvas = await renderPageToCanvas(page, w);

    const card = cardShell(ci);
    const stage = document.createElement('div');
    stage.className = 'composition-stage';
    stage.appendChild(citationCanvas);

    if (cover) {
        const layer = document.createElement('div');
        layer.className = 'cover-layer';
        if (!interactive) layer.style.pointerEvents = 'none';

        const img = document.createElement('img');
        img.src = cover.dataURL;
        img.alt = 'cover';
        img.draggable = false;
        layer.appendChild(img);

        if (interactive) {
            const handle = document.createElement('div');
            handle.className = 'cover-resize-handle';
            layer.appendChild(handle);
        } else {
            // Bake the current transform in so the read-only card shows the correct position.
            const t = doc.coverTransform;
            layer.style.left = `${t.xFrac * 100}%`;
            layer.style.top = `${t.yFrac * 100}%`;
            layer.style.width = `${t.scaleFrac * 100}%`;
        }

        stage.appendChild(layer);
    }

    // Border frame wraps the stage (outside it), so the cover-layer drag math — which measures the
    // stage's own box — is unaffected and top-mode interactivity keeps working underneath the frame.
    const cssH = parseFloat(citationCanvas.style.height) || w;
    let wrapped = stage;
    if (frame.type === 'border') {
        wrapped = wrapWithBorderFrame(stage, frame, citationCanvas, w, cssH, frameBudget(containerW));
    } else if (frame.type === 'sliced' && frame.windows.length === 1) {
        // Single-window sliced frame (e.g. Celtic) in top mode: asymmetric CSS border-image around
        // the interactive stage, so the cover stays draggable underneath.
        wrapped = await wrapWithSlicedFrame(stage, frame, citationCanvas, w, cssH, frameBudget(containerW));
    }
    card.appendChild(wrapped);
    card.appendChild(cardLabel(doc, ci));
    return card;
}

/**
 * Apply the active document's cover transform to EVERY top-mode card in the interactive preview
 * (req #8). Scoped to el.previewList so combined-preview cards in the overview are unaffected.
 * CSS percentages == fracToPixels, so preview and export match exactly.
 */
export function applyCoverTransformToAll() {
    const doc = getActiveDoc();
    if (!doc) return;
    const t = doc.coverTransform;
    el.previewList.querySelectorAll('.cover-layer').forEach((layer) => {
        layer.style.left = `${t.xFrac * 100}%`;
        layer.style.top = `${t.yFrac * 100}%`;
        layer.style.width = `${t.scaleFrac * 100}%`;
    });
}

// ---------------------------------------------------------------------------
// Interactive cover: drag to move, handle to resize (top mode, active doc only)
// ---------------------------------------------------------------------------

function onCoverPointerDown(e) {
    const doc = getActiveDoc();
    if (!doc || doc.mode !== 'top') return;
    const layer = e.target.closest('.cover-layer');
    if (!layer) return;

    const stage = layer.parentElement;
    drag = {
        mode: e.target.classList.contains('cover-resize-handle') ? 'resize' : 'move',
        stageRect: stage.getBoundingClientRect(),
        startX: e.clientX,
        startY: e.clientY,
        startT: { ...doc.coverTransform },
        coverAspect: coverAspectOf(currentCover),
    };
    window.addEventListener('pointermove', onCoverPointerMove);
    window.addEventListener('pointerup', onCoverPointerUp, { once: true });
    e.preventDefault();
}

function onCoverPointerMove(e) {
    if (!drag) return;
    const doc = getActiveDoc();
    if (!doc) return;
    const { stageRect, startX, startY, startT, coverAspect, mode } = drag;

    let next;
    if (mode === 'resize') {
        const coverLeftPx = startT.xFrac * stageRect.width;
        const newWidthPx = Math.max(8, e.clientX - stageRect.left - coverLeftPx);
        next = { xFrac: startT.xFrac, yFrac: startT.yFrac, scaleFrac: newWidthPx / stageRect.width };
    } else {
        const dxFrac = (e.clientX - startX) / stageRect.width;
        const dyFrac = (e.clientY - startY) / stageRect.height;
        next = { xFrac: startT.xFrac + dxFrac, yFrac: startT.yFrac + dyFrac, scaleFrac: startT.scaleFrac };
    }

    doc.coverTransform = clampTransform(next, stageRect, coverAspect);
    applyCoverTransformToAll();
}

function onCoverPointerUp() {
    drag = null;
    window.removeEventListener('pointermove', onCoverPointerMove);
}
