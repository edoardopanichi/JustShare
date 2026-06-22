#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

case "$(uname -s)" in
  Darwin*) OS_NAME="macOS" ;;
  Linux*) OS_NAME="Linux" ;;
  MINGW*|MSYS*|CYGWIN*) OS_NAME="Windows Bash" ;;
  *) OS_NAME="Unknown" ;;
esac

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  if command -v python >/dev/null 2>&1; then
    PYTHON_BIN="python"
  else
    echo "Python 3 is required but was not found."
    exit 1
  fi
fi

if [ ! -d ".venv" ]; then
  "$PYTHON_BIN" -m venv .venv
fi

if [ -x ".venv/Scripts/python.exe" ]; then
  VENV_PYTHON=".venv/Scripts/python.exe"
else
  VENV_PYTHON=".venv/bin/python"
fi

"$VENV_PYTHON" -m pip install -r requirements.txt

mkdir -p "${JUSTSHARE_STORAGE_DIR:-./data}" ./logs

HOST="${JUSTSHARE_HOST:-0.0.0.0}"
PORT="${JUSTSHARE_PORT:-8787}"
LAN_IP="$("$VENV_PYTHON" -c "import socket; ips=[i[4][0] for i in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET) if not i[4][0].startswith('127.')]; print(ips[0] if ips else '')" 2>/dev/null || true)"

echo
echo "JustShare is running on $OS_NAME."
echo
echo "Local access:"
echo "http://localhost:${PORT}"
echo
if [ -n "$LAN_IP" ]; then
  echo "LAN access:"
  echo "http://${LAN_IP}:${PORT}"
  echo
else
  echo "LAN access:"
  echo "Could not detect automatically. Use this machine's LAN IP with port ${PORT}."
  echo
fi
echo "Storage:"
echo "${JUSTSHARE_STORAGE_DIR:-./data}"
echo
echo "Use only on trusted local networks. Press CTRL+C to stop."
echo

JUSTSHARE_HOST="$HOST" JUSTSHARE_PORT="$PORT" "$VENV_PYTHON" -m justshare
