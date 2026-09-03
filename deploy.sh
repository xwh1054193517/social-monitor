#!/usr/bin/env bash
set -euo pipefail

# ============================================================
#  Social Monitor — one-click deploy script
#  Usage:  bash deploy.sh
# ============================================================

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

echo "========================================"
echo "  Social Monitor — Docker Deploy"
echo "========================================"
echo ""

# --- 1. Check prerequisites ---
if ! command -v docker &>/dev/null; then
  echo "[ERROR] Docker is not installed."
  echo "  Install:  curl -fsSL https://get.docker.com | sh"
  exit 1
fi

if ! docker compose version &>/dev/null; then
  echo "[ERROR] Docker Compose v2 is not available."
  echo "  Docker 20.10+ includes it. Update Docker or install the plugin."
  exit 1
fi

# --- 2. Check env file ---
if [ ! -f "$ENV_FILE" ]; then
  echo "[ERROR] $ENV_FILE not found."
  echo "  Copy .env.production to the server and fill in your values."
  exit 1
fi

echo "[1/4] Building images..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build

echo ""
echo "[2/4] Starting services..."
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

echo ""
echo "[3/4] Waiting for health checks..."
sleep 8

echo ""
echo "[4/4] Service status:"
docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps

echo ""
echo "========================================"
echo "  Deployment complete!"
echo "========================================"
echo ""
echo "  Web:  http://www.eternalstar.xyz/web3/monitor/"
echo "  API:  http://www.eternalstar.xyz/web3/monitor/api"
echo "  Health: http://www.eternalstar.xyz/web3/monitor/health"
echo ""
echo "  Login: ${ADMIN_USERNAME:-xuwenhao}"
echo ""
echo "  Logs:        docker compose -f $COMPOSE_FILE --env-file $ENV_FILE logs -f"
echo "  Stop:        docker compose -f $COMPOSE_FILE --env-file $ENV_FILE down"
echo "  Rebuild:     bash deploy.sh"
echo ""
