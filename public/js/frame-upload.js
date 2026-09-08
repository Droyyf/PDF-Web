// frame-upload.js — "Upload frame" modal: pick an image, choose Single/Book, auto-detect the
// window(s), preview them, then Save → register the frame + persist it (IndexedDB). Also lists
// uploaded frames with a Delete action. The rendering itself reuses the existing slice engine.

import { detectWindows } from './frame-detect.js';
import { registerUserFrame, removeUserFrame, userFrameList } from './frames.js';
import { saveFrameRecord, loadFrameRecords, deleteFrameRecord } from './frame-store.js';
import { toast } from './pdf-loader.js';

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
    btn.title = 'Upload your own frame';
    btn.textContent = '＋';
    sel.insertAdjacentElement('afterend', btn);
    btn.addEventListener('click', open);
}

function buildModal() {
    if (document.getElementById('frameModal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'frameModal';
    overlay.className = 'modal-overlay hidden';
    overlay.innerHTML = `
        <div class="modal" role="dialog" aria-label="Upload a frame">
            <h3 class="modal-title">Upload a frame</h3>
            <div class="modal-row">
                <label class="btn file-pick">Choose image…
                    <input type="file" id="ufFile" accept="image/png,image/jpeg,image/webp,image/svg+xml" hidden>
                </label>
                <span id="ufFileName" class="muted">No file chosen</span>
            </div>
            <div class="modal-row uf-types">
                <label><input type="radio" name="ufType" value="single" checked> Single frame (1 window)</label>
                <label><input type="radio" name="ufType" value="book"> Book frame (2 windows)</label>
            </div>
            <div class="modal-row">
                <input type="text" id="ufName" class="uf-name" placeholder="Frame name">
            </div>
            <div class="uf-preview"><canvas id="ufCanvas"></canvas></div>
            <div id="ufError" class="uf-error hidden"></div>
            <p class="uf-hint muted">The page area must be transparent or solid white. Works best with simple/flat borders.</p>
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
    };

    el.file.addEventListener('change', onFile);
    overlay.querySelectorAll('input[name="ufType"]').forEach((r) => r.addEventListener('change', detect));
    el.cancel.addEventListener('click', close);
    el.save.addEventListener('click', save);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
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
    } catch (e) {
        windows = null;
        el.save.disabled = true;
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
    const maxW = 340, maxH = 260;
    const s = Math.min(maxW / img.naturalWidth, maxH / img.naturalHeight, 1);
    const w = Math.max(1, Math.round(img.naturalWidth * s));
    const h = Math.max(1, Math.round(img.naturalHeight * s));
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#eef1f4';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    if (windows) {
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
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
