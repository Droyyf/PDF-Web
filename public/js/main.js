// main.js — bootstrap: init all modules and wire the per-doc mode switch + frame picker.

import { initLoader } from './pdf-loader.js';
import { initPreview } from './preview.js';
import { initExport } from './export.js';
import { initDocumentsView } from './documents-view.js';
import { initFrameUpload } from './frame-upload.js';
import { initHelp } from './help.js';
import { getActiveDoc, subscribe, notify } from './state.js';
import { framesForMode, frameCompatible, preloadFrames, getFrame } from './frames.js';
import { toast } from './pdf-loader.js';

function syncModeSwitch() {
    const doc = getActiveDoc();
    const modeSwitch = document.getElementById('modeSwitch');
    if (!modeSwitch) return;
    modeSwitch.querySelectorAll('.mode-btn').forEach((b) =>
        b.classList.toggle('active', b.dataset.mode === (doc?.mode ?? 'sidebyside'))
    );
}

function initModeSwitch() {
    const modeSwitch = document.getElementById('modeSwitch');
    if (!modeSwitch) return;
    modeSwitch.addEventListener('click', (e) => {
        const btn = e.target.closest('.mode-btn');
        const doc = getActiveDoc();
        if (!btn || !doc || btn.dataset.mode === doc.mode) return;
        doc.mode = btn.dataset.mode;
        // A frame only valid for the old mode (e.g. Book in side-by-side) must drop before render.
        if (!frameCompatible(doc.frame, doc.mode)) {
            toast(`"${getFrame(doc.frame).name}" frame isn't available in ${doc.mode === 'top' ? 'Top' : 'Side×Side'} mode — reset to None`, 'info');
            doc.frame = 'none';
        }
        modeSwitch
            .querySelectorAll('.mode-btn')
            .forEach((b) => b.classList.toggle('active', b.dataset.mode === doc.mode));
        notify('mode');
    });

    // Re-sync button state when switching tabs (each doc has its own mode)
    subscribe((reason) => {
        if (reason === 'tab' || reason === 'loaded' || reason === 'docs-added') syncModeSwitch();
    });
}

/** Fill the frame <select> with the frames valid for the active doc's mode and reflect its choice. */
function populateFrameSelect() {
    const sel = document.getElementById('frameSelect');
    const doc = getActiveDoc();
    if (!sel) return;
    if (!doc) { sel.innerHTML = ''; return; }
    const opts = framesForMode(doc.mode);
    sel.innerHTML = opts.map((f) => `<option value="${f.id}">${f.name}</option>`).join('');
    if (!opts.some((f) => f.id === doc.frame)) doc.frame = 'none';
    sel.value = doc.frame;
}

function initFrameSelect() {
    const sel = document.getElementById('frameSelect');
    if (!sel) return;
    sel.addEventListener('change', () => {
        const doc = getActiveDoc();
        if (!doc) return;
        doc.frame = sel.value;
        notify('frame');
    });
    subscribe((reason) => {
        if (['tab', 'loaded', 'docs-added', 'mode'].includes(reason)) populateFrameSelect();
    });
}

function init() {
    if (!window.pdfjsLib) {
        console.error('pdf.js failed to load — check the network and that /vendor/pdf.min.js is present.');
        return;
    }
    preloadFrames(); // warm frame images so export/book rendering never waits on a cold load
    initDocumentsView(); // must be first: sets up view-state subscriber
    initLoader();
    initPreview();
    initExport();
    initModeSwitch();
    initFrameSelect();
    initFrameUpload(populateFrameSelect); // upload-your-own-frames + boot-load persisted frames
    initHelp(); // "?" field manual — available from the header at all times
    registerServiceWorker();
    console.log('PDF Composer initialized.');
}

// Register the service worker for offline / fast-repeat-visit caching. Failures are silent —
// the app must work without a SW (first visit, unsupported browsers, dev contexts).
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    // Wait for the page to be idle so registration doesn't compete with the initial parse.
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js', { scope: '/' }).catch((err) => {
            console.warn('Service worker registration failed:', err);
        });
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
    init();
}
