// help.js — the "?" Help modal: a complete, always-available explanation of what the app
// does and how to drive every feature. Built once, toggled from the header button.

let el = {};

export function initHelp() {
    const btn = document.getElementById('helpBtn');
    if (!btn) return;
    buildModal();
    btn.addEventListener('click', open);
}

function open() {
    el.overlay.classList.remove('hidden');
    el.close.focus();
}

function close() {
    el.overlay.classList.add('hidden');
}

function buildModal() {
    const overlay = document.createElement('div');
    overlay.id = 'helpModal';
    overlay.className = 'modal-overlay hidden';
    overlay.innerHTML = `
        <div class="modal help-modal" role="dialog" aria-label="Help — how PDF Composer works">
            <div class="help-head">
                <h3 class="modal-title">PDF COMPOSER — FIELD MANUAL</h3>
                <button type="button" id="helpClose" class="btn" aria-label="Close help">✕ Close</button>
            </div>

            <h4 class="help-h">What this app does</h4>
            <p>PDF Composer pulls citation pages out of your source PDFs and composes each one with a
            cover page — side by side or layered — optionally framed like a plate in a book, ready to
            export for theses, papers, and reading packets. Everything happens <b>in your browser</b>:
            your PDFs never leave your machine, and the app keeps working with no connection at all.</p>

            <h4 class="help-h">Quick start</h4>
            <ol class="help-ol">
                <li>Drop PDFs anywhere in the window (or press <b>Choose PDFs</b>).</li>
                <li>In a document's page list, press <b>☆</b> on the page that should be the cover.</li>
                <li>Press <b>○</b> on every page you want as a citation. <b>Shift-click</b> selects a whole
                    run of pages at once.</li>
                <li>Pick a mode and (optionally) a frame in the Live Preview panel.</li>
                <li>Press <b>Export</b> — the header controls choose how it's packaged.</li>
            </ol>

            <h4 class="help-h">The two views</h4>
            <p><b>A document</b> (left rail) is its workspace: the page strip on the left, the live preview
            of every selected citation on the right. <b>All / Combined</b> shows the assembled export —
            every citation of every document, in export order. Click any combined card to jump straight
            back to that page.</p>

            <h4 class="help-h">Modes &amp; frames</h4>
            <p><b>Side×Side</b> places the citation and the cover flush at equal size. <b>Top</b> overlays
            the cover on the citation — drag it, or use the corner handle to resize; every page updates
            together. Frames wrap the composition: pick one from the menu, or press <b>＋</b> to add your
            own — any image with a transparent (or white) hole where the page shows. Each document
            remembers its own mode and frame.</p>

            <h4 class="help-h">Export packaging</h4>
            <p><b>Combined</b> — one file with every selected page. <b>Per document</b> — one file per PDF.
            <b>Per page</b> — one file per citation. Formats: PDF (multi-page where packaging allows),
            PNG, or JPEG. Large documents are composed one page at a time, so big exports won't exhaust
            browser memory.</p>

            <h4 class="help-h">Good to know</h4>
            <ul class="help-ul">
                <li>Hover a document in the rail for <b>✕</b> — remove it without touching the others.</li>
                <li>Any PDF size works: pages load lazily, thumbnails only render what you can see.</li>
                <li>Exports are pixel-faithful: what you position on screen is what lands in the file.</li>
                <li>Nothing is uploaded, tracked, or stored server-side. Refreshing clears loaded PDFs;
                    your uploaded frames persist in this browser.</li>
            </ul>
        </div>`;
    document.body.appendChild(overlay);
    el = {
        overlay,
        close: overlay.querySelector('#helpClose'),
    };
    el.close.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !el.overlay.classList.contains('hidden')) close();
    });
}
