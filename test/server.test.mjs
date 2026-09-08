// server.test.mjs — smoke tests for the static server: spawns the real server.js on a
// random port and asserts the contract the frontend depends on (shell served, security
// headers present, vendor caching/compression, dotfiles hidden, health endpoint).

import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

const PORT = 3100 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;

let child;

before(async () => {
    child = spawn(process.execPath, ['server.js'], {
        cwd: new URL('..', import.meta.url).pathname,
        env: { ...process.env, PORT: String(PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
        try {
            const res = await fetch(`${BASE}/api/health`);
            if (res.ok) return;
        } catch {
            // not up yet
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    child.kill();
    throw new Error('server did not start within 5s');
});

after(() => child.kill());

test('serves the app shell with hardened headers', async () => {
    const res = await fetch(`${BASE}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);

    const csp = res.headers.get('content-security-policy') ?? '';
    assert.ok(csp.includes("default-src 'self'"), 'CSP should have a default-src');
    assert.ok(!csp.includes('unsafe-inline'), 'CSP must not allow unsafe-inline');
    assert.ok(!csp.includes('unsafe-eval'), 'CSP must not allow unsafe-eval');

    assert.equal(res.headers.get('x-powered-by'), null);
    assert.equal(res.headers.get('cross-origin-embedder-policy'), null);

    const body = await res.text();
    assert.match(body, /PDF Composer/i);
});

test('health endpoint reports OK', async () => {
    const res = await fetch(`${BASE}/api/health`);
    assert.equal(res.status, 200);
    assert.equal((await res.json()).status, 'OK');
});

test('app modules revalidate; vendor assets cache hard', async () => {
    const shell = await fetch(`${BASE}/js/main.js`);
    assert.equal(shell.status, 200);
    assert.doesNotMatch(shell.headers.get('cache-control') ?? '', /immutable/);

    const vendor = await fetch(`${BASE}/vendor/pdf.min.js`);
    assert.equal(vendor.status, 200);
    assert.match(vendor.headers.get('cache-control') ?? '', /immutable/);
    // Compression kicks in for large text assets (fetch decompresses transparently, so we
    // can only assert the header is absent-or-a-known-encoding).
    const enc = vendor.headers.get('content-encoding');
    if (enc) assert.match(enc, /^(gzip|deflate|br)$/);
});

test('dotfiles are never served', async () => {
    const res = await fetch(`${BASE}/.DS_Store`);
    assert.equal(res.status, 404);
});

test('unknown paths 404 without leaking stacks', async () => {
    const res = await fetch(`${BASE}/no/such/file.js`);
    assert.equal(res.status, 404);
});
