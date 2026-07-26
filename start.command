#!/bin/bash
# AI-Act-Akademie — Start unter macOS (Doppelklick im Finder).
#
# The Finder runs a .command from the user's home directory, not from the folder
# the file sits in, so the first thing to do is move to the script's own place.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo
  echo "  Node.js fehlt."
  echo
  echo "  Die Akademie braucht Node.js ab Version 20. Zwei Wege:"
  echo "    • https://nodejs.org — Installationspaket für macOS"
  echo "    • brew install node  — falls Homebrew vorhanden ist"
  echo
  echo "  Danach dieses Fenster schliessen und start.command erneut doppelklicken."
  echo
  read -r -p "  Mit der Eingabetaste schliessen. " _
  exit 1
fi

VERSION=$(node -p "process.versions.node.split('.')[0]")
if [ "$VERSION" -lt 20 ]; then
  echo
  echo "  Node.js $VERSION ist zu alt — gebraucht wird mindestens Version 20."
  echo "  Aktualisieren über https://nodejs.org oder 'brew upgrade node'."
  echo
  read -r -p "  Mit der Eingabetaste schliessen. " _
  exit 1
fi

echo "AI-Act-Akademie startet — das Fenster bitte offen lassen."
echo "Zum Beenden: Strg+C oder Fenster schliessen."
echo
exec node bridge/bridge.mjs --open "$@"
