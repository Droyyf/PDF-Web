// frame-store.js — persist user-uploaded frames in IndexedDB (image Blob + manifest).
// Frame images are multi-MB, so localStorage (~5MB) isn't enough; IndexedDB stores Blobs natively.

const DB_NAME = 'pdfw-frames';
const STORE = 'frames';
let _db = null;

function db() {
    if (_db) return Promise.resolve(_db);
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, 1);
        req.onupgradeneeded = () => {
            const d = req.result;
            if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' });
        };
        req.onsuccess = () => { _db = req.result; resolve(_db); };
        req.onerror = () => reject(req.error);
    });
}

/** Persist a frame record: { id, name, modes, windows, blob }. */
export async function saveFrameRecord(rec) {
    const d = await db();
    return new Promise((resolve, reject) => {
        const t = d.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(rec);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}

/** Return all stored frame records. */
export async function loadFrameRecords() {
    const d = await db();
    return new Promise((resolve, reject) => {
        const out = [];
        const t = d.transaction(STORE, 'readonly');
        const cursor = t.objectStore(STORE).openCursor();
        cursor.onsuccess = () => {
            const cur = cursor.result;
            if (cur) { out.push(cur.value); cur.continue(); } else resolve(out);
        };
        t.onerror = () => reject(t.error);
    });
}

export async function deleteFrameRecord(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
        const t = d.transaction(STORE, 'readwrite');
        t.objectStore(STORE).delete(id);
        t.oncomplete = () => resolve();
        t.onerror = () => reject(t.error);
    });
}
