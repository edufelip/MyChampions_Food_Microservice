# Catalog Big-Bang Rollout Checklist

## Objective
Enable the Redis-backed multilingual catalog search for food with pre-release shadow validation.

## Preconditions
- `ENABLE_CATALOG_INGESTION=true` for sync/review workflows.
- `CATALOG_ADMIN_API_KEY` configured for admin endpoints.
- Redis reachable via `REDIS_URL`.
- FatSecret and Google Translate credentials valid.

## Pre-Release Steps
1. Run catalog seed sync from admin endpoint:
   - `POST /catalog/admin/sync`
2. Verify health:
   - `GET /catalog/health` returns `ready=true`, `documentCount > 0`.
3. Run shadow validation against production-like traffic:
   - `npm run catalog:shadow-validate`
4. Confirm acceptable overlap and status distribution:
   - Average overlap above agreed threshold (default `0.50`).
   - No significant spike in non-200 responses on `/catalog/searchFoods`.
5. Spot-check reviewer flow:
   - `POST /catalog/admin/localization/review` for at least one food per language.
   - Validate reindex effect with search queries before/after status update.

## Launch Steps
1. Keep `/searchFoods` unchanged and enabled.
2. Monitor for 60 minutes:
   - p95 latency for `/catalog/searchFoods`
   - error rate for `/catalog/*`
   - Redis command latency and memory pressure
3. Keep admin sync disabled unless needed post-launch:
   - Optional: `ENABLE_CATALOG_INGESTION=false` after initial sync/review window.

## Rollback (Immediate)
1. Switch mobile traffic back to `/searchFoods`.
2. Redeploy mobile app/config and validate `/searchFoods` remains healthy.

## Post-Launch Follow-Up
- Track top zero-result queries by language.
- Prioritize reviewer updates for high-volume low-overlap queries.
- Tune ranking thresholds (tier weights, typo distance) with observed telemetry.
