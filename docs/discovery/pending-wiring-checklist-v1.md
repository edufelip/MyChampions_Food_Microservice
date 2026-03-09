# Pending Wiring Checklist – v1

Tracks integration tasks that are defined but not yet fully wired end-to-end.

---

## Food Search / Nutrition Plan Builder (SC-207 / FR-243)

| # | Item | Status | Notes |
|---|------|--------|-------|
| W-001 | Firebase Cloud Function FatSecret proxy | ✅ Replaced | Superseded by VPS microservice (DR-005) |
| W-002 | VPS microservice deployed and reachable | ⬜ Pending deployment | Run `infra/scripts/deploy.sh` on `ssh digiocean` |
| W-003 | FatSecret IP `<VPS_STATIC_IP>` allowlisted | ⬜ Pending | Must be done in FatSecret developer portal |
| W-004 | TLS certificate issued for VPS domain | ⬜ Pending | Run Certbot: `certbot --nginx -d foodservice.eduwaldo.com` |
| W-005 | `EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL` updated | ⬜ Pending | Update `.env` / EAS secrets to point to VPS URL |
| W-006 | Mobile app rebuild after URL change | ⬜ Pending | `eas build --platform all` after env update |
| W-007 | End-to-end smoke test (real FatSecret call) | ⬜ Pending | Use curl commands in DEPLOYMENT.md |
| W-008 | Horizontal scale: shared token cache (Redis) | 🔄 Deferred | In-memory cache sufficient for single instance; add Redis if scaling |
| W-009 | Alerting / uptime monitoring for VPS endpoint | 🔄 Deferred | Add UptimeRobot or similar for `/health` |
| W-010 | Log aggregation (VPS → centralized log store) | 🔄 Deferred | Docker JSON logs; consider Loki/Grafana stack |

---

## Firebase Baseline (unchanged)

| # | Item | Status |
|---|------|--------|
| B-001 | Firebase Auth | ✅ Active |
| B-002 | Firestore (care plans, users) | ✅ Active |
| B-003 | Firebase Storage | ✅ Active |
| B-004 | Firebase Cloud Messaging | ✅ Active |
| B-005 | Firebase Cloud Functions (non-food) | ✅ Active |

---

## Legend
- ✅ Done / Active
- ⬜ Pending – actionable
- 🔄 Deferred – tracked, not blocking
