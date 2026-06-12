#!/usr/bin/env bash
# Valecraft Online — one-command launcher (made for macOS, works on Linux too).
# Installs dependencies on first run, starts the dev server, and opens the
# game in your browser. Offline play needs no database and no Docker.
set -euo pipefail
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but was not found."
  echo "On macOS, install it with:  brew install node"
  echo "Or download it from:        https://nodejs.org"
  exit 1
fi

NODE_MAJOR=$(node -v | sed 's/^v\([0-9]*\).*/\1/')
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Node.js 20+ is required (you have $(node -v))."
  echo "On macOS, upgrade with:  brew upgrade node"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "First run — installing dependencies (this only happens once)..."
  npm install
fi

URL="http://localhost:5173"
echo
echo "  Valecraft Online is starting at $URL"
echo "  Pick 'Play Offline' to jump straight into the world."
echo "  Press Ctrl+C to quit."
echo

# Open the browser once the dev server is up.
(
  sleep 2
  if command -v open >/dev/null 2>&1; then open "$URL"        # macOS
  elif command -v xdg-open >/dev/null 2>&1; then xdg-open "$URL"  # Linux
  fi
) &

npm run dev
