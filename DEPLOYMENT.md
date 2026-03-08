# Deployment Guide – MyChampions Food Microservice

## Overview

This document describes how to deploy the Food Microservice to the VPS at
`165.22.147.90` (`ssh digiocean`).

The service runs in Docker behind Nginx and validates Firebase ID tokens
before proxying food search requests to the FatSecret API.

---

## Prerequisites

1. **VPS access:** `ssh digiocean` (IP: `165.22.147.90`)
2. **Docker installed** on the VPS (already verified)
3. **Nginx installed** on the VPS (already verified)
4. **FatSecret IP allowlist:** Add `165.22.147.90` in the FatSecret developer
   portal under your application's IP restrictions.
5. **Domain / DNS:** Point your chosen domain (e.g. `food.mychampions.app`) to
   `165.22.147.90`. (Or use the IP directly for testing.)
6. **Firebase service account:** Download a service account JSON key from the
   Firebase console (Project settings → Service accounts → Generate new key).

---

## Step-by-Step Deployment

### 1. Copy repository to VPS

```bash
# From local machine
rsync -avz --exclude='.git' --exclude='node_modules' --exclude='dist' \
  . digiocean:/opt/food-microservice/
```

### 2. Create .env on VPS

```bash
ssh digiocean
cd /opt/food-microservice
cp .env.example .env
nano .env   # Fill in FIREBASE_SERVICE_ACCOUNT_JSON, FATSECRET_CLIENT_ID, FATSECRET_CLIENT_SECRET
```

`FIREBASE_SERVICE_ACCOUNT_JSON` can be:
- **Base64-encoded** (recommended): `base64 -i serviceAccountKey.json | tr -d '\n'`
- Or the raw JSON on a single line (escape double quotes)

### 3. Run deploy script

```bash
ssh digiocean "cd /opt/food-microservice && bash infra/scripts/deploy.sh"
```

### 4. Issue TLS certificate (first time only)

```bash
ssh digiocean
sudo certbot --nginx -d food.mychampions.app
```

### 5. Update mobile app

In your Expo project's `.env` / EAS secrets:

```
EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL=https://food.mychampions.app/searchFoods
```

Then rebuild:

```bash
eas build --platform all
```

---

## Verification

```bash
BASE_URL="https://food.mychampions.app"
TOKEN="<valid-Firebase-ID-token>"

# Health check (no auth)
curl -s "$BASE_URL/health" | jq .
# Expected: { "status": "ok", "service": "food-microservice", ... }

# Food search (happy path)
curl -s -X POST "$BASE_URL/searchFoods" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"chicken breast","maxResults":5}' | jq .
# Expected: { "results": [...] }

# Unauthenticated (no token)
curl -s -X POST "$BASE_URL/searchFoods" \
  -H "Content-Type: application/json" \
  -d '{"query":"chicken","maxResults":5}' | jq .
# Expected: 401, { "error": "unauthenticated" }

# Bad input
curl -s -X POST "$BASE_URL/searchFoods" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"maxResults":5}' | jq .
# Expected: 400, { "error": "bad_request" }
```

---

## Rollback

To quickly revert to the Firebase Cloud Function endpoint:

### Option A – Update the app URL only (zero VPS changes)

1. Change `EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL` back to the Firebase URL.
2. Rebuild and redeploy the mobile app.

### Option B – Stop the VPS service

```bash
ssh digiocean "cd /opt/food-microservice && bash infra/scripts/rollback.sh"
```

Or manually:

```bash
ssh digiocean
cd /opt/food-microservice
docker compose down
```

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `3000` | Internal HTTP port |
| `NODE_ENV` | No | `production` | Node environment |
| `LOG_LEVEL` | No | `info` | Pino log level |
| `TRUST_PROXY_HOPS` | No | `1` | Reverse-proxy hops trusted for correct client IP rate-limiting |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Yes** | – | Firebase service account (base64 or raw JSON) |
| `FATSECRET_CLIENT_ID` | **Yes** | – | FatSecret OAuth2 client ID |
| `FATSECRET_CLIENT_SECRET` | **Yes** | – | FatSecret OAuth2 client secret |
| `FATSECRET_API_URL` | No | FatSecret default | Override FatSecret API endpoint |
| `FATSECRET_TOKEN_URL` | No | FatSecret default | Override FatSecret token endpoint |
| `TOKEN_EXPIRY_MARGIN_SECONDS` | No | `60` | Seconds before expiry to refresh token |
| `UPSTREAM_TIMEOUT_MS` | No | `10000` | FatSecret call timeout (ms) |
| `UPSTREAM_RETRIES` | No | `2` | Transient error retry count |
| `RATE_LIMIT_WINDOW_MS` | No | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX` | No | `60` | Max requests per IP per window |
| `MAX_RESULTS_LIMIT` | No | `50` | Server-side cap on maxResults |

---

## Monitoring

Check container logs:

```bash
ssh digiocean "docker logs food-microservice --tail=100 -f"
```

Container status:

```bash
ssh digiocean "docker ps | grep food-microservice"
```

Health check:

```bash
curl -s https://food.mychampions.app/health | jq .
```
