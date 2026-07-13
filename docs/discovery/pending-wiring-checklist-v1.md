# Pending Wiring Checklist – Current Food Service Architecture

## Food Catalog and Root Server

| # | Item | Status | Notes |
|---|------|--------|-------|
| W-001 | Root Bun server mobile food search | ✅ Complete locally | Mobile uses `POST /integrations/food/search` with a root-server bearer session. |
| W-002 | Local Docker catalog Postgres and Redis | ✅ Complete locally | Parent workspace supplies isolated Postgres and food Redis. |
| W-003 | Root-session validation for protected food routes | ✅ Complete locally | Food service validates bearer sessions through root `GET /me`. |
| W-004 | VM root-server internal URL | ⬜ Pending deployment | Set `MYCHAMPIONS_AUTH_SERVER_URL` only when the VM deployment is approved. |
| W-005 | Production catalog worker deployment | ⬜ Pending approval | Verify root auth reachability, catalog health, and FatSecret allowlist after deploy approval. |
| W-006 | FatSecret provider-live smoke | ⬜ Pending approval | Requires provider credentials and may consume quota. |
| W-007 | Horizontal scale and monitoring | 🔄 Deferred | Redis/cache and uptime strategy are operational work after production deployment. |

## Legend

- ✅ Complete locally
- ⬜ Pending deployment or approval
- 🔄 Deferred operational work
