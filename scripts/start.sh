#!/usr/bin/env bash
# AI-Act-Akademie — Start (Linux/macOS): Bridge starten + Browser öffnen (Plan §5.5)
set -e
cd "$(dirname "$0")/.."
command -v node >/dev/null || { echo "Node.js ≥ 20 fehlt — bitte installieren (nodejs.org)"; exit 1; }
node bridge/bridge.mjs &
BRIDGE_PID=$!
trap 'kill $BRIDGE_PID 2>/dev/null' EXIT
sleep 2
URL=$(curl -s http://127.0.0.1:8791/api/health >/dev/null 2>&1 && echo "http://127.0.0.1:8791/" || true)
# Port/Token stehen im Bridge-Log — bei --port 0 die gedruckte URL verwenden
if command -v xdg-open >/dev/null; then xdg-open "${URL:-http://127.0.0.1:8791/}";
elif command -v open >/dev/null; then open "${URL:-http://127.0.0.1:8791/}"; fi
echo "Bridge läuft (PID $BRIDGE_PID) — Fenster offen lassen; Beenden mit Strg+C."
wait $BRIDGE_PID
