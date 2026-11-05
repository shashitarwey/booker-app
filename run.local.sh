#!/bin/bash
# Start both server and client for local development
# Usage: ./run.local.sh

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== Starting server (port 5050) and client (port 3000) ==="
echo ""

# Run both in background, kill both on exit
trap 'kill 0' EXIT

(cd "$ROOT_DIR/server" && npm run dev) &
(cd "$ROOT_DIR/client" && npm run dev) &

wait
