#!/usr/bin/env bash
#
# start.sh — (re)start the PDF Composer cleanly.
#
# This app runs as a SINGLE process: server.js (the backend) also serves the static
# frontend in public/, so the frontend and backend come up together. This script first
# clears any previous server instance (so ports never collide during development), then
# starts a fresh one in the foreground (Ctrl+C to stop).
#
# Usage:
#   bash scripts/start.sh            # start on port 3000 (or $PORT)
#   PORT=4000 bash scripts/start.sh  # start on a custom port
#   npm run start:clean              # same, via npm

set -uo pipefail

PORT="${PORT:-3000}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "▸ Clearing previous server(s)…"

# 1. Kill whatever is listening on the target port (covers any prior instance,
#    no matter how it was started).
if command -v lsof >/dev/null 2>&1; then
    PIDS="$(lsof -ti tcp:"$PORT" 2>/dev/null || true)"
    if [ -n "${PIDS}" ]; then
        echo "  • freeing port ${PORT} (pid: ${PIDS//$'\n'/ })"
        kill -9 ${PIDS} 2>/dev/null || true
    fi
fi

# 2. Kill any stray instances of this project's server / watcher by name.
pkill -f "node .*server\.js"    2>/dev/null && echo "  • stopped a stray 'node server.js'" || true
pkill -f "nodemon .*server\.js" 2>/dev/null && echo "  • stopped a stray 'nodemon server.js'" || true

sleep 0.5  # give the OS a moment to release the port

echo "▸ Starting PDF Composer → http://localhost:${PORT}"
exec node server.js
