// state.js — single shared source of truth for the app.
// Holds an array of documents; modules operate on the *active* document via getActiveDoc().
// Imports nothing of ours, so every module can import it without circular-dependency issues.

export const DEFAULT_COVER_TRANSFORM = { xFrac: 0.05, yFrac: 0.05, scaleFrac: 0.10 };

export const state = {
    documents: [],          // Doc[]
    activeTab: 'all',       // 'all' | doc.id   (which tab/document is in view)
    packaging: 'combined',  // 'combined' | 'perdoc' | 'perpage'  (global export packaging; used from Phase 4)
};

let _docSeq = 0;

const ILLEGAL_FILENAME_CHARS = /[\\/:*?"<>|]/g; // filesystem-illegal; keep spaces, hyphens, unicode

/** Strip the last extension and sanitize a file name for use as a base / export filename. */
export function baseName(fileName) {
    const noExt = String(fileName || 'document').replace(/\.[^.]+$/, '');
    const cleaned = noExt.replace(ILLEGAL_FILENAME_CHARS, '_').replace(/\s+/g, ' ').trim();
    return cleaned || 'document';
}

/**
 * A per-document config object. `pdfDoc`/`pageCount` are filled in after the file loads.
 * Everything that used to live flat on `state` now lives here, so each document is independent.
 */
export function createDoc(file) {
    return {
        id: `doc${++_docSeq}`,
        file,
        fileName: file.name,
        baseName: baseName(file.name),
        pdfDoc: null,                 // pdf.js PDFDocumentProxy
        pageCount: 0,
        thumbnails: [],               // page index -> data URL | undefined
        selectedCitations: new Set(), // page indices (0-based)
        coverPage: null,              // page index (0-based) | null
        mode: 'sidebyside',           // 'sidebyside' | 'top'
        frame: 'none',                // frame id (see frames.js); mode-scoped, reset if incompatible
        coverTransform: { ...DEFAULT_COVER_TRANSFORM },
        // _coverHiRes: cached hi-res cover render, attached lazily by composition.js
    };
}

/** The document currently in view, or null on the 'all' tab / when nothing is loaded. */
export function getActiveDoc() {
    if (state.activeTab === 'all') return null;
    return state.documents.find((d) => d.id === state.activeTab) || null;
}

export function getDoc(id) {
    return state.documents.find((d) => d.id === id) || null;
}

/** Documents that have at least one citation selected (used by export). */
export function docsWithCitations() {
    return state.documents.filter((d) => d.selectedCitations.size > 0);
}

/** Append Docs for the given Files; returns the created Docs. */
export function addDocuments(files) {
    const docs = [...files].map(createDoc);
    state.documents.push(...docs);
    return docs;
}

/** Clear everything (no documents loaded). */
export function resetAll() {
    state.documents = [];
    state.activeTab = 'all';
    state.packaging = 'combined';
}

// --- tiny pub/sub so modules react to state changes without importing each other ---
const listeners = new Set();

/** Subscribe to state changes. Returns an unsubscribe function. */
export function subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Notify all subscribers. `reason` is a free-form string describing what changed. */
export function notify(reason) {
    for (const fn of listeners) {
        try {
            fn(reason);
        } catch (err) {
            console.error('state listener error:', err);
        }
    }
}
