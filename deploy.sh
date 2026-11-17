#!/usr/bin/env bash
# Thin wrapper — deploy the nebi setup into ~/.claude on Mac/Linux.
# Requires Node 18+. Runs the real work in deploy.mjs.
cd "$(dirname "$0")" || exit 1
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required but not on PATH. Install Node 18+ and re-run." >&2
  exit 1
fi
exec node deploy.mjs "$@"
