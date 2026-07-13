# MyChampions Food Microservice

A production-ready Node.js microservice that powers catalog ingestion, live FatSecret search, and multilingual food data for the **MyChampions** fitness app. It proxies the [FatSecret REST API](https://platform.fatsecret.com/api/), caches and translates results via Redis and Google Translate, and validates protected requests through the root MyChampions server.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Running Tests](#running-tests)
- [Deployment](#deployment)
- [Operational Notes](#operational-notes)
- [Mobile App Integration](#mobile-app-integration)
- [Related Services](#related-services)

---

## Overview

The Food Microservice serves two main functions:

1. **Live FatSecret food search** — Authenticated users query food items in real time. The service forwards the request to FatSecret, caches translation results in Redis, and returns results in the user's language.
2. **Multilingual food catalog** — A pre-built, language-aware catalog of foods is ingested from FatSecret, translated, persisted to Postgres, and served from Redis as the hot cache. If Redis is empty or unready and `POSTGRES_URL` is configured, the service rebuilds the Redis catalog from Postgres before serving catalog search.

Mobile food search is served through the root Bun/Elysia server's authenticated `/integrations/food/search` route. This service remains available for protected catalog and operator workflows and validates the same MyChampions bearer sessions through the root server.

---

## Architecture

```
Protected catalog/operator client
        |
        | MyChampions access token (Authorization: Bearer <token>)
        v
┌─────────────────────────────────────────────────────┐
│              Express HTTP Server (Node.js)           │
│                                                     │
│  ┌─────────────┐   ┌────────────────────────────┐  │
│  │ /searchFoods│   │   /catalog/* endpoints     │  │
│  │  (live)     │   │   (catalog-backed)         │  │
│  └──────┬──────┘   └────────────┬───────────────┘  │
│         │                       │                   │
│         │          ┌────────────▼───────────────┐  │
│         │          │    Redis (ioredis)          │  │
│         │          │  - Food catalog store       │  │
│         │          │  - Query translation cache  │  │
│         │          └────────────────────────────┘  │
│         │                                           │
│  ┌──────▼──────────────────────────────────────┐   │
│  │          FatSecret REST API (OAuth2)         │   │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │       Google Translate API                   │  │
│  │  (query translation + catalog localization)  │  │
│  └──────────────────────────────────────────────┘  │
│                                                     │
│  ┌──────────────────────────────────────────────┐  │
│  │   Root MyChampions server GET /me (Auth)      │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

**Key components:**

| Component | Library / Service | Role |
|---|---|---|
| HTTP server | Express 4 | Request routing, middleware, rate limiting |
| Authentication | Root MyChampions server | Validate MyChampions bearer sessions through `GET /me` |
| Food data | FatSecret REST API (OAuth2) | Live food search data source |
| Caching & catalog | Redis via ioredis + Postgres | Redis serves hot catalog/search data; Postgres is the persistent recovery source |
| Translation | Google Translate API v2 | Multilingual query + catalog localization |
| Logging | pino / pino-pretty | Structured JSON logging |
| Metrics | Built-in `/metrics` endpoint | Request counts, latency, error rates |

---

## API Endpoints

All protected endpoints expect a **MyChampions server access token** in the `Authorization` header:

```
Authorization: Bearer <mychampions-access-token>
```

Admin endpoints require the `x-catalog-admin-key` header to match `CATALOG_ADMIN_API_KEY`.

---

### `GET /health`

Public. Returns the service liveness status.

**Response 200:**
```json
{ "status": "ok" }
```

---

### `GET /metrics`

Public. Returns operational metrics (request counts, error rates, latency percentiles).

**Response 200:** Prometheus-compatible text or JSON metrics payload.

---

### `POST /searchFoods`

**Auth required** (MyChampions bearer session).

Live food search proxied to FatSecret. Results are returned in the language inferred from the request or the `language` field.

**Request body:**
```json
{
  "query": "chicken breast",
  "language": "pt",
  "maxResults": 10,
  "pageNumber": 0
}
```

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | yes | Search term |
| `language` | string | no | BCP-47 language code (e.g. `"pt"`, `"es"`, `"en"`). Defaults to `"en"`. |
| `maxResults` | number | no | Number of results (capped by `MAX_RESULTS_LIMIT`, default 50) |
| `pageNumber` | number | no | Pagination offset (default 0) |

**Response 200:**
```json
{
  "foods": [
    {
      "food_id": "4820",
      "food_name": "Peito de Frango",
      "food_type": "Generic",
      "food_url": "https://...",
      "food_description": "Per 100g - Calories: 165kcal | Fat: 3.57g | Carbs: 0g | Protein: 31.02g"
    }
  ],
  "total_results": 48,
  "page_number": 0,
  "max_results": 10
}
```

**Response 401:** Missing, invalid, revoked, or deleted MyChampions session.
**Response 503:** Root MyChampions auth service unavailable.
**Response 429:** Rate limit exceeded.
**Response 502:** FatSecret API unreachable.

---

### `POST /catalog/searchFoods`

**Auth required** (MyChampions bearer session).

Searches the pre-built multilingual food catalog stored in Redis. Does not call FatSecret at query time — results come from the local catalog.

**Request body:**
```json
{
  "query": "arroz",
  "language": "pt",
  "maxResults": 20
}
```

**Response 200:** Same shape as `/searchFoods`.

**Response 503:** Catalog not available (ingestion disabled or catalog not yet populated).

---

### `GET /catalog/health`

Public. Returns catalog readiness state (Redis connectivity, item count, last sync timestamp).

**Response 200:**
```json
{
  "status": "ready",
  "itemCount": 15200,
  "lastSyncAt": "2025-01-15T10:30:00.000Z",
  "languages": ["en", "pt", "es"]
}
```

---

### `POST /catalog/admin/sync`

**Admin key required** (`x-catalog-admin-key` header).

Triggers a manual catalog sync from FatSecret. Ingests food items, runs translation, and populates Redis. Long-running — returns immediately with a job acknowledgement.

**Request body:** `{}` (empty or optional filters)

**Response 202:**
```json
{ "message": "Catalog sync started", "jobId": "sync-1705312200" }
```

**Response 403:** Invalid or missing admin API key.
**Response 503:** `ENABLE_CATALOG_INGESTION` is `false`.

---

### `POST /catalog/admin/localization/review`

**Admin key required** (`x-catalog-admin-key` header).

Submits a localization correction for a catalog entry. Used for human review of machine-translated food names.

**Request body:**
```json
{
  "food_id": "4820",
  "language": "pt",
  "corrected_name": "Peito de Frango Grelhado",
  "reviewer": "admin@mychampions.app"
}
```

**Response 200:**
```json
{ "updated": true }
```

---

### `POST /catalog/feedback/click`

**Auth required** (MyChampions bearer session).

Records a user click/selection on a food item. Used for catalog ranking signals.

**Request body:**
```json
{
  "food_id": "4820",
  "query": "frango",
  "language": "pt"
}
```

**Response 200:**
```json
{ "recorded": true }
```

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values before running.

```bash
cp .env.example .env
```

For local catalog storage backed by Dockerized Postgres and Redis, use the
parent workspace runbook at `../docs/local-catalog-db.md` and start from
`.env.local.example`. The service `dev` script preloads `.env.local`. The local food
database connection is:

```bash
POSTGRES_URL=postgres://mychampions_local:mychampions_local_password@localhost:15432/mychampions_food_catalog_local
```

See `.env.example` for the full list with inline documentation. The critical variables are described below.

### Required

| Variable | Description |
|---|---|
| `MYCHAMPIONS_AUTH_SERVER_URL` | Root Bun server base URL used for protected-session validation through `GET /me`. Required in production; local development uses `http://localhost:3400`. |
| `FATSECRET_CLIENT_ID` | OAuth2 client ID from [platform.fatsecret.com](https://platform.fatsecret.com/api/). |
| `FATSECRET_CLIENT_SECRET` | OAuth2 client secret from the FatSecret developer portal. |
| `REDIS_URL` | Redis connection URL. Example: `redis://localhost:6379`. In Docker Compose, this is overridden internally to `redis://food-catalog-redis:6379`. |
| `GOOGLE_TRANSLATE_API_KEY` | Google Cloud Translate API v2 key. Required when `ENABLE_TRANSLATION_PIPELINE=true` and `TRANSLATION_PROVIDER=google`. |

### Feature Flags

| Variable | Default | Description |
|---|---|---|
| `TRANSLATION_PROVIDER` | `google` | Translation provider used by multilingual search and catalog localization. Currently supported: `google`. |
| `ENABLE_TRANSLATION_PIPELINE` | `true` | When `true`, search queries are translated and results are localized through the selected translation provider. |
| `ENABLE_CATALOG_INGESTION` | `false` | When `true`, the catalog sync job can run. **Defaults to `false` to prevent accidental large-scale FatSecret API usage.** Must be explicitly enabled in production for catalog builds. |

### Admin

| Variable | Description |
|---|---|
| `CATALOG_ADMIN_API_KEY` | Secret key required in the `x-catalog-admin-key` header for all `/catalog/admin/*` endpoints. |

### Optional (with defaults)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port the service listens on. |
| `NODE_ENV` | `production` | Node environment. |
| `LOG_LEVEL` | `info` | pino log level (`trace`, `debug`, `info`, `warn`, `error`). |
| `TRUST_PROXY_HOPS` | _(unset)_ | Number of reverse-proxy hops (set to `1` behind Nginx). |
| `UPSTREAM_TIMEOUT_MS` | `10000` | FatSecret request timeout in milliseconds. |
| `UPSTREAM_RETRIES` | `2` | Retry attempts on transient FatSecret errors. |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate limit window (ms). |
| `RATE_LIMIT_MAX` | `60` | Max requests per IP per window. |
| `MAX_RESULTS_LIMIT` | `50` | Server-side cap on `maxResults`. |
| `CATALOG_MAX_AGE_DAYS` | `180` | Catalog freshness threshold. Sync runs if catalog is older than this. |
| `POSTGRES_URL` | _(unset)_ | Postgres catalog source used to restore Redis when the Redis catalog is empty/unready. |
| `CATALOG_POSTGRES_RESTORE_ON_MISS` | `true` | Enables Postgres-backed Redis restore when `POSTGRES_URL` is set. |
| `QUERY_TRANSLATION_CACHE_TTL_SECONDS` | `2592000` | TTL for cached query translations in Redis (30 days). |

---

## Local Development

### Prerequisites

- Node.js >= 20
- Docker and Docker Compose (for Redis and local Postgres)
- A FatSecret API account with your VPS/dev IP allowlisted (see [Operational Notes](#operational-notes))
- A reachable root MyChampions Bun server for protected endpoint validation

### Setup

```bash
# From the parent MyChampions workspace:
bun run local:db:up
cp mychampionsapi-food/.env.local.example mychampionsapi-food/.env.local
```

To mirror the production catalog Postgres data into the local Docker database:

```bash
bun run local:db:mirror
```

The mirror command overwrites only local databases ending in `_local` and reads
production through `ssh digiocean`; it does not write to production.

The existing catalog migration and Redis rebuild scripts are unchanged. Export
the local env before running them, for example:

```bash
cd mychampionsapi-food
set -a
source ./.env.local
set +a
DRY_RUN=false CONFIRM_REDIS_REBUILD=true bun run rebuild:catalog:redis:dev
```

```bash
# From mychampionsapi-food:
bun install
bun run dev
```

The local service will be available at `http://localhost:3201`.

### Available Scripts

| Script | Description |
|---|---|
| `bun run dev` | Start with ts-node (no compile step, hot-reloadable) |
| `bun run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled output from `dist/index.js` |
| `npm test` | Run all tests (jest --forceExit) |
| `bun run test:unit` | Unit tests only |
| `bun run test:integration` | Integration tests only |
| `bun run test:contract` | Contract tests only |
| `bun run lint` | ESLint check |
| `bun run lint:fix` | ESLint auto-fix |
| `bun run catalog:shadow-validate` | Validate catalog shadow data |

---

## Running Tests

```bash
# Run all test suites
npm test

# Run only unit tests
npm run test:unit

# Run only integration tests (requires Redis)
npm run test:integration

# Run only contract tests
npm run test:contract
```

Integration tests require a running Redis instance. Start it with `docker-compose up -d` before running integration tests. Set `NODE_ENV=test` to disable real HTTP calls to FatSecret (nock intercepts are used).

---

## Deployment

The service uses a **blue/green deployment strategy** to achieve zero-downtime releases.

```bash
# Deploy using the provided script
./deploy-blue-green.sh
```

The script manages two running instances (blue and green slots) behind an Nginx upstream, switches traffic atomically after health checks pass, then stops the old slot.

For full deployment instructions including server setup, Nginx configuration, SSL, and rollback procedures, see **DEPLOYMENT.md**.

The compiled output is served by:
```bash
npm run build   # produces dist/
npm start       # runs dist/index.js
```

Production environment variables must be set on the host before starting the process (not via `.env` in production — inject via systemd, Docker secrets, or your CI/CD pipeline).

---

## Operational Notes

### FatSecret IP Allowlisting

> **Important:** FatSecret's API enforces IP-based access control.

Your server's **static public IP address** must be registered in the FatSecret developer portal at [platform.fatsecret.com](https://platform.fatsecret.com/api/) under your application's allowed IPs. Requests from un-allowlisted IPs will receive `401 Unauthorized` from FatSecret regardless of OAuth credentials.

- In production, register your VPS static IP.
- In local development, register your public IP (use `curl ifconfig.me`). Note that home IPs are often dynamic — you may need to update this periodically.

### Catalog Ingestion is Disabled by Default

`ENABLE_CATALOG_INGESTION` defaults to `false`. This prevents accidental large-scale FatSecret API consumption. To populate or refresh the catalog, explicitly set:

```
ENABLE_CATALOG_INGESTION=true
```

in your environment, then trigger a sync via `POST /catalog/admin/sync` with the admin API key.

### Catalog Persistence

The food catalog is served from Redis for low latency, but Postgres should be treated as the persistent source of truth. Keep the periodic Redis-to-Postgres catalog migration running after catalog refreshes. With `POSTGRES_URL` set, the service can rebuild Redis catalog keys from Postgres when Redis is empty or unready.

### Token Caching

FatSecret OAuth2 tokens are cached in memory. The `TOKEN_EXPIRY_MARGIN_SECONDS` setting (default: 60s) controls how early a proactive refresh is triggered before token expiry.

---

## Mobile App Integration

The MyChampions React Native / Expo mobile app connects to this service using:

**Environment variable in the mobile app:**
```
EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL=https://foodservice.eduwaldo.com
```

**Authentication flow:**
1. The user signs in through the root MyChampions server.
2. The root server issues a short-lived MyChampions access token.
3. Every protected request to this microservice includes that token:
   ```
   Authorization: Bearer <mychampions-access-token>
   ```
4. The microservice forwards the token to the root server's authenticated `GET /me` boundary and uses `profile.authUid` only after successful validation.

Expired, revoked, deleted, or malformed sessions, plus a root-server HTTP 401, are rejected with HTTP 401. A root-server HTTP 404, transport failure, or server failure is rejected with HTTP 503.

---

## Related Services

| Service | URL | Description |
|---|---|---|
| **Food Microservice** (this service) | `https://foodservice.eduwaldo.com` | FatSecret food search + multilingual Redis catalog |
| **Exercise Microservice** | `https://exerciseservice.eduwaldo.com` | Exercise data and workout tracking backend |

Both catalog services use the root MyChampions server as the authentication authority and are deployed on the same VPS infrastructure using the blue/green deployment pattern.

---

## License

Private — MyChampions. All rights reserved.
