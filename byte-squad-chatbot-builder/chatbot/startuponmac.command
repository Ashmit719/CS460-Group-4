#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PORT=8080
URL="http://localhost:${PORT}/NEWUI.html"

cd "$SCRIPT_DIR"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx was not found."
  echo "Install Node.js first, then run this launcher again."
  exit 1
fi

echo "Starting Chatbot Builder on ${URL}"
echo "Press Ctrl+C in this window to stop the local server."

npx -y http-server -p "$PORT" >/tmp/chatbot-http-server.log 2>&1 &
SERVER_PID=$!

cleanup() {
  if kill -0 "$SERVER_PID" >/dev/null 2>&1; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

trap cleanup EXIT INT TERM

for _ in {1..20}; do
  if curl -fsS "$URL" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

open "$URL"

wait "$SERVER_PID"
