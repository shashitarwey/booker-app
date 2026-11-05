#!/bin/bash
# Start server for local development
# Usage: ./run.local.sh

set -e

cd "$(dirname "$0")"

echo "=== Starting server (port 5050) ==="
npm run dev
