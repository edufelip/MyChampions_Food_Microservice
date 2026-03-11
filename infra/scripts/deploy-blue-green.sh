#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/food-microservice}"
ACTIVE_SLOT_FILE="$APP_DIR/.active_slot"
LOCK_FILE="/tmp/food-microservice-blue-green.lock"
LOCK_DIR=""
NGINX_CONF_SRC="$APP_DIR/infra/nginx/food-microservice.conf"
NGINX_CONF_DST="/etc/nginx/sites-available/food-microservice"
NGINX_ENABLED="/etc/nginx/sites-enabled/food-microservice"
NGINX_UPSTREAM_SNIPPET="/etc/nginx/snippets/food-microservice-upstream.conf"
PUBLIC_DOMAIN="${PUBLIC_DOMAIN:-foodservice.eduwaldo.com}"
IMAGE_REPO="${IMAGE_REPO:-ghcr.io/edufelip/mychampions_food_microservice}"
IMAGE_TAG="${IMAGE_TAG:-main}"
DEPLOY_IMAGE="${IMAGE_REPO}:${IMAGE_TAG}"

PROTECTED_CONTAINERS=("meer" "meer-dev")
PROTECTED_PORTS=(8081 8080)
declare -A SLOT_PORT=( [blue]=3201 [green]=3202 )
declare -a COMPOSE_CMD=()

TARGET_SLOT=""
CURRENT_SLOT=""
SWITCHED="0"

log() {
  printf '%s\n' "$*"
}

normalize_state() {
  local raw="$1"
  printf '%s' "$raw" | tr '\t' ' ' | sed -E 's/[[:space:]]+/ /g; s/^ //; s/ $//'
}

container_state() {
  local container_name="$1"
  if docker inspect "$container_name" >/dev/null 2>&1; then
    docker inspect --format '{{.State.Status}}|{{.State.StartedAt}}' "$container_name"
  else
    printf '__MISSING__\n'
  fi
}

capture_protected_state() {
  local container_name="$1"
  local port="$2"
  if docker inspect "$container_name" >/dev/null 2>&1; then
    printf 'docker|%s\n' "$(docker inspect --format '{{.State.Status}}|{{.State.StartedAt}}' "$container_name")"
    return
  fi

  local line
  line="$(ss -ltnp | grep -E ":${port}[[:space:]]" | head -n1 || true)"
  if [[ -n "$line" ]]; then
    printf 'port|%s\n' "$(normalize_state "$line")"
    return
  fi

  printf '__MISSING__\n'
}

assert_protected_unchanged() {
  local phase="$1"
  for i in "${!PROTECTED_CONTAINERS[@]}"; do
    local cname="${PROTECTED_CONTAINERS[$i]}"
    local port="${PROTECTED_PORTS[$i]}"
    local now
    now="$(capture_protected_state "$cname" "$port")"
    if [[ "${PROTECTED_BASELINE[$cname]}" != "$now" ]]; then
      log "ERROR: protected container '$cname' changed during $phase"
      log "Baseline: ${PROTECTED_BASELINE[$cname]}"
      log "Current:  $now"
      exit 1
    fi
  done
}

setup_compose_cmd() {
  if docker compose version >/dev/null 2>&1; then
    COMPOSE_CMD=(docker compose)
    return
  fi

  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_CMD=(docker-compose)
    return
  fi

  log "ERROR: neither 'docker compose' nor 'docker-compose' is available"
  exit 1
}

detect_current_slot() {
  if [[ -f "$ACTIVE_SLOT_FILE" ]]; then
    local slot
    slot="$(tr -d '[:space:]' < "$ACTIVE_SLOT_FILE")"
    if [[ "$slot" == "blue" || "$slot" == "green" ]]; then
      printf '%s\n' "$slot"
      return
    fi
  fi

  if sudo test -f "$NGINX_UPSTREAM_SNIPPET"; then
    if sudo grep -q '127\.0\.0\.1:3202' "$NGINX_UPSTREAM_SNIPPET"; then
      printf 'green\n'
      return
    fi
  fi

  printf 'blue\n'
}

switch_nginx_upstream() {
  local slot="$1"
  local port="${SLOT_PORT[$slot]}"

  sudo mkdir -p /etc/nginx/snippets
  printf 'set $food_upstream http://127.0.0.1:%s;\n' "$port" | sudo tee "$NGINX_UPSTREAM_SNIPPET" >/dev/null

  sudo cp "$NGINX_CONF_SRC" "$NGINX_CONF_DST"
  sudo ln -sf "$NGINX_CONF_DST" "$NGINX_ENABLED"
  sudo nginx -t
  sudo systemctl reload nginx
}

wait_local_health() {
  local slot="$1"
  local port="${SLOT_PORT[$slot]}"

  for i in {1..24}; do
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  return 1
}

wait_public_health() {
  for i in {1..15}; do
    if curl -fsS --max-time 5 "https://${PUBLIC_DOMAIN}/health" >/dev/null; then
      return 0
    fi
    sleep 2
  done

  return 1
}

rollback_on_error() {
  local exit_code="$1"
  if [[ -n "$LOCK_DIR" ]]; then
    rmdir "$LOCK_DIR" >/dev/null 2>&1 || true
  fi
  if [[ "$exit_code" -eq 0 ]]; then
    return
  fi

  if [[ "$SWITCHED" -eq 1 && -n "$CURRENT_SLOT" ]]; then
    log "Deploy failed after cutover. Reverting Nginx upstream to $CURRENT_SLOT..."
    switch_nginx_upstream "$CURRENT_SLOT" || true
    printf '%s\n' "$CURRENT_SLOT" > "$ACTIVE_SLOT_FILE"
  fi

  if [[ -n "$TARGET_SLOT" ]]; then
    log "Stopping failed target slot: $TARGET_SLOT"
    if [[ "${#COMPOSE_CMD[@]}" -gt 0 ]]; then
      "${COMPOSE_CMD[@]}" stop "food-microservice-$TARGET_SLOT" >/dev/null 2>&1 || true
      "${COMPOSE_CMD[@]}" rm -f "food-microservice-$TARGET_SLOT" >/dev/null 2>&1 || true
    fi
  fi
}

trap 'rollback_on_error $?' EXIT

log "=== Safe Food Microservice Deploy (Blue/Green) ==="
log "App dir: $APP_DIR"
log "Domain:  $PUBLIC_DOMAIN"
log "Image:   $DEPLOY_IMAGE"

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  if ! flock -n 9; then
    log "ERROR: another deploy is in progress (lock file: $LOCK_FILE)"
    exit 1
  fi
else
  LOCK_DIR="${LOCK_FILE}.d"
  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    log "ERROR: another deploy is in progress (lock dir: $LOCK_DIR)"
    exit 1
  fi
fi

cd "$APP_DIR"
setup_compose_cmd

if [[ ! -f .env ]]; then
  log "ERROR: .env file not found in $APP_DIR"
  exit 1
fi

if [[ ! -f "$NGINX_CONF_SRC" ]]; then
  log "ERROR: missing nginx template: $NGINX_CONF_SRC"
  exit 1
fi

declare -A PROTECTED_BASELINE
for i in "${!PROTECTED_CONTAINERS[@]}"; do
  cname="${PROTECTED_CONTAINERS[$i]}"
  port="${PROTECTED_PORTS[$i]}"
  PROTECTED_BASELINE[$cname]="$(capture_protected_state "$cname" "$port")"
  if [[ "${PROTECTED_BASELINE[$cname]}" == "__MISSING__" ]]; then
    log "ERROR: protected service '$cname' (container or port ${port}) not found. Aborting for safety."
    exit 1
  fi
  if [[ "${PROTECTED_BASELINE[$cname]}" == docker\|* && "${PROTECTED_BASELINE[$cname]}" != docker\|running* ]]; then
    log "ERROR: protected container '$cname' is not running. Aborting for safety."
    exit 1
  fi
  log "Protected baseline $cname: ${PROTECTED_BASELINE[$cname]}"
done

CURRENT_SLOT="$(detect_current_slot)"
if [[ "$CURRENT_SLOT" == "blue" ]]; then
  TARGET_SLOT="green"
else
  TARGET_SLOT="blue"
fi

log "Current active slot: $CURRENT_SLOT"
log "Target slot:         $TARGET_SLOT"

export FOOD_IMAGE="$DEPLOY_IMAGE"
log "Pulling deployment image..."
docker pull "$DEPLOY_IMAGE"
log "Pulling compose service image for target slot..."
"${COMPOSE_CMD[@]}" pull "food-microservice-$TARGET_SLOT"

log "Starting target slot container..."
"${COMPOSE_CMD[@]}" up -d --no-build "food-microservice-$TARGET_SLOT"

log "Waiting for local health on target slot..."
if ! wait_local_health "$TARGET_SLOT"; then
  log "ERROR: target slot failed local health check"
  "${COMPOSE_CMD[@]}" logs --tail=100 "food-microservice-$TARGET_SLOT" || true
  exit 1
fi

log "Switching Nginx upstream to target slot..."
switch_nginx_upstream "$TARGET_SLOT"
SWITCHED="1"
printf '%s\n' "$TARGET_SLOT" > "$ACTIVE_SLOT_FILE"

log "Verifying public health after cutover..."
if ! wait_public_health; then
  log "ERROR: public health check failed after cutover"
  exit 1
fi

log "Stopping previous slot: $CURRENT_SLOT"
"${COMPOSE_CMD[@]}" stop "food-microservice-$CURRENT_SLOT" >/dev/null 2>&1 || true
"${COMPOSE_CMD[@]}" rm -f "food-microservice-$CURRENT_SLOT" >/dev/null 2>&1 || true

assert_protected_unchanged "deploy"

log "=== Deploy complete ==="
log "Active slot: $TARGET_SLOT"
log "Public URL: https://${PUBLIC_DOMAIN}/health"
