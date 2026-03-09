#!/usr/bin/env bash
# rollback.sh – Food microservice rollback helper (blue/green aware)
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/food-microservice}"
ACTIVE_SLOT_FILE="$APP_DIR/.active_slot"
NGINX_UPSTREAM_SNIPPET="/etc/nginx/snippets/food-microservice-upstream.conf"
declare -a COMPOSE_CMD=()

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "ERROR: neither 'docker compose' nor 'docker-compose' is available"
  exit 1
fi

cd "$APP_DIR"

current_slot="blue"
if [[ -f "$ACTIVE_SLOT_FILE" ]]; then
  slot="$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE")"
  if [[ "$slot" == "blue" || "$slot" == "green" ]]; then
    current_slot="$slot"
  fi
fi

if [[ "$current_slot" == "blue" ]]; then
  target_slot="green"
  target_port="3202"
else
  target_slot="blue"
  target_port="3201"
fi

echo "=== Food microservice rollback ==="
echo "Current slot: $current_slot"
echo "Rollback slot: $target_slot"

"${COMPOSE_CMD[@]}" up -d "food-microservice-$target_slot"

for i in {1..15}; do
  if curl -fsS --max-time 3 "http://127.0.0.1:${target_port}/health" >/dev/null; then
    break
  fi
  if [[ $i -eq 15 ]]; then
    echo "ERROR: rollback target slot failed health check"
    exit 1
  fi
  sleep 2
done

sudo mkdir -p /etc/nginx/snippets
printf 'set $food_upstream http://127.0.0.1:%s;\n' "$target_port" | sudo tee "$NGINX_UPSTREAM_SNIPPET" >/dev/null
sudo nginx -t
sudo systemctl reload nginx

printf '%s\n' "$target_slot" > "$ACTIVE_SLOT_FILE"
"${COMPOSE_CMD[@]}" stop "food-microservice-$current_slot" >/dev/null 2>&1 || true
"${COMPOSE_CMD[@]}" rm -f "food-microservice-$current_slot" >/dev/null 2>&1 || true

echo "Rollback complete. Active slot: $target_slot"
