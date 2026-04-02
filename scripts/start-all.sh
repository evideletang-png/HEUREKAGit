#!/bin/bash
# Set base directory
BASE_DIR="/Users/evideletang/Desktop/HEUREKA/Web-SaaS-Builder"

# Load environment variables
export $(grep -v '^#' "$BASE_DIR/.env" | xargs)
export PORT=8080

echo "Stopping existing node processes..."
killall -9 node 2>/dev/null || true

echo "Starting Backend (Port 8080)..."
cd "$BASE_DIR/artifacts/api-server"
nohup ./node_modules/.bin/tsx ./src/index.ts < /dev/null > "$BASE_DIR/backend.log" 2>&1 &

echo "Starting Site Proxy (Port 5173)..."
cd "$BASE_DIR"
nohup node ./scripts/site-proxy.mjs < /dev/null > "$BASE_DIR/proxy.log" 2>&1 &

echo "--------------------------------------------------"
echo "Services started!"
echo "Frontend: http://localhost:5173"
echo "Backend:  http://localhost:8080"
echo "Check proxy.log and backend.log for details."
echo "--------------------------------------------------"
