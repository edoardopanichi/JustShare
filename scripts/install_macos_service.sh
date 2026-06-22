#!/usr/bin/env bash
set -euo pipefail

ROOT="/usr/local/justshare"
mkdir -p "$ROOT"
cp -R justshare requirements.txt run_justshare.sh "$ROOT/"
python3 -m venv "$ROOT/.venv"
"$ROOT/.venv/bin/python" -m pip install -r "$ROOT/requirements.txt"
cp deploy/com.justshare.server.plist "$HOME/Library/LaunchAgents/com.justshare.server.plist"
launchctl unload "$HOME/Library/LaunchAgents/com.justshare.server.plist" >/dev/null 2>&1 || true
launchctl load "$HOME/Library/LaunchAgents/com.justshare.server.plist"
echo "JustShare launchd agent installed."
