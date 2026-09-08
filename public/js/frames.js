// frames.js — frame registry and the shared rendering routines that keep preview and export
// pixel-identical. Two paradigms:
//   • 'border' frames: a single-window decorative border applied via 9-slice. The window adapts
//     to ANY content aspect ratio (corners fixed, edges stretched). Preview uses CSS border-image;
//     export uses draw9Slice() — same slice insets + repeat:stretch, so the math is identical.
//   • 'book' frames: a two-window template (citation | cover) drawn PROCEDURALLY — the frame
//     resizes to the full-size pages (no crop, no gaps), rather than fitting pages into fixed
//     windows. One canvas routine (composeBook) serves both preview and export → parity.
//
// To add your own frame: drop a PNG/SVG into public/frames/ (transparent or discardable center)
// and add a registry entry below. For 'border' frames, sliceFrac is the fraction of the source
// image taken as the border ring on each side; borderFrac is how thick to draw it (fraction of the
// composition's smaller dimension). The 'book' frame is drawn procedurally (see composeBook), so
// it needs no slice/window config.

import { detectWindows } from './frame-detect.js';

const FRAME_DIR = 'frames/';
const ART_SCAN = 256; // downsample size for the transparent-margin scan

export const FRAMES = [
    { id: 'none', name: 'None', type: 'none', modes: ['top', 'sidebyside'] },
    {
        id: 'classic', name: 'Classic', type: 'border', src: FRAME_DIR + 'top-classic.svg',
        modes: ['top'], sliceFrac: 0.22, borderFrac: 0.085,
    },
    {
        id: 'ornate', name: 'Ornate', type: 'border', src: FRAME_DIR + 'sbs-ornate.svg',
        modes: ['sidebyside'], sliceFrac: 0.18, borderFrac: 0.055,
    },
    {
        // Drawn procedurally by composeBook() — the frame resizes to the pages (no crop, no gaps).
        // Proportions/constants are ported from the SVG; src is kept for reference only.
        id: 'book', name: 'Book', type: 'book', src: FRAME_DIR + 'sbs-book.svg',
        modes: ['sidebyside'],
    },
    {
        // Celtic knotwork border (single window). 'sliced' engine wraps the whole side-by-side
        // composition; windows auto-detected from the PNG (transparent interior).
        id: 'celtic', name: 'Celtic', type: 'sliced', src: FRAME_DIR + 'celtic.png',
        modes: ['top', 'sidebyside'],
        windows: [{ x: 0.2806, y: 0.1556, w: 0.4417, h: 0.6889 }],
    },
    {
        // Ornate leather book (two windows). 'sliced' engine: pages at full size in the two windows,
        // leather/scroll bands stretch around them. Windows auto-detected (transparent interiors).
        id: 'leather', name: 'Leather Book', type: 'sliced', src: FRAME_DIR + 'leather-book.png',
        modes: ['sidebyside'],
        windows: [
            { x: 0.1306, y: 0.1625, w: 0.2389, h: 0.6625 },
            { x: 0.6278, y: 0.1625, w: 0.2417, h: 0.6625 },
        ],
    },
];

// User-uploaded frames (runtime; persisted in frame-store.js, loaded on boot). Merged with built-ins.
const userFrames = [];

/** All frames (built-in + user-uploaded). */
export function allFrames() {
    return FRAMES.concat(userFrames);
}

export function getFrame(id) {
    return allFrames().find((f) => f.id === id) || FRAMES[0];
}

/** Frames selectable for a given mode (always includes 'None'). */
export function framesForMode(mode) {
    return allFrames().filter((f) => f.modes.includes(mode));
}

export function frameCompatible(id, mode) {
    const f = getFrame(id);
    return !!f && f.modes.includes(mode);
}

/** Register a user-uploaded frame manifest: {id,name,type:'sliced',src,modes,windows,user:true}. */
export function registerUserFrame(manifest) {
    const i = userFrames.findIndex((f) => f.id === manifest.id);
    if (i >= 0) userFrames[i] = manifest;
    else userFrames.push(manifest);
    return manifest;
}

/** Remove a user-uploaded frame and free its cached image / blob URL. */
export function removeUserFrame(id) {
    const i = userFrames.findIndex((f) => f.id === id);
    if (i < 0) return;
    const [f] = userFrames.splice(i, 1);
    imgCache.delete(id);
    if (f.src && f.src.startsWith('blob:')) URL.revokeObjectURL(f.src);
}

export function userFrameList() {
    return userFrames.slice();
}

// ---------------------------------------------------------------------------
// Image cache (canvas paths need a loaded HTMLImageElement; CSS loads its own copy)
// ---------------------------------------------------------------------------

const imgCache = new Map(); // id -> Promise<HTMLImageElement|HTMLCanvasElement>

function loadImage(src) {
    return new Promise((resolve, reject) => {
        const im = new Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('frame image failed: ' + src));
        im.src = src;
    });
}

/**
 * Trim transparent padding from a sliced-frame asset and re-derive its windows from the
 * trimmed art. Real frame PNGs ship with dead margins (Celtic had 17.5% of its width on each
 * side), which used to render as white space beyond the frame in every composition. Runs once
 * per frame; the trimmed canvas replaces the image everywhere (preview CSS border-image via a
 * blob URL, and all canvas/export paths), so any page aspect now fits the art exactly.
 */
async function normalizeFrame(frame, img) {
    if (frame.type !== 'sliced' || frame._normalized) return img;
    frame._normalized = true;

    const W = img.naturalWidth || img.width, H = img.naturalHeight || img.height;
    const s = Math.min(1, ART_SCAN / Math.max(W, H));
    const w = Math.max(1, Math.round(W * s)), h = Math.max(1, Math.round(H * s));
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;

    let mnx = w, mny = h, mxx = -1, mxy = -1;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (d[(y * w + x) * 4 + 3] > 16) {
                if (x < mnx) mnx = x; if (x > mxx) mxx = x;
                if (y < mny) mny = y; if (y > mxy) mxy = y;
            }
        }
    }
    if (mxx < 0) return img; // fully transparent — nothing sensible to trim
    const padL = mnx / w, padT = mny / h, padR = (w - 1 - mxx) / w, padB = (h - 1 - mxy) / h;
    if (Math.max(padL, padT, padR, padB) < 0.005) return img; // art already fills the image

    const sx = Math.floor(mnx * W / w), sy = Math.floor(mny * H / h);
    const sw = Math.ceil((mxx - mnx + 1) * W / w), sh = Math.ceil((mxy - mny + 1) * H / h);
    const cropped = document.createElement('canvas');
    cropped.width = sw; cropped.height = sh;
    cropped.getContext('2d').drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

    // Re-derive the window rects on the trimmed art (exact); fall back to remapping the
    // registry rects if the scan is inconclusive for this asset.
    try {
        frame.windows = detectWindows(cropped, frame.windows.length);
    } catch (err) {
        console.warn(`Frame "${frame.id}": window re-detection failed, remapping manually:`, err);
        frame.windows = frame.windows.map((win) => ({
            x: (win.x * W - sx) / sw,
            y: (win.y * H - sy) / sh,
            w: (win.w * W) / sw,
            h: (win.h * H) / sh,
        }));
    }

    // Swap the asset so CSS border-image consumers (applySlicedBorderCSS) draw trimmed art too.
    const blob = await new Promise((res) => cropped.toBlob(res, 'image/png'));
    if (blob) frame.src = URL.createObjectURL(blob);
    return cropped;
}

async function loadFrameAsset(frame) {
    return normalizeFrame(frame, await loadImage(frame.src));
}

/** Warm the cache so export/book rendering never waits on a cold load. */
export function preloadFrames() {
    for (const f of FRAMES) {
        if (f.src && !imgCache.has(f.id)) imgCache.set(f.id, loadFrameAsset(f));
    }
}

export function frameImage(frame) {
    if (!frame.src) return Promise.resolve(null);
    if (!imgCache.has(frame.id)) imgCache.set(frame.id, loadFrameAsset(frame));
    return imgCache.get(frame.id);
}

// ---------------------------------------------------------------------------
// Border frames (single window, 9-slice)
// ---------------------------------------------------------------------------

/** Border thickness in px for a composition of the given size (uniform → square corners). */
export function borderWidthFor(frame, w, h) {
    return Math.max(12, Math.round(frame.borderFrac * Math.min(w, h)));
}

/** Preview: apply a 9-slice border-image to a wrapper element with a precomputed border width.
 *  repeat:stretch makes the CSS mapping identical to draw9Slice (the export path). */
export function applyBorderFrameCSS(wrapEl, frame, bw) {
    wrapEl.style.borderStyle = 'solid';
    wrapEl.style.borderWidth = bw + 'px';
    wrapEl.style.borderImageSource = `url(${frame.src})`;
    wrapEl.style.borderImageSlice = `${frame.sliceFrac * 100}%`;
    wrapEl.style.borderImageRepeat = 'stretch';
}

/** Canvas 9-slice (export) — mirrors border-image with repeat:stretch exactly. */
export function draw9Slice(ctx, img, sliceFrac, dx, dy, dw, dh, bw) {
    const S = img.naturalWidth || img.width;
    const T = img.naturalHeight || img.height;
    const sl = S * sliceFrac, sr = S * sliceFrac, st = T * sliceFrac, sb = T * sliceFrac;
    const d = (sx, sy, sw, sh, ox, oy, ow, oh) => {
        if (sw > 0 && sh > 0 && ow > 0 && oh > 0) ctx.drawImage(img, sx, sy, sw, sh, ox, oy, ow, oh);
    };
    // Corners (fixed bw × bw).
    d(0, 0, sl, st, dx, dy, bw, bw);
    d(S - sr, 0, sr, st, dx + dw - bw, dy, bw, bw);
    d(0, T - sb, sl, sb, dx, dy + dh - bw, bw, bw);
    d(S - sr, T - sb, sr, sb, dx + dw - bw, dy + dh - bw, bw, bw);
    // Edges (stretched along their length).
    d(sl, 0, S - sl - sr, st, dx + bw, dy, dw - 2 * bw, bw);            // top
    d(sl, T - sb, S - sl - sr, sb, dx + bw, dy + dh - bw, dw - 2 * bw, bw); // bottom
    d(0, st, sl, T - st - sb, dx, dy + bw, bw, dh - 2 * bw);            // left
    d(S - sr, st, sr, T - st - sb, dx + dw - bw, dy + bw, bw, dh - 2 * bw); // right
    // Center window is intentionally skipped (content shows through).
}

/** Export: wrap a composed canvas in a border frame → a new, larger canvas. */
export async function frameCanvasBorder(srcCanvas, frame) {
    const img = await frameImage(frame);
    if (!img) return srcCanvas;
    const bw = borderWidthFor(frame, srcCanvas.width, srcCanvas.height);
    const out = document.createElement('canvas');
    out.width = srcCanvas.width + 2 * bw;
    out.height = srcCanvas.height + 2 * bw;
    const ctx = out.getContext('2d');
    ctx.drawImage(srcCanvas, bw, bw);
    draw9Slice(ctx, img, frame.sliceFrac, 0, 0, out.width, out.height, bw);
    return out;
}

// ---------------------------------------------------------------------------
// Book frame (two windows, drawn procedurally to fit the pages) — used by BOTH preview and export
// ---------------------------------------------------------------------------

/**
 * Book frame — drawn PROCEDURALLY so the FRAME resizes to the content (not the other way round).
 * Each page is placed at full size (fully visible — no crop, no distortion) and the leather body +
 * gold rules + spine are drawn around them, so the windows always match the pages exactly (no gaps).
 * Both pages come from the same document → same size → symmetric layout. Constants are ported from
 * sbs-book.svg, so at native aspect it's indistinguishable from the source, just resizable.
 * One routine → preview & export parity.
 *
 * @param windowCanvases [citation, cover] (cover may be null → blank page)
 * @param targetW total output width in px
 */
export async function composeBook(frame, windowCanvases, targetW) {
    const ref = windowCanvases.find(Boolean);
    const A = ref ? ref.width / ref.height : 0.707; // page aspect (w/h)

    // Proportions ported from sbs-book.svg (window 640×880, border 60, spine 100), as fractions of
    // page height. total width = 2·Wimg + 2·B + S = Himg·(2A + 2·bFrac + sFrac) → solve for the width.
    const bFrac = 60 / 880;   // border thickness
    const sFrac = 100 / 880;  // spine width
    const Himg = Math.max(1, targetW / (2 * A + 2 * bFrac + sFrac));
    const Wimg = A * Himg;
    const B = bFrac * Himg;
    const S = sFrac * Himg;
    const k = Himg / 880;     // scale for ported stroke weights / ornaments
    const W = Math.round(2 * Wimg + 2 * B + S);
    const H = Math.round(Himg + 2 * B); // == 1000·k → source y-coords map as source·k

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');

    // Leather body everywhere; pages drawn on top reveal content in the two windows.
    ctx.fillStyle = '#5a3520';
    ctx.fillRect(0, 0, W, H);

    const leftX = B, rightX = B + Wimg + S, imgY = B;
    const drawPage = (c, x) => {
        if (c) ctx.drawImage(c, x, imgY, Wimg, Himg);
        else { ctx.fillStyle = '#fff'; ctx.fillRect(x, imgY, Wimg, Himg); }
    };
    drawPage(windowCanvases[0], leftX);
    drawPage(windowCanvases[1], rightX);

    const GOLD = '#c9a24a', GOLD_LT = '#e6c878', SHADE = '#3f2516';
    const setStroke = (color, wgt) => { ctx.strokeStyle = color; ctx.lineWidth = wgt; };

    // Inner leather shade + outer gold rules (ported insets 7/26/42, weights 14/7/2). All on leather.
    setStroke(SHADE, 14 * k); ctx.strokeRect(7 * k, 7 * k, W - 14 * k, H - 14 * k);
    setStroke(GOLD, 7 * k);   ctx.strokeRect(26 * k, 26 * k, W - 52 * k, H - 52 * k);
    setStroke(GOLD_LT, 2 * k); ctx.strokeRect(42 * k, 42 * k, W - 84 * k, H - 84 * k);

    // Gold rule bracketing each page (8px outside the page on every side, weight 6) — on leather,
    // so the page stays full-bleed with no sliver of leather between it and the rule.
    const off = 8 * k;
    setStroke(GOLD, 6 * k);
    ctx.strokeRect(leftX - off, imgY - off, Wimg + 2 * off, Himg + 2 * off);
    ctx.strokeRect(rightX - off, imgY - off, Wimg + 2 * off, Himg + 2 * off);

    // Spine: double gold rules (14px inside the spine edges), full height (source y 40..960).
    const spineL = B + Wimg, cx = spineL + S / 2, spineR = spineL + S;
    setStroke(GOLD, 5 * k);
    ctx.beginPath();
    ctx.moveTo(spineL + 14 * k, 40 * k); ctx.lineTo(spineL + 14 * k, H - 40 * k);
    ctx.moveTo(spineR - 14 * k, 40 * k); ctx.lineTo(spineR - 14 * k, H - 40 * k);
    ctx.stroke();

    // Spine ornaments + corner studs (light gold).
    ctx.fillStyle = GOLD_LT;
    const diamond = (x, y, hw, hh) => {
        ctx.beginPath();
        ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y); ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y);
        ctx.closePath(); ctx.fill();
    };
    const dot = (x, y, r) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); };
    diamond(cx, 200 * k, 20 * k, 50 * k);
    dot(cx, 330 * k, 14 * k);
    diamond(cx, 500 * k, 22 * k, 70 * k);
    dot(cx, 670 * k, 14 * k);
    diamond(cx, 810 * k, 20 * k, 50 * k);
    // Corner studs sit on the leather ring (off the page, so content stays fully visible).
    const ci = 34 * k, ch = 14 * k;
    diamond(ci, ci, ch, ch); diamond(W - ci, ci, ch, ch);
    diamond(ci, H - ci, ch, ch); diamond(W - ci, H - ci, ch, ch);

    return out;
}

// ---------------------------------------------------------------------------
// Sliced frames (config-driven, N windows in a horizontal strip) — preview & export
// A generic, asset-driven engine: any frame image + its window rects auto-scales so content fills
// the windows at full size (no crop) and the frame's border/divider bands stretch around them (no
// gaps). Generalizes 9-slice to N windows. NOTE: edge/band art STRETCHES — flat fills and straight
// rules survive perfectly; intricate edge motifs distort (that's the asset-scaling trade-off).
// ---------------------------------------------------------------------------

/**
 * Derive the slice grid from a frame's window rects (assumed a horizontal strip: windows share y/h,
 * ordered left→right). Returns column/row bands as {role:'fixed'|'window', s, e} fractions of the
 * frame image; window columns carry their window index.
 */
function sliceBands(windows) {
    const ws = [...windows].sort((a, b) => a.x - b.x);
    const y = ws[0].y, h = ws[0].h;
    const cols = [];
    let cursor = 0;
    ws.forEach((w, i) => {
        cols.push({ role: 'fixed', s: cursor, e: w.x });            // left border or divider
        cols.push({ role: 'window', s: w.x, e: w.x + w.w, win: i });
        cursor = w.x + w.w;
    });
    cols.push({ role: 'fixed', s: cursor, e: 1 });                  // right border
    const rows = [
        { role: 'fixed', s: 0, e: y },
        { role: 'window', s: y, e: y + h },
        { role: 'fixed', s: y + h, e: 1 },
    ];
    return { cols, rows, rowH: h };
}

/**
 * Compose a 'sliced' frame at targetW px wide. Content is placed at FULL size in its window (no
 * crop); the frame's fixed bands (borders, dividers, corners) keep their proportions while the
 * window bands resize to the content (no gaps). One routine for preview & export → parity.
 *
 * @param windowCanvases content per window (null → blank), in left→right window order
 */
export async function composeSliced(frame, windowCanvases, targetW) {
    const img = await frameImage(frame);
    if (!img) return windowCanvases.find(Boolean) || document.createElement('canvas');
    const W0 = img.naturalWidth || img.width;
    const H0 = img.naturalHeight || img.height;
    const { cols, rows, rowH } = sliceBands(frame.windows);

    const aspectOf = (i) => {
        const c = windowCanvases[i];
        if (c) return c.width / c.height;
        const any = windowCanvases.find(Boolean);
        return any ? any.width / any.height : 0.707;
    };

    const nWin = cols.filter((c) => c.role === 'window').length;
    const fixedFracX = cols.filter((c) => c.role === 'fixed').reduce((n, c) => n + (c.e - c.s), 0);
    let sumAspect = 0;
    for (let i = 0; i < nWin; i++) sumAspect += aspectOf(i);
    const nativeRowHpx = rowH * H0;

    // Solve content row height Hc + fixed-band scale s from the requested total width.
    const Hc = Math.max(1, targetW / (fixedFracX * W0 / nativeRowHpx + sumAspect));
    const s = Hc / nativeRowHpx;

    // Output column geometry (window cols → content width; fixed cols → native × s).
    const colOut = [];
    let x = 0;
    for (const c of cols) {
        const w = c.role === 'window' ? aspectOf(c.win) * Hc : (c.e - c.s) * W0 * s;
        colOut.push({ ...c, x, w });
        x += w;
    }
    const W = Math.round(x);
    // Output row geometry (window row → Hc; fixed rows → native × s).
    const rowOut = [];
    let y = 0;
    for (const r of rows) {
        const hh = r.role === 'window' ? Hc : (r.e - r.s) * H0 * s;
        rowOut.push({ ...r, y, h: hh });
        y += hh;
    }
    const H = Math.round(y);

    const out = document.createElement('canvas');
    out.width = W;
    out.height = H;
    const ctx = out.getContext('2d');
    // Opaque white underlay: frame art edges are often anti-aliased (semi-transparent), and
    // an exported composition is a document — it must never carry a translucent rim.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, W, H);

    for (const c of colOut) {
        for (const r of rowOut) {
            if (c.w <= 0 || r.h <= 0) continue;
            if (c.role === 'window' && r.role === 'window') {
                // Content cell — page at full size (cell aspect == content aspect → no distortion).
                const content = windowCanvases[c.win];
                if (content) ctx.drawImage(content, c.x, r.y, c.w, r.h);
                else { ctx.fillStyle = '#fff'; ctx.fillRect(c.x, r.y, c.w, r.h); }
            } else {
                // Frame band — slice this region from the source (stretched/scaled to the cell).
                ctx.drawImage(img, c.s * W0, r.s * H0, (c.e - c.s) * W0, (r.e - r.s) * H0,
                    c.x, r.y, c.w, r.h);
            }
        }
    }
    return out;
}

/**
 * Apply a SINGLE-window 'sliced' frame as an asymmetric CSS border-image around a wrapper element
 * (used by interactive top mode, so the content underneath stays draggable). Corners fixed, edges
 * stretched — identical mapping to composeSliced (the export path), so preview and export match.
 * Returns the per-side border widths in px (so callers can handle overflow scaling).
 */
export async function applySlicedBorderCSS(wrapEl, frame, contentMinDim) {
    const img = await frameImage(frame);
    const W0 = (img && (img.naturalWidth || img.width)) || 1;
    const H0 = (img && (img.naturalHeight || img.height)) || 1;
    const win = frame.windows[0];
    // Per-side slice fractions (the frame margins around the single window).
    const sl = { t: win.y, r: 1 - (win.x + win.w), b: 1 - (win.y + win.h), l: win.x };
    // Source slice thickness in px; displayed widths scale uniformly (k) → no corner distortion.
    const sp = { t: sl.t * H0, r: sl.r * W0, b: sl.b * H0, l: sl.l * W0 };
    const k = (0.16 * contentMinDim) / Math.max(sp.t, sp.r, sp.b, sp.l);
    const bw = { t: sp.t * k, r: sp.r * k, b: sp.b * k, l: sp.l * k };
    wrapEl.style.borderStyle = 'solid';
    wrapEl.style.borderWidth = `${bw.t}px ${bw.r}px ${bw.b}px ${bw.l}px`;
    wrapEl.style.borderImageSource = `url(${frame.src})`;
    wrapEl.style.borderImageSlice = `${sl.t * 100}% ${sl.r * 100}% ${sl.b * 100}% ${sl.l * 100}%`;
    wrapEl.style.borderImageWidth = `${bw.t}px ${bw.r}px ${bw.b}px ${bw.l}px`;
    wrapEl.style.borderImageRepeat = 'stretch';
    return bw;
}
