#!/usr/bin/env bash
# AI-Academy — start on Linux and macOS: launch the bridge and open a browser.
set -e
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js ≥ 20 fehlt — bitte installieren (nodejs.org)"; exit 1; }
node bridge/bridge.mjs &
BRIDGE_PID=$!
trap 'kill $BRIDGE_PID 2>/dev/null' EXIT
sleep 2
URL=$(curl -s http://127.0.0.1:8791/api/health >/dev/null 2>&1 && echo "http://127.0.0.1:8791/" || true)
# Port and token appear in the bridge log; with --port 0 use the printed URL.
if command -v xdg-open >/dev/null; then xdg-open "${URL:-http://127.0.0.1:8791/}";
elif command -v open >/dev/null; then open "${URL:-http://127.0.0.1:8791/}"; fi
echo "Bridge läuft (PID $BRIDGE_PID) — Fenster offen lassen; Beenden mit Strg+C."
wait $BRIDGE_PID
