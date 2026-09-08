// documents-view.js — the persistent left rail (All / combined + per-doc rows) and the
// combined preview that fills the main area on the All tab. The rail replaces both the old
// tab bar and the old All-Documents shape-poster grid. A single pub/sub subscriber drives
// all header + rail + main-area panel updates.

import { state, subscribe, notify, getDoc } from './state.js';
import { getCoverHiRes } from './composition.js';
import { buildSideBySideCard, buildTopCard } from './preview.js';
import { destroyDoc, toast } from './pdf-loader.js';
import { ICONS } from './icons.js';

let el = {};
let combinedToken = 0; // cancels stale combined-preview renders

export function initDocumentsView() {
    el = {
        appRail: document.getElementById('appRail'),
        railAllRow: document.getElementById('railAllRow'),
        railAllSummary: document.getElementById('railAllSummary'),
        railDocs: document.getElementById('railDocs'),
        overviewPanel: document.getElementById('overviewPanel'),
        combinedPreview: document.getElementById('combinedPreview'),
        uploadCard: document.getElementById('dropZone'),
        workspace: document.getElementById('workspace'),
        exportBtn: document.getElementById('exportBtn'),
        exportFormat: document.getElementById('exportFormat'),
        packagingSelect: document.getElementById('packagingSelect'),
        docCount: document.getElementById('docCount'),
        addPdfBtn: document.getElementById('addPdfBtn'),
        fileInput: document.getElementById('fileInput'),
    };

    // Pinned All / combined row at the top of the rail
    el.railAllRow.addEventListener('click', () => {
        if (state.activeTab !== 'all') switchTab('all');
    });

    // Per-doc rail rows (event-delegated)
    el.railDocs.addEventListener('click', (e) => {
        const remove = e.target.closest('.rail-remove');
        if (remove) {
            removeDoc(remove.closest('[data-tab]').dataset.tab);
            return;
        }
        const row = e.target.closest('[data-tab]');
        if (!row || row.dataset.tab === state.activeTab) return;
        switchTab(row.dataset.tab);
    });

    // Combined-view cards navigate: click a composed card → that page in its workspace
    el.combinedPreview.addEventListener('click', (e) => {
        const card = e.target.closest('.composition-card');
        if (!card?.dataset.docId) return;
        jumpToPage(card.dataset.docId, Number(card.dataset.citation));
    });
    // …and the same by keyboard (Enter/Space) — the cards are real controls, not decoration
    el.combinedPreview.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const card = e.target.closest('.composition-card');
        if (!card?.dataset.docId) return;
        e.preventDefault();
        jumpToPage(card.dataset.docId, Number(card.dataset.citation));
    });

    el.packagingSelect?.addEventListener('change', (e) => {
        state.packaging = e.target.value;
        // No notify needed — packaging is read at export time
    });

    el.addPdfBtn?.addEventListener('click', () => el.fileInput.click());

    // Re-render the combined preview when the window is resized while on the All tab
    // (otherwise the combined cards keep the width they were rendered at).
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (state.activeTab === 'all' && state.documents.some((d) => d.selectedCitations.size > 0)) {
                renderCombinedPreview();
            }
        }, 200);
    });

    subscribe((reason) => {
        const hasDocs = state.documents.length > 0;

        // Header controls. "+ Add PDFs" and Help are permanent (single-page shell); the
        // export cluster only exists once there is something to export.
        el.docCount?.classList.toggle('hidden', !hasDocs);
        el.packagingSelect?.classList.toggle('hidden', !hasDocs);
        el.exportFormat?.classList.toggle('hidden', !hasDocs);
        el.exportBtn?.classList.toggle('hidden', !hasDocs);

        if (hasDocs) {
            el.docCount.textContent = `${state.documents.length} doc${state.documents.length === 1 ? '' : 's'}`;
        }

        // Rail is part of the permanent shell; its per-doc rows re-render on changes.
        if (
            hasDocs &&
            ['loaded', 'docs-added', 'tab', 'cleared', 'selection', 'cover', 'mode', 'frame'].includes(reason)
        ) {
            renderRail();
        } else if (!hasDocs) {
            el.railAllSummary.textContent = allSummary();
            el.railAllRow.classList.toggle('active', state.activeTab === 'all');
            el.railDocs.replaceChildren();
        }

        // Export button enabled state (any doc has citations)
        if (el.exportBtn) {
            el.exportBtn.disabled = !state.documents.some((d) => d.selectedCitations.size > 0);
        }

        // Main area: the combined view is always the All-tab content; the inline upload
        // card gives way once documents exist.
        if (['loaded', 'docs-added', 'tab', 'cleared'].includes(reason)) {
            showCurrentView();
        }
        if (!hasDocs && ['cleared', 'loaded'].includes(reason)) {
            el.combinedPreview.replaceChildren(); // nothing stale behind the upload card
        }

        // Combined preview when on All tab (skip when nothing relevant changed)
        if (
            state.activeTab === 'all' &&
            hasDocs &&
            ['loaded', 'docs-added', 'tab', 'selection', 'cover', 'mode', 'frame'].includes(reason)
        ) {
            renderCombinedPreview();
        }
    });
}

/** Switch the active tab and update the UI. */
export function switchTab(tabId) {
    state.activeTab = tabId;
    notify('tab');
    showCurrentView();
}

/**
 * Remove one document: free its resources, drop it from state, and land somewhere sane
 * (the All tab). When the last doc goes, the app returns to the empty/upload state.
 */
function removeDoc(id) {
    const doc = getDoc(id);
    if (!doc) return;
    destroyDoc(doc);
    state.documents.splice(state.documents.findIndex((d) => d.id === id), 1);
    toast(`Removed "${doc.baseName}"`, 'info');
    if (state.activeTab !== id) {
        notify('docs-added'); // rail + header re-render; current view untouched
        return;
    }
    state.activeTab = 'all';
    if (state.documents.length === 0) notify('cleared');
    else notify('tab');
    showCurrentView();
}

/** Navigate from a combined-view card to that page inside its document's workspace. */
function jumpToPage(docId, citationIndex) {
    if (!getDoc(docId)) return;
    switchTab(docId);
    // The tab switch rebuilds the page list synchronously; scroll after layout settles.
    requestAnimationFrame(() => {
        const card = document.querySelector(`.page-card[data-page="${citationIndex}"]`);
        if (!card) return;
        card.scrollIntoView({ block: 'center' });
        card.classList.add('flash');
        setTimeout(() => card.classList.remove('flash'), 1300);
    });
}

/** Show the correct content: All tab (with inline upload card when empty) vs a focused doc. */
export function showCurrentView() {
    const hasDocs = state.documents.length > 0;
    const isAll = state.activeTab === 'all';

    el.overviewPanel.classList.toggle('hidden', hasDocs && !isAll);
    el.uploadCard.classList.toggle('hidden', hasDocs);
    el.workspace.classList.toggle('hidden', !hasDocs || isAll);
}

// ---------------------------------------------------------------------------
// Rail
// ---------------------------------------------------------------------------

function renderRail() {
    // Update the pinned All row's summary line
    el.railAllSummary.textContent = allSummary();
    el.railAllRow.classList.toggle('active', state.activeTab === 'all');

    // Diff per-doc rows: rebuild from scratch (small N, cheap, idempotent)
    el.railDocs.replaceChildren();
    const frag = document.createDocumentFragment();
    let idx = 0;
    for (const doc of state.documents) {
        frag.appendChild(buildRailRow(doc, idx));
        idx++;
    }
    el.railDocs.appendChild(frag);
}

/**
 * Render a doc's FIRST PAGE once as the rail row's thumbnail (real page, not line-art).
 * Sized for the ~48×64px display box at 2× (96×128) — sharp, and cheap per doc. The URL is
 * cached on the doc and revoked by destroyDoc().
 */
async function ensureRailThumb(doc) {
    if (!doc.pdfDoc) return null;
    if (doc.railThumb) return doc.railThumb;
    if (!doc._railThumbPromise) {
        doc._railThumbPromise = (async () => {
            const page = await doc.pdfDoc.getPage(1);
            const native = page.getViewport({ scale: 1 });
            const scale = Math.min(96 / native.width, 128 / native.height);
            const viewport = page.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.max(1, Math.round(viewport.width));
            canvas.height = Math.max(1, Math.round(viewport.height));
            await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
            page.cleanup();
            const blob = await new Promise((res, rej) =>
                canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png')
            );
            doc.railThumb = URL.createObjectURL(blob);
            return doc.railThumb;
        })().catch((err) => {
            console.warn('Rail thumbnail failed:', err);
            return null;
        });
    }
    return doc._railThumbPromise;
}

function buildRailRow(doc, idx) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'rail-row';
    row.dataset.tab = doc.id;
    if (state.activeTab === doc.id) row.classList.add('active');
    if (doc.selectedCitations.size > 0) row.classList.add('has-cit');
    if (!doc.pdfDoc) row.classList.add('rail-row--loading');

    const remove = document.createElement('span');
    remove.className = 'rail-remove';
    remove.role = 'button';
    remove.tabIndex = 0; // keyboard-reachable (design law gate 4)
    remove.title = 'Remove document';
    remove.setAttribute('aria-label', `Remove ${doc.baseName}`);
    remove.innerHTML = ICONS.x;
    remove.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            e.stopPropagation();
            removeDoc(doc.id);
        }
    });
    row.appendChild(remove);

    const thumb = document.createElement('span');
    thumb.className = 'rail-thumb';
    if (doc.railThumb) {
        // Real first-page thumbnail (rendered once per doc by ensureRailThumb below).
        const img = document.createElement('img');
        img.alt = '';
        img.src = doc.railThumb;
        thumb.appendChild(img);
    } else {
        // Placeholder identity mark until the first-page render lands.
        thumb.setAttribute('aria-hidden', 'true');
        thumb.appendChild(lineArtShape(idx));
        if (doc.pdfDoc) {
            ensureRailThumb(doc).then((url) => {
                if (!url) return;
                const live = document.querySelector(`.rail-row[data-tab="${doc.id}"] .rail-thumb`);
                if (live && !live.querySelector('img')) {
                    const img = document.createElement('img');
                    img.alt = '';
                    img.src = url;
                    live.replaceChildren(img);
                }
            }).catch(() => { /* keep the line-art placeholder */ });
        }
    }

    const info = document.createElement('span');
    info.className = 'rail-info';

    const name = document.createElement('span');
    name.className = 'rail-name';
    name.title = doc.fileName;
    name.textContent = doc.baseName;

    const summary = document.createElement('span');
    summary.className = 'rail-summary';
    summary.textContent = docSummary(doc);

    info.appendChild(name);
    info.appendChild(summary);
    row.appendChild(thumb);
    row.appendChild(info);
    return row;
}

function allSummary() {
    const docs = state.documents;
    const totalCits = docs.reduce((n, d) => n + d.selectedCitations.size, 0);
    return `${docs.length} doc${docs.length === 1 ? '' : 's'} · ${totalCits} citation${totalCits !== 1 ? 's' : ''}`;
}

function docSummary(doc) {
    if (!doc.pdfDoc) return 'loading…';
    const pages = `${doc.pageCount}p`;
    const cits = doc.selectedCitations.size;
    const mode = doc.mode === 'sidebyside' ? 'side-by-side' : 'top';
    return `${pages} · ${cits} citation${cits !== 1 ? 's' : ''} · ${mode}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    return node;
}

/**
 * Mini shape-poster line-art — concentric line forms (funnel / coil / rosette),
 * one variant per doc index, recolored via currentColor. Used as the rail row's identity
 * mark when a doc has no real cover thumbnail.
 */
function lineArtShape(seed) {
    const svg = svgEl('svg', {
        class: 'rail-shape', viewBox: '0 0 120 160', fill: 'none',
        stroke: 'currentColor', 'stroke-width': '1.1', preserveAspectRatio: 'xMidYMid meet',
    });
    const add = (tag, attrs) => svg.appendChild(svgEl(tag, attrs));
    const variant = ((seed % 3) + 3) % 3;
    if (variant === 0) {
        for (let i = 0; i < 22; i++) { const t = i / 21; add('ellipse', { cx: 60, cy: (34 + t * 78).toFixed(1), rx: (7 + t * 47).toFixed(1), ry: (4 + t * 26).toFixed(1) }); }
    } else if (variant === 1) {
        for (let r = 0; r < 3; r++) { const y = 14 + r * 46; for (let i = 0; i < 8; i++) { const n = i * 2.2; add('rect', { x: (12 + n).toFixed(1), y: (y + n).toFixed(1), width: (96 - n * 2).toFixed(1), height: (38 - n * 2).toFixed(1), rx: (18 - n).toFixed(1) }); } }
    } else {
        for (let i = 0; i < 22; i++) { add('ellipse', { cx: 60, cy: 80, rx: 46, ry: 17, transform: `rotate(${(i * 8.18).toFixed(1)} 60 80)` }); }
    }
    return svg;
}

// ---------------------------------------------------------------------------
// Combined preview (All / combined tab)
// ---------------------------------------------------------------------------

async function renderCombinedPreview() {
    const token = ++combinedToken;
    const docs = state.documents.filter((d) => d.pdfDoc && d.selectedCitations.size > 0);

    el.combinedPreview.replaceChildren();

    if (docs.length === 0) {
        const msg = document.createElement('p');
        msg.className = 'preview-empty';
        // Cockpit edge: docs loaded but no citations yet — guide into a focused doc.
        msg.textContent = state.documents.length > 0
            ? 'Select citation pages inside a document (use the rail) to compose the combined preview.'
            : 'Select citation pages in each document to see a combined preview.';
        el.combinedPreview.appendChild(msg);
        return;
    }

    const containerW = el.combinedPreview.clientWidth || 700;
    const frag = document.createDocumentFragment();

    for (const doc of docs) {
        if (token !== combinedToken) return;

        const header = document.createElement('div');
        header.className = 'combined-doc-header';
        header.textContent = doc.coverPage === null ? `${doc.baseName} — no cover` : doc.baseName;
        frag.appendChild(header);

        const cover = await getCoverHiRes(doc);
        if (token !== combinedToken) return;

        const citations = [...doc.selectedCitations].sort((a, b) => a - b);
        for (const ci of citations) {
            if (token !== combinedToken) return;
            const page = await doc.pdfDoc.getPage(ci + 1);
            if (token !== combinedToken) return;
            const card =
                doc.mode === 'sidebyside'
                    ? await buildSideBySideCard(doc, page, cover, ci, containerW)
                    : await buildTopCard(doc, page, cover, ci, containerW, false);
            if (token !== combinedToken) return;
            frag.appendChild(card);
            card.dataset.docId = doc.id; // combined-view cards navigate to their workspace
            card.setAttribute('role', 'button');
            card.tabIndex = 0;
            card.title = 'Open this page';
        }
    }

    el.combinedPreview.appendChild(frag);
}
