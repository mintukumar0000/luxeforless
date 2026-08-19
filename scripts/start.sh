#!/usr/bin/env bash
# LuxeForLess — start all services (memory-safe for 8GB Mac)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "=== LuxeForLess Startup ==="
echo ""
echo "IMPORTANT for 8GB RAM Macs:"
echo "  • Close Chrome tabs, Slack, and other heavy apps before try-on"
echo "  • Plug in power adapter"
echo "  • Free at least 15GB disk space if possible (yours is 97% full)"
echo "  • First try-on loads the AI model (~2GB) — takes 1-2 min before steps begin"
echo "  • Each try-on takes 5-15 minutes on 8GB Mac — do NOT run multiple at once"
echo ""

# Check disk space
FREE_GB=$(df -g /System/Volumes/Data | tail -1 | awk '{print $4}')
if [ "$FREE_GB" -lt 10 ]; then
  echo "⚠️  WARNING: Only ${FREE_GB}GB disk free. macOS needs swap space or your Mac may freeze/shutdown."
  echo "   Free up disk space before running AI try-on."
  echo ""
fi

# Start Postgres
echo "Starting PostgreSQL..."
cd "$ROOT"
docker compose up -d postgres
sleep 4

# Setup DB if needed
echo "Setting up database..."
cd "$ROOT/apps/web"
npx prisma db push --skip-generate 2>/dev/null || npx prisma db push
npm run db:seed 2>/dev/null || true

# Kill old processes (including stuck inference workers)
pkill -9 -f "uvicorn app.main" 2>/dev/null || true
lsof -ti :8000 | xargs kill -9 2>/dev/null || true
lsof -ti :8001 | xargs kill -9 2>/dev/null || true
lsof -ti :3000 | xargs kill -9 2>/dev/null || true
sleep 2

VTO_PORT=8000
if lsof -nP -iTCP:8000 -sTCP:LISTEN >/dev/null 2>&1; then
  echo "⚠️  Port 8000 still occupied (likely zombie from crashed inference). Using 8001."
  VTO_PORT=8001
fi

# Start VTO (4 steps for 8GB Mac, lazy model load)
echo "Starting VTO service (port ${VTO_PORT})..."
cd "$ROOT/services/vto"
source .venv/bin/activate
export WEIGHTS_DIR="$ROOT/services/vto/weights"
export RESULTS_DIR="$ROOT/services/vto/results"
export VTO_NUM_TIMESTEPS=4
export VTO_MAX_IMAGE_SIZE=512
unset PYTORCH_MPS_HIGH_WATERMARK_RATIO
nohup python -m uvicorn app.main:app --host 0.0.0.0 --port "$VTO_PORT" > /tmp/luxeforless-vto.log 2>&1 &
echo "  VTO PID: $!  (logs: /tmp/luxeforless-vto.log)"

# Point web app at whichever port VTO uses
cd "$ROOT/apps/web"
if grep -q '^VTO_SERVICE_URL=' .env 2>/dev/null; then
  sed -i '' "s|^VTO_SERVICE_URL=.*|VTO_SERVICE_URL=\"http://localhost:${VTO_PORT}\"|" .env
  sed -i '' "s|^NEXT_PUBLIC_VTO_SERVICE_URL=.*|NEXT_PUBLIC_VTO_SERVICE_URL=\"http://localhost:${VTO_PORT}\"|" .env
fi
echo "Starting web app (port 3000)..."
cd "$ROOT/apps/web"
nohup npm run dev > /tmp/luxeforless-web.log 2>&1 &
echo "  Web PID: $!  (logs: /tmp/luxeforless-web.log)"

sleep 5
echo ""
echo "=== Ready ==="
echo "  Mirror app:  http://localhost:3000"
echo "  Upload:      http://localhost:3000/studio"
echo "  VTO health:  http://localhost:${VTO_PORT}/health"
echo ""
curl -s "http://localhost:${VTO_PORT}/health" 2>/dev/null || echo "  (VTO still starting — model loads on first try-on)"
curl -s -o /dev/null -w "  Web: HTTP %{http_code}\n" http://localhost:3000 2>/dev/null || echo "  (Web still starting)"
