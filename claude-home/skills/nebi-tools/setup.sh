#!/usr/bin/env bash
# Build or refresh the nebi-tools Python env and the key file. Safe to re-run.
# Run: bash ~/.claude/skills/nebi-tools/setup.sh
# The venv and the keys live outside the skill folder on purpose: deploy copies
# skill folders from the public nebi-skill repo and refuses symlinks, so neither
# may sit inside it.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="$HOME/.agents/nebi/venv"
KEYS="$HOME/.agents/nebi/secrets/tools.env"

command -v uv >/dev/null || { echo "setup.sh: uv is required (brew install uv)" >&2; exit 1; }

[ -x "$VENV/bin/python" ] || uv venv --python 3.14 "$VENV"
uv pip install --python "$VENV/bin/python" -r "$HERE/requirements.txt"
# Browsers for Scrapling's stealth and dynamic modes; quick when already present.
"$VENV/bin/scrapling" install

mkdir -p "$(dirname "$KEYS")"
chmod 700 "$(dirname "$KEYS")"
if [ ! -f "$KEYS" ]; then
  (umask 077; printf '# nebi-tools keys: NAME=value, one per line. Names only in the nebi-tools catalog.\n' > "$KEYS")
fi
chmod 600 "$KEYS"

echo "python: $VENV/bin/python"
echo "keys:   $KEYS"
