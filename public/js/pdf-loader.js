// pdf-loader.js — client-side PDF loading (any size), the scrollable page list with
// on-demand thumbnail rendering, and selection toggles. Operates on the ACTIVE document
// (`getActiveDoc()`). Tab switches are handled via subscription: bumps the render task ID
// and rebuilds the page list for the new active doc.

import { state, notify, subscribe, getActiveDoc, addDocuments, resetAll } from './state.js';

const pdfjsLib = window.pdfjsLib;
// pdf.js needs to know where to find its Web Worker. Vendored alongside the main script.
const PDFJS_WORKER = 'vendor/pdf.worker.min.js';

let currentTaskId = 0;   // bumped on tab switch; stale thumbnail renders check against it
let thumbObserver = null; // IntersectionObserver for lazy thumbnail rendering
const visiblePages = new Set();

const THUMB_CONCURRENCY = 3;
let activeRenders = 0;
const renderQueue = [];
const rendering = new Set();

// Thumbnails are sized for their DISPLAY box in the 200px pages panel (.page-thumb img is
// capped at max-width:100% / max-height:220px), rendered once at devicePixelRatio sharpness —
// never larger. Full quality is the page preview's job, not the thumbnail's.
const THUMB_CSS_W = 180;
const THUMB_CSS_H = 220;
const THUMB_DPR = Math.min(window.devicePixelRatio || 1, 2);

// PDFs are parsed at most two at a time: each parse transiently needs several× file size in
// memory, so parsing ten 200MB files in parallel would spike past what most tabs survive.
const LOAD_CONCURRENCY = 2;

let el = {};

export function initLoader() {
    if (!pdfjsLib) {
        console.error('pdf.js global (pdfjsLib) not found — CDN script failed to load.');
        return;
    }
    pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;

    el = {
        fileInput: document.getElementById('fileInput'),
        chooseBtn: document.getElementById('chooseFileBtn'),
        emptyCard: document.getElementById('dropZone'),
        dropOverlay: document.getElementById('dropOverlay'),
        pageList: document.getElementById('pageList'),
        pageCount: document.getElementById('pageCount'),
        citationCount: document.getElementById('citationCount'),
        coverLabel: document.getElementById('coverLabel'),
    };

    el.chooseBtn?.addEventListener('click', () => el.fileInput.click());
    el.fileInput?.addEventListener('change', (e) => {
        const files = validPDFs(e.target.files);
        e.target.value = '';
        if (files.length > 0) handleFiles(files);
    });

    setupWindowDragDrop(el.dropOverlay, el.emptyCard);

    thumbObserver = new IntersectionObserver(onCardsIntersect, {
        root: el.pageList,
        rootMargin: '400px 0px',
    });

    // On tab switch or initial load: cancel stale renders, rebuild page list for the active doc
    subscribe((reason) => {
        if (!['tab', 'loaded'].includes(reason)) return;
        if (reason === 'tab') {
            currentTaskId++; // cancel in-flight thumbnail renders for the previous tab
            thumbObserver.disconnect();
        }
        resetThumbnailQueue();
        const doc = getActiveDoc();
        if (doc?.pdfDoc) {
            buildPageList();
        } else {
            if (el.pageList) el.pageList.replaceChildren();
            if (el.pageCount) el.pageCount.textContent = '0';
        }
        updateSelectionSummary();
    });
}

function validPDFs(fileList) {
    return [...(fileList || [])].filter(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    );
}

// ---------------------------------------------------------------------------
// Window-level drag-drop. Single source of truth for drops; the empty-state
// upload card just gets a `drag-over` highlight class when nothing is loaded.
// ---------------------------------------------------------------------------

function setupWindowDragDrop(overlay, emptyCard) {
    let dragCounter = 0; // dragenter/leave bubble unpredictably; counter avoids flicker
    const hasFile = (e) =>
        Array.from(e.dataTransfer?.types || []).includes('Files');

    const hideAffordance = () => {
        overlay?.classList.add('hidden');
        emptyCard?.classList.remove('drag-over');
    };

    window.addEventListener('dragenter', (e) => {
        if (!hasFile(e)) return;
        e.preventDefault();
        dragCounter++;
        if (dragCounter !== 1) return;
        if (state.documents.length > 0) overlay?.classList.remove('hidden');
        else emptyCard?.classList.add('drag-over');
    });

    window.addEventListener('dragover', (e) => {
        if (hasFile(e)) e.preventDefault(); // allow drop
    });

    window.addEventListener('dragleave', (e) => {
        if (!hasFile(e)) return;
        dragCounter = Math.max(0, dragCounter - 1);
        if (dragCounter === 0) hideAffordance();
    });

    window.addEventListener('drop', (e) => {
        if (!hasFile(e)) return;
        e.preventDefault();
        dragCounter = 0;
        hideAffordance();
        const files = validPDFs(e.dataTransfer?.files);
        if (files.length > 0) handleFiles(files);
    });
}

async function handleFiles(fileList) {
    const files = [...fileList];
    if (files.length === 0) return;

    const isInitial = state.documents.length === 0;
    if (isInitial) resetAll();

    // Append docs immediately so the rail can render rows in loading state.
    // pdfDoc is null until each PDF resolves — the rail keys "loading" off that.
    const docs = addDocuments(files);
    if (!isInitial) {
        toast(`Loading ${files.length} PDF${files.length > 1 ? 's' : ''}…`, 'info');
    }
    // First-batch path also needs to land on a tab now (rail wants an active row).
    if (isInitial) state.activeTab = 'all';
    notify('docs-added');

    const failed = [];
    // Load at most LOAD_CONCURRENCY at once — see LOAD_CONCURRENCY on memory spikes.
    let cursor = 0;
    async function nextLoad() {
        while (cursor < docs.length) {
            const doc = docs[cursor++];
            try {
                await loadDoc(doc);
            } catch (err) {
                console.error('Failed to load PDF:', doc.fileName, err);
                toast(`Failed to load "${doc.fileName}": ${err.message}`, 'error');
                destroyDoc(doc);
                failed.push(doc.id);
            }
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(LOAD_CONCURRENCY, docs.length) }, nextLoad)
    );

    // Remove docs that failed to parse
    if (failed.length > 0) {
        const failedSet = new Set(failed);
        state.documents = state.documents.filter((d) => !failedSet.has(d.id));
    }

    if (isInitial) {
        if (state.documents.length === 0) {
            notify('cleared');
        } else {
            // Preserve the existing ergonomic: single doc opens that doc; multi → All.
            // (Spec divergence #1 in plan: spec wanted always-All; default is current behavior.)
            state.activeTab =
                state.documents.length === 1 ? state.documents[0].id : 'all';
            notify('loaded');
        }
    } else {
        const added = docs.length - failed.length;
        if (added > 0) toast(`Added ${added} PDF${added > 1 ? 's' : ''}`, 'success');
        notify('docs-added');
    }
}

/**
 * Parse one PDF in the pdf.js worker. The buffer goes in as `data`, which pdf.js TRANSFERS
 * to its worker (detaching it here) — the main thread never keeps a second copy, and the
 * worker frees it on destroy(). (blob: URLs were tried and don't work: pdf.js's fetch
 * stream is http(s)-only, and its XHR fallback cannot fetch blob URLs in Chromium.)
 */
async function loadDoc(doc) {
    doc.pdfDoc = await pdfjsLib.getDocument({ data: await doc.file.arrayBuffer() }).promise;
    doc.pageCount = doc.pdfDoc.numPages;
    doc.thumbnails = new Array(doc.pageCount);
    doc.coverPage = 0; // auto-select first page as cover
}

/** Free every resource a doc holds: pdf.js worker buffers, the source blob URL, thumb URLs. */
export function destroyDoc(doc) {
    try { doc.pdfDoc?.destroy(); } catch { /* already destroyed */ }
    doc.pdfDoc = null;
    if (doc.srcUrl) { URL.revokeObjectURL(doc.srcUrl); doc.srcUrl = null; }
    for (const url of doc.thumbnails || []) {
        if (url) URL.revokeObjectURL(url);
    }
    doc.thumbnails = [];
}

// ---------------------------------------------------------------------------
// On-demand thumbnails (active document)
// ---------------------------------------------------------------------------

function resetThumbnailQueue() {
    visiblePages.clear();
    renderQueue.length = 0;
    rendering.clear();
    activeRenders = 0;
}

function thumbScale(page) {
    // Fit the thumbnail's actual display box (THUMB_CSS_W × THUMB_CSS_H at device sharpness);
    // independent of the page's native size, so huge pages cost no more than small ones.
    const native = page.getViewport({ scale: 1 });
    return Math.min(
        (THUMB_CSS_W * THUMB_DPR) / native.width,
        (THUMB_CSS_H * THUMB_DPR) / native.height
    );
}

function requestThumb(page) {
    const doc = getActiveDoc();
    if (!doc) return;
    if (doc.thumbnails[page]) { fillThumb(page); return; }
    if (rendering.has(page) || renderQueue.includes(page)) return;
    renderQueue.push(page);
    pumpQueue();
}

function pumpQueue() {
    const doc = getActiveDoc();
    if (!doc) return;
    while (activeRenders < THUMB_CONCURRENCY && renderQueue.length) {
        const page = renderQueue.shift();
        if (doc.thumbnails[page] || rendering.has(page)) continue;
        if (!visiblePages.has(page)) continue;
        renderThumb(page);
    }
}

async function renderThumb(page) {
    const doc = getActiveDoc();
    if (!doc) return;
    rendering.add(page);
    activeRenders++;
    const taskId = currentTaskId;
    let url = null;
    try {
        const p = await doc.pdfDoc.getPage(page + 1);
        const viewport = p.getViewport({ scale: thumbScale(p) });
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        await p.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
        p.cleanup(); // release this page's intermediate render resources back to the worker
        url = await new Promise((resolve, reject) =>
            canvas.toBlob((b) => (b ? resolve(URL.createObjectURL(b)) : reject(new Error('toBlob failed'))), 'image/png')
        );
        if (taskId !== currentTaskId) return; // tab was switched away
        doc.thumbnails[page] = url;
        fillThumb(page);
    } catch (err) {
        console.warn(`Thumbnail render failed for page ${page + 1}:`, err);
    } finally {
        // Drop the URL if it was created but not stored (stale tab), and drop the canvas ref.
        if (url && doc.thumbnails[page] !== url) URL.revokeObjectURL(url);
        rendering.delete(page);
        activeRenders--;
        pumpQueue();
    }
}

// ---------------------------------------------------------------------------
// Page list (active document)
// ---------------------------------------------------------------------------

export function buildPageList() {
    const doc = getActiveDoc();
    if (!doc) return;
    el.pageList.replaceChildren();
    if (el.pageCount) el.pageCount.textContent = doc.pageCount;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < doc.pageCount; i++) {
        const card = document.createElement('div');
        card.className = 'page-card';
        card.dataset.page = String(i);

        const thumbDiv = document.createElement('div');
        thumbDiv.className = 'page-thumb';
        const img = document.createElement('img');
        img.alt = `Page ${i + 1}`;
        thumbDiv.appendChild(img);

        const meta = document.createElement('div');
        meta.className = 'page-meta';

        const num = document.createElement('span');
        num.className = 'page-num';
        num.textContent = String(i + 1);

        const toggles = document.createElement('div');
        toggles.className = 'page-toggles';

        const citBtn = document.createElement('button');
        citBtn.className = 'toggle citation-toggle';
        citBtn.title = 'Toggle citation';
        citBtn.textContent = '○';
        citBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleCitation(i); });

        const covBtn = document.createElement('button');
        covBtn.className = 'toggle cover-toggle';
        covBtn.title = 'Set as cover';
        covBtn.textContent = '☆';
        covBtn.addEventListener('click', (e) => { e.stopPropagation(); setCover(i); });

        toggles.appendChild(citBtn);
        toggles.appendChild(covBtn);
        meta.appendChild(num);
        meta.appendChild(toggles);
        card.appendChild(thumbDiv);
        card.appendChild(meta);

        frag.appendChild(card);
        thumbObserver.observe(card);
    }
    el.pageList.appendChild(frag);

    refreshAllCards();
    updateSelectionSummary();
}

function onCardsIntersect(entries) {
    for (const entry of entries) {
        const page = Number(entry.target.dataset.page);
        if (entry.isIntersecting) { visiblePages.add(page); requestThumb(page); }
        else visiblePages.delete(page);
    }
}

function fillThumb(page) {
    const img = cardFor(page)?.querySelector('img');
    const url = getActiveDoc()?.thumbnails[page];
    if (img && url && img.src !== url) img.src = url;
}

function cardFor(page) {
    return el.pageList.querySelector(`.page-card[data-page="${page}"]`);
}

function refreshCard(page) {
    const doc = getActiveDoc();
    const card = cardFor(page);
    if (!doc || !card) return;
    const isCitation = doc.selectedCitations.has(page);
    const isCover = doc.coverPage === page;
    card.classList.toggle('is-citation', isCitation);
    card.classList.toggle('is-cover', isCover);
    card.querySelector('.citation-toggle').textContent = isCitation ? '✓' : '○';
    card.querySelector('.cover-toggle').textContent = isCover ? '★' : '☆';
}

function refreshAllCards() {
    const doc = getActiveDoc();
    if (!doc) return;
    for (let i = 0; i < doc.pageCount; i++) refreshCard(i);
}

// ---------------------------------------------------------------------------
// Selection toggles
// ---------------------------------------------------------------------------

function toggleCitation(page) {
    const doc = getActiveDoc();
    if (!doc) return;
    if (doc.selectedCitations.has(page)) doc.selectedCitations.delete(page);
    else doc.selectedCitations.add(page);
    refreshCard(page);
    updateSelectionSummary();
    notify('selection');
}

function setCover(page) {
    const doc = getActiveDoc();
    if (!doc) return;
    const old = doc.coverPage;
    doc.coverPage = doc.coverPage === page ? null : page;
    if (old !== null) refreshCard(old);
    refreshCard(page);
    updateSelectionSummary();
    notify('cover');
}

function updateSelectionSummary() {
    const doc = getActiveDoc();
    const citations = doc ? doc.selectedCitations.size : 0;
    const cover = doc && doc.coverPage !== null ? `p${doc.coverPage + 1}` : '—';
    if (el.citationCount) el.citationCount.textContent = citations;
    if (el.coverLabel) el.coverLabel.textContent = cover;
}

// ---------------------------------------------------------------------------
// Toast helper (imported by export.js)
// ---------------------------------------------------------------------------

export function toast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const t = document.createElement('div');
    t.className = `toast toast-${type}`;
    t.textContent = message;
    container.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 3200);
}
