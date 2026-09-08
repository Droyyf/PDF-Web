// PDF Composer — static file server.
//
// Composition is done entirely client-side (PDF.js + pdf-lib in the browser), so this
// server only needs to serve the static assets with a CSP that permits the CDN libraries
// and the thumbnail Web Worker. ES modules and workers require an http(s) origin, which
// is why a static server is still needed (file:// would not work).

const express = require('express');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// pdf.js + pdf-lib are vendored under /vendor and served from the same origin, so the CSP no
// longer needs to allow cdnjs / unpkg. Google Fonts is still external (CSS + font binaries).
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            scriptSrc: ["'self'", "'unsafe-inline'"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            workerSrc: ["'self'", "blob:"],
        },
    },
}));

app.use(express.static('public'));

app.get('/api/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(PORT, () => {
    console.log(`PDF Composer running at http://localhost:${PORT}`);
});
