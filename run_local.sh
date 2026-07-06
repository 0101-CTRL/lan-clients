#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
if [ ! -d .venv ]; then
  python3 -m venv .venv
fi
source .venv/bin/activate
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt
HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-8093}"
echo "Starting APIv3 LAN Clients Console on http://${HOST}:${PORT}"
exec uvicorn app:app --host "$HOST" --port "$PORT"
