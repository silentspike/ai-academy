#!/bin/bash
# AI-Act-Akademie — Start unter Linux.
cd "$(dirname "$0")" || exit 1

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js fehlt. Die Akademie braucht Version 20 oder neuer."
  echo "  Debian/Ubuntu: sudo apt install nodejs"
  echo "  Fedora:        sudo dnf install nodejs"
  echo "  openSUSE:      sudo zypper install nodejs22"
  exit 1
fi

VERSION=$(node -p "process.versions.node.split('.')[0]")
if [ "$VERSION" -lt 20 ]; then
  echo "Node.js $VERSION ist zu alt — gebraucht wird mindestens Version 20."
  exit 1
fi

exec node bridge/bridge.mjs --open "$@"
