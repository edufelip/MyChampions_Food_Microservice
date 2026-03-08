#!/usr/bin/env bash
# deploy.sh – Deploy the Food Microservice on the VPS (165.22.147.90)
#
# Usage (from local machine):
#   ssh digiocean "bash -s" < infra/scripts/deploy.sh
#
# Or copy first then run:
#   scp -r . digiocean:/opt/food-microservice/
#   ssh digiocean "cd /opt/food-microservice && bash infra/scripts/deploy.sh"
set -euo pipefail

APP_DIR="/opt/food-microservice"
SERVICE_NAME="food-microservice"
NGINX_CONF_SRC="$APP_DIR/infra/nginx/food-microservice.conf"
NGINX_CONF_DST="/etc/nginx/sites-available/food-microservice"
NGINX_ENABLED="/etc/nginx/sites-enabled/food-microservice"

echo "=== MyChampions Food Microservice – Deploy ==="
echo "Directory: $APP_DIR"

cd "$APP_DIR"

# 1. Validate .env exists
if [[ ! -f .env ]]; then
  echo "ERROR: .env file not found. Copy .env.example and fill in the values."
  exit 1
fi

# 2. Build and start Docker container
echo "--- Building Docker image..."
docker compose build --no-cache

echo "--- Starting container..."
docker compose up -d

# 3. Wait for health check
echo "--- Waiting for service to become healthy..."
for i in {1..12}; do
  if curl -sf http://127.0.0.1:3001/health > /dev/null 2>&1; then
    echo "--- Service is healthy."
    break
  fi
  if [[ $i -eq 12 ]]; then
    echo "ERROR: Service did not become healthy in 60s."
    docker compose logs --tail=50
    exit 1
  fi
  echo "    Attempt $i/12 – waiting 5s..."
  sleep 5
done

# 4. Install/update Nginx config (idempotent)
echo "--- Syncing Nginx site config..."
sudo cp "$NGINX_CONF_SRC" "$NGINX_CONF_DST"
sudo ln -sf "$NGINX_CONF_DST" "$NGINX_ENABLED"
sudo nginx -t && sudo systemctl reload nginx
echo "--- Nginx config synced and reloaded."

echo ""
echo "=== Deploy complete ==="
echo "Health: http://127.0.0.1:3001/health"
echo "Public: https://food.mychampions.app/health"
