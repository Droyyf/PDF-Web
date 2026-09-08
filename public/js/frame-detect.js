// frame-detect.js — find a frame's content window(s) by scanning its image: the transparent or
// near-white interior regions (holes NOT connected to the image border) are the windows. Returns
// each window as {x,y,w,h} fractions of the image. Productionized from the inline prototype used to
// wire the built-in Celtic (1 window) and Leather Book (2 windows) frames.

const MAX_SCAN = 400; // downsample the longest side to this for a fast, AA-tolerant scan

/** Draw an image/canvas to a small canvas and return its ImageData. */
function scanData(source) {
    const SW = source.naturalWidth || source.width;
    const SH = source.naturalHeight || source.height;
    const scale = Math.min(1, MAX_SCAN / Math.max(SW, SH));
    const w = Math.max(1, Math.round(SW * scale));
    const h = Math.max(1, Math.round(SH * scale));
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(source, 0, 0, w, h);
    return ctx.getImageData(0, 0, w, h);
}

/**
 * Detect the content window(s) of a frame image.
 * @param {HTMLImageElement|HTMLCanvasElement} source  a loaded image (or canvas)
 * @param {number} expected  1 (single frame) or 2 (book frame)
 * @returns {Array<{x,y,w,h}>}  window rects as fractions, sorted left→right
 * @throws {Error}  a user-friendly message when the detected count/shape doesn't match `expected`
 */
export function detectWindows(source, expected) {
    const { data, width: w, height: h } = scanData(source);
    const hole = (x, y) => {
        const i = (y * w + x) * 4;
        return data[i + 3] < 16 || (data[i] > 244 && data[i + 1] > 244 && data[i + 2] > 244);
    };

    // Flood-fill the EXTERIOR holes (transparent/white margin reachable from the border).
    const ext = new Uint8Array(w * h);
    const stack = [];
    const push = (x, y) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        const p = y * w + x;
        if (!ext[p] && hole(x, y)) { ext[p] = 1; stack.push(x, y); }
    };
    for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
    for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
    while (stack.length) {
        const y = stack.pop(), x = stack.pop();
        push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1);
    }

    // Remaining holes are interior → connected components → bounding boxes.
    const seen = new Uint8Array(w * h);
    const boxes = [];
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const p = y * w + x;
            if (!hole(x, y) || ext[p] || seen[p]) continue;
            let mnx = x, mny = y, mxx = x, mxy = y, n = 0;
            const q = [x, y];
            seen[p] = 1;
            while (q.length) {
                const cy = q.pop(), cx = q.pop();
                n++;
                if (cx < mnx) mnx = cx; if (cx > mxx) mxx = cx;
                if (cy < mny) mny = cy; if (cy > mxy) mxy = cy;
                for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                    const nx = cx + dx, ny = cy + dy, np = ny * w + nx;
                    if (nx >= 0 && nx < w && ny >= 0 && ny < h && !seen[np] && hole(nx, ny) && !ext[np]) {
                        seen[np] = 1;
                        q.push(nx, ny);
                    }
                }
            }
            if (n > w * h * 0.005) {
                boxes.push({ x: mnx / w, y: mny / h, w: (mxx - mnx + 1) / w, h: (mxy - mny + 1) / h });
            }
        }
    }

    boxes.sort((a, b) => a.x - b.x);
    const windows = boxes.map((b) => ({
        x: +b.x.toFixed(4), y: +b.y.toFixed(4), w: +b.w.toFixed(4), h: +b.h.toFixed(4),
    }));

    if (windows.length !== expected) {
        throw new Error(
            `Expected ${expected} window${expected > 1 ? 's' : ''} but found ${windows.length}. ` +
            `Make sure the page area${expected > 1 ? 's are' : ' is'} transparent (or solid white) and ` +
            `fully enclosed by the frame.`
        );
    }
    if (expected === 2) {
        const [a, b] = windows;
        if (Math.abs(a.y - b.y) > 0.05 || Math.abs(a.h - b.h) > 0.08) {
            throw new Error('A book frame needs its two windows side by side at the same height (left + right page).');
        }
    }
    return windows;
}
