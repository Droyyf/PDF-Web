// PDF Composer — static file server.
//
// Composition is done entirely client-side (PDF.js + pdf-lib in the browser), so this
// server only needs to serve the static assets with a CSP that permits the vendored
// libraries and the thumbnail Web Worker. ES modules and workers require an http(s)
// origin, which is why a static server is still needed (file:// would not work).

const path = require('path');

const compression = require('compression');
const express = require('express');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Security headers. The app has no inline scripts or styles (no <script> bodies, no
// style= attributes, no setAttribute('style')), so the CSP needs no 'unsafe-inline'.
// pdf.js's optional Function()-based fast path is already off (no 'unsafe-eval'); it falls
// back to its regular path without error. COEP stays off because it would block the
// no-cors Google Fonts stylesheet; HSTS is pointless on a plain-http local server.
const MV3_SIM = process.env.MV3_SIM === '1'; // simulate Manifest V3 extension_pages CSP
app.use(helmet({
    contentSecurityPolicy: {
        directives: MV3_SIM ? {
            // Approximates Chrome's MV3 extension_pages CSP (script-src 'self', object-src
            // 'self', eval hard-banned) plus full resource bundling: NOTHING remote. Used
            // for the extension feasibility probe — the app must run with zero violations.
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'"],
            fontSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            workerSrc: ["'self'", "blob:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        } : {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'"],
            fontSrc: ["'self'", "data:"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            workerSrc: ["'self'", "blob:"],
        },
    },
    crossOriginEmbedderPolicy: false,
    hsts: false,
}));
app.disable('x-powered-by');

// Compress text assets — the vendored pdf.js + pdf-lib are ~1.9 MB raw, ~0.5 MB gzipped.
app.use(compression());

// Files are served without content hashes, so the shell (html/js/css) must revalidate on
// every request (ETag → 304) for updates to land on the next reload. /vendor and /frames
// change only on a deliberate library/asset bump (paired with a CACHE_NAME bump in sw.js),
// so they can cache hard.
const REVALIDATE = { dotfiles: 'ignore', etag: true, lastModified: true, maxAge: 0 };
const IMMUTABLE = { dotfiles: 'ignore', etag: true, lastModified: true, maxAge: '1y', immutable: true };

app.use('/vendor', express.static(path.join(PUBLIC_DIR, 'vendor'), IMMUTABLE));
app.use('/frames', express.static(path.join(PUBLIC_DIR, 'frames'), IMMUTABLE));
app.use(express.static(PUBLIC_DIR, REVALIDATE));

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

const server = app.listen(PORT, () => {
    console.log(`PDF Composer running at http://localhost:${PORT}`);
});

// A clear message instead of a raw EADDRINUSE stack (scripts/start.sh clears the port).
server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`Port ${PORT} is already in use. Stop the other process, set PORT, or run: npm run start:clean`);
        process.exit(1);
    }
    throw err;
});

// Graceful shutdown: stop accepting connections and let in-flight responses finish.
for (const signal of ['SIGINT', 'SIGTERM']) {
    process.on(signal, () => server.close(() => process.exit(0)));
}
