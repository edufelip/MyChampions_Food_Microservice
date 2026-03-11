# Deployment Guide – MyChampions Food Microservice

## Overview

This service is deployed on VPS (`ssh digiocean`) in **blue/green mode** and
exposed at `https://foodservice.eduwaldo.com`.

Safety requirement: services `meer` and `meer-dev` are protected and must not
be touched during food-service deployments.

---

## Prerequisites

1. VPS access: `ssh digiocean`
2. Docker + Docker Compose available on VPS
3. Nginx available on VPS
4. FatSecret allowlist includes `<VPS_STATIC_IP>`
5. DNS `foodservice.eduwaldo.com` points to `<VPS_STATIC_IP>`
6. GitHub secret `FOODSERVICE_ENV_FILE` populated with full `.env` content, including:
   - `FIREBASE_SERVICE_ACCOUNT_JSON`
   - `FATSECRET_CLIENT_ID`
   - `FATSECRET_CLIENT_SECRET`

---

## Manual Deploy (Safe Blue/Green)

### 1. Sync code

```bash
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='dist' \
  . digiocean:/opt/food-microservice/
```

### 2. Run deploy script

```bash
ssh digiocean "cd /opt/food-microservice && PUBLIC_DOMAIN=foodservice.eduwaldo.com bash infra/scripts/deploy-blue-green.sh"
```

What it does:
- Verifies protected containers `meer` and `meer-dev` are running and unchanged.
- Builds and starts the inactive food slot (`blue` on `3201` or `green` on `3202`).
- Waits for local health on the target slot.
- Switches Nginx upstream only after health passes.
- Verifies public `https://foodservice.eduwaldo.com/health`.
- Stops old food slot only after successful cutover.

---

## TLS (first setup)

```bash
ssh digiocean "sudo certbot --nginx -d foodservice.eduwaldo.com"
```

---

## GitHub Actions Auto Deploy

Workflow: `.github/workflows/deploy-food-prod.yml`

Trigger:
- `push` to `main`
- optional `workflow_dispatch`

Required GitHub repository secrets:
- `VPS_HOST`
- `VPS_USER`
- `VPS_SSH_PRIVATE_KEY`
- `VPS_KNOWN_HOSTS`
- `FOODSERVICE_ENV_FILE` (full `.env` file text)
- `GHCR_USERNAME` (GitHub user/org with package read access)
- `GHCR_TOKEN` (token with `read:packages`)

Pipeline flow:
1. Build and push Docker image to GHCR (`ghcr.io/edufelip/mychampions_food_microservice:<sha>` + `:main`).
2. Configure SSH key + known_hosts.
3. `rsync` project to VPS (keeps `.env` out of git sync).
4. Replace `/opt/food-microservice/.env` from `FOODSERVICE_ENV_FILE` (atomic rewrite + required-key validation).
5. Authenticate VPS Docker to GHCR and run `infra/scripts/deploy-blue-green.sh` with `IMAGE_TAG=<sha>`.
6. Verify `https://foodservice.eduwaldo.com/health`.

Secret rotation:
1. Update `FOODSERVICE_ENV_FILE` in GitHub Secrets.
2. Push to `main` (or run `workflow_dispatch`).
3. Confirm health endpoint after deployment.

---

## Verification Commands

```bash
# Public
curl -s https://foodservice.eduwaldo.com/health | jq .

# VPS local
ssh digiocean "curl -s http://127.0.0.1:3201/health || true"
ssh digiocean "curl -s http://127.0.0.1:3202/health || true"

# Containers
ssh digiocean "docker ps --format '{{.Names}}\t{{.Status}}' | rg 'food-microservice|meer|meer-dev'"
```

---

## Rollback

```bash
ssh digiocean "cd /opt/food-microservice && bash infra/scripts/rollback.sh"
```

Rollback starts the opposite food slot, validates health, switches Nginx back,
and then stops the currently active slot.

---

## Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Internal HTTP port |
| `NODE_ENV` | No | `production` | Node environment |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `TRUST_PROXY_HOPS` | No | `1` | Trusted proxy hops |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Yes** | – | Firebase service account |
| `FATSECRET_CLIENT_ID` | **Yes** | – | FatSecret OAuth2 client ID |
| `FATSECRET_CLIENT_SECRET` | **Yes** | – | FatSecret OAuth2 client secret |
| `FATSECRET_API_URL` | No | FatSecret default | API endpoint override |
| `FATSECRET_TOKEN_URL` | No | FatSecret default | OAuth token endpoint override |
| `TOKEN_EXPIRY_MARGIN_SECONDS` | No | `60` | Proactive token refresh margin |
| `UPSTREAM_TIMEOUT_MS` | No | `10000` | Upstream timeout |
| `UPSTREAM_RETRIES` | No | `2` | Retry count |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window |
| `RATE_LIMIT_MAX` | No | `60` | Max requests per window |
| `MAX_RESULTS_LIMIT` | No | `50` | Max `maxResults` cap |
| `ENABLE_CATALOG_SEARCH` | No | `false` | Enables `/catalog/searchFoods` |
| `ENABLE_CATALOG_INGESTION` | No | `false` | Enables catalog admin ingestion/review endpoints |
| `CATALOG_ADMIN_API_KEY` | Conditionally | – | Required when `ENABLE_CATALOG_INGESTION=true` |
| `CATALOG_SYNC_REGION` | No | `US` | Region used during catalog sync |
| `CATALOG_SYNC_MAX_RESULTS_PER_QUERY` | No | `50` | Per-seed query FatSecret max results (capped by `MAX_RESULTS_LIMIT`) |
| `CATALOG_SYNC_SEED_QUERIES` | No | – | Optional CSV override for default seed list |

### Catalog Seed Defaults

The default catalog seed list is now a static JSON file:

- `src/catalog/seeds/top-diet-food-seeds.json` (80 curated English foods)

If `CATALOG_SYNC_SEED_QUERIES` is not set, sync uses the JSON file by default.
Set `CATALOG_SYNC_SEED_QUERIES` only when you need a temporary override.
