// frame-upload.js — "Upload frame" modal: pick an image, choose Single/Book, auto-detect the
// window(s), preview them, then Save → register the frame + persist it (IndexedDB). Also lists
// uploaded frames with a Delete action. The rendering itself reuses the existing slice engine.

import { detectWindows } from './frame-detect.js';
import { registerUserFrame, removeUserFrame, userFrameList } from './frames.js';
import { saveFrameRecord, loadFrameRecords, deleteFrameRecord } from './frame-store.js';
import { toast } from './pdf-loader.js';
import { ICONS } from './icons.js';

let onChange = () => {};
let img = null;        // loaded HTMLImageElement of the chosen file
let file = null;       // the chosen File (stored as the frame blob)
let windows = null;    // detected window rects, or null
let previewURL = null; // object URL for the preview image (revoked on change/close)
let el = {};

export async function initFrameUpload(onChangeCb) {
    onChange = onChangeCb || (() => {});
    buildModal();
    injectButton();
    await bootLoad();
}

/** Load persisted frames into the runtime registry on startup. */
async function bootLoad() {
    try {
        const recs = await loadFrameRecords();
        for (const r of recs) {
            registerUserFrame({
                id: r.id, name: r.name, type: 'sliced',
                src: URL.createObjectURL(r.blob), modes: r.modes, windows: r.windows, user: true,
            });
        }
        if (recs.length) onChange();
    } catch (e) {
        console.warn('Could not load saved frames:', e);
    }
}

function injectButton() {
    const sel = document.getElementById('frameSelect');
    if (!sel || document.getElementById('uploadFrameBtn')) return;
    const btn = document.createElement('button');
    btn.id = 'uploadFrameBtn';
    btn.type = 'button';
    btn.className = 'icon-btn';
    btn.title = 'Add your own frame';
    btn.innerHTML = ICONS.plus;
    sel.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', open);
}

function buildModal() {
    if (document.getElementById('frameModal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'frameModal';
    overlay.className = 'modal-overlay hidden';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-label="Add a frame">
            <h3 class="modal-title">Add your own frame</h3>
            <ol class="uf-steps">
                <li>Get a frame image (PNG or SVG) with a <b>hole cut out</b> where the page should show.</li>
                <li>Drop or choose it below — we find the hole automatically.</li>
                <li>Check the green outline, name it, save.</li>
            </ol>
            <div class="modal-row">
                <label class="btn file-pick">Choose image…
                    <input type="file" id="ufFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                </label>
                <button type="button" id="ufTemplate" class="btn uf-template" title="Download a blank frame to edit">Download a template</button>
                <span id="ufFileName" class="muted">No file chosen</span>
            </div>
            <div class="uf-dropzone" id="ufDropzone">
                <span class="uf-dropzone-text">…or drop the image here</span>
                <canvas id="ufCanvas"></canvas>
                <span id="ufWindows" class="uf-windows muted hidden"></span>
            </div>
            <div class="modal-row uf-types">
                <label><input type="radio" name="ufType" value="single" checked> Single — one page area</label>
                <label><input type="radio" name="ufType" value="book"> Book — two pages side by side</label>
            </div>
            <div class="modal-row">
                <input type="text" id="ufName" class="uf-name" placeholder="Frame name">
            </div>
            <div id="ufError" class="uf-error hidden"></div>
            <p class="uf-hint muted">The page area must be <b>transparent</b> (or solid white) and fully enclosed by the frame art. Single frames work in both modes; book frames only in Side×Side.</p>
            <div class="uf-manage" id="ufManage"></div>
            <div class="modal-actions">
                <button type="button" id="ufCancel" class="btn">Cancel</button>
                <button type="button" id="ufSave" class="btn btn-primary" disabled>Save frame</button>
            </div>
        </div>`;
    document.body.appendChild(overlay);

    el = {
        overlay, file: overlay.querySelector('#ufFile'), fileName: overlay.querySelector('#ufFileName'),
        name: overlay.querySelector('#ufName'), canvas: overlay.querySelector('#ufCanvas'),
        error: overlay.querySelector('#ufError'), manage: overlay.querySelector('#ufManage'),
        save: overlay.querySelector('#ufSave'), cancel: overlay.querySelector('#ufCancel'),
        dropzone: overlay.querySelector('#ufDropzone'), windowsLabel: overlay.querySelector('#ufWindows'),
        template: overlay.querySelector('#ufTemplate'),
    };

    el.file.addEventListener('change', onFile);
    overlay.querySelectorAll('input[name="ufType"]').forEach((r) => r.addEventListener('change', detect));
    el.cancel.addEventListener('click', close);
    el.save.addEventListener('click', save);
    el.template.addEventListener('click', downloadTemplate);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    setupDropzone();
}

/** A minimal, correct blank frame (single window) the user can edit instead of starting cold. */
function downloadTemplate() {
    const svg = [
        '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1000" viewBox="0 0 800 1000">',
        '  <!-- Blank frame template: the transparent center hole is where the page will show. -->',
        '  <!-- Paint your frame art in the ring, keep the center transparent, re-upload. -->',
        '  <path fill="#35302b" fill-rule="evenodd"',
        '        d="M0 0 H800 V1000 H0 Z M120 120 H680 V880 H120 Z"/>',
        '</svg>',
    ].join('\n');
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'frame-template.svg';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('Template downloaded — paint the ring, keep the center transparent', 'info');
}

/** The preview area doubles as a drop zone, so "Choose image…" isn't the only path in. */
function setupDropzone() {
    const dz = el.dropzone;
    const hasFile = (e) => Array.from(e.dataTransfer?.types || []).includes('Files');
    let depth = 0;
    dz.addEventListener('dragenter', (e) => {
        if (!hasFile(e)) return;
        e.preventDefault();
        depth++;
        dz.classList.add('drag-over');
    });
    dz.addEventListener('dragover', (e) => { if (hasFile(e)) e.preventDefault(); });
    dz.addEventListener('dragleave', () => {
        depth = Math.max(0, depth - 1);
        if (depth === 0) dz.classList.remove('drag-over');
    });
    dz.addEventListener('drop', (e) => {
        if (!hasFile(e)) return;
        e.preventDefault();
        depth = 0;
        dz.classList.remove('drag-over');
        const f = [...e.dataTransfer.files].find((f) => /image\/(png|jpeg|webp)|svg/.test(f.type) || /\.(png|jpe?g|webp|svg)$/i.test(f.name));
        if (!f) { showError('Drop an image file (PNG, JPEG, WebP, or SVG).'); return; }
        const dt = new DataTransfer();
        dt.items.add(f);
        el.file.files = dt.files;
        onFile();
    });
}

function expectedCount() {
    return el.overlay.querySelector('input[name="ufType"]:checked').value === 'book' ? 2 : 1;
}

function open() {
    reset();
    refreshManageList();
    el.overlay.classList.remove('hidden');
}

function close() {
    el.overlay.classList.add('hidden');
    reset();
}

function reset() {
    if (previewURL) { URL.revokeObjectURL(previewURL); previewURL = null; }
    img = null; file = null; windows = null;
    el.file.value = '';
    el.fileName.textContent = 'No file chosen';
    el.name.value = '';
    el.error.classList.add('hidden');
    el.windowsLabel.classList.add('hidden');
    el.save.disabled = true;
    const ctx = el.canvas.getContext('2d');
    el.canvas.width = el.canvas.height = 0;
    ctx && ctx.clearRect(0, 0, 0, 0);
}

function onFile() {
    const f = el.file.files && el.file.files[0];
    if (!f) return;
    file = f;
    el.fileName.textContent = f.name;
    if (!el.name.value) el.name.value = f.name.replace(/\.[^.]+$/, '');
    if (previewURL) URL.revokeObjectURL(previewURL);
    previewURL = URL.createObjectURL(f);
    const im = new Image();
    im.onload = () => { img = im; detect(); };
    im.onerror = () => { showError('Could not read that image file.'); };
    im.src = previewURL;
}

function detect() {
    if (!img) return;
    try {
        windows = detectWindows(img, expectedCount());
        el.error.classList.add('hidden');
        el.save.disabled = false;
        el.windowsLabel.textContent = windows.length === 2
            ? '✓ Two page areas detected (left + right)'
            : '✓ One page area detected';
        el.windowsLabel.classList.remove('hidden');
    } catch (e) {
        windows = null;
        el.save.disabled = true;
        el.windowsLabel.classList.add('hidden');
        showError(e.message);
    }
    drawPreview();
}

function showError(msg) {
    el.error.textContent = msg;
    el.error.classList.remove('hidden');
}

function drawPreview() {
    const cv = el.canvas;
    if (!img) { cv.width = cv.height = 0; return; }
    const maxW = 340, maxH = 240;
    const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    // Checkerboard = the standard "this area is transparent" cue, so the page hole is obvious.
    const sq = 12;
    for (let y = 0; y < h; y += sq) {
        for (let x = 0; x < w; x += sq) {
            ctx.fillStyle = ((x / sq + y / sq) % 2 === 0) ? '#dcd5c8' : '#efe9de';
            ctx.fillRect(x, y, Math.min(sq, w - x), Math.min(sq, h - y));
        }
    }
    ctx.drawImage(img, 0, 0, w, h);
    if (windows) {
        ctx.strokeStyle = '#1f9d55';
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        for (const win of windows) ctx.strokeRect(win.x * w, win.y * h, win.w * w, win.h * h);
    }
}

async function save() {
    if (!file || !windows) return;
    const type = expectedCount() === 2 ? 'book' : 'single';
    const name = el.name.value.trim() || file.name.replace(/\.[^.]+$/, '') || 'My Frame';
    const id = `user-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const modes = type === 'book' ? ['sidebyside'] : ['top', 'sidebyside'];
    const blob = file;

    registerUserFrame({ id, name, type: 'sliced', src: URL.createObjectURL(blob), modes, windows, user: true });
    try {
        await saveFrameRecord({ id, name, modes, windows, blob });
    } catch (e) {
        console.warn('Frame saved for this session but not persisted:', e);
        toast('Frame added (could not save for next session)', 'info');
    }
    onChange();
    trySelect(id);
    close();
    toast(`Added frame "${name}"`, 'success');
}

/** Select the new frame in the dropdown if it's valid for the current mode. */
function trySelect(id) {
    const sel = document.getElementById('frameSelect');
    if (sel && [...sel.options].some((o) => o.value === id)) {
        sel.value = id;
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
}

function refreshManageList() {
    const list = userFrameList();
    el.manage.innerHTML = list.length ? '<div class="uf-manage-title">Your frames</div>' : '';
    for (const f of list) {
        const row = document.createElement('div');
        row.className = 'uf-manage-row';
        const label = document.createElement('span');
        label.textContent = `${f.name} (${f.windows.length === 2 ? 'book' : 'single'})`;
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'btn uf-del';
        del.textContent = 'Delete';
        del.addEventListener('click', async () => {
            removeUserFrame(f.id);
            try { await deleteFrameRecord(f.id); } catch (e) { console.warn(e); }
            onChange();
            refreshManageList();
        });
        row.appendChild(label);
        row.appendChild(del);
        el.manage.appendChild(row);
    }
}
