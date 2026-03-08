# Decisions Log – v1

This log records architectural and technical decisions made for the
MyChampions platform. Each entry follows the format:
DR-NNN | Date | Status | Decision | Rationale | Consequences.

---

## DR-001 – Firebase as primary backend platform
**Date:** 2024-Q1  
**Status:** Active  
**Decision:** Use Firebase (Firestore, Auth, Cloud Functions) as the baseline
backend platform for MyChampions.  
**Rationale:** Rapid prototyping, managed infrastructure, Expo/React Native SDK
alignment.  
**Consequences:** All backend services default to Firebase unless explicitly
marked as a deviation. Deviations must be logged here.

---

## DR-002 – Expo + React Native for mobile client
**Date:** 2024-Q1  
**Status:** Active  
**Decision:** Use Expo (managed workflow) with React Native for the mobile app.  
**Rationale:** Cross-platform iOS/Android from a single codebase; OTA updates
via EAS.

---

## DR-003 – FatSecret as food database provider
**Date:** 2024-Q2  
**Status:** Active  
**Decision:** Use FatSecret Platform API for food item data (search, macros).  
**Rationale:** Extensive food database, well-documented OAuth2 API, free tier
sufficient for initial usage.

---

## DR-004 – Firebase Cloud Function as FatSecret proxy (deprecated)
**Date:** 2024-Q3  
**Status:** Deprecated – superseded by DR-005  
**Decision:** Proxy FatSecret API calls through a Firebase Cloud Function to
keep the client secret server-side.  
**Rationale:** Prevent credential exposure; Firebase Functions provide managed
HTTPS endpoint.  
**Consequences (identified issue):** FatSecret enforces IP allowlisting.
Firebase Cloud Functions use dynamic egress IPs that cannot be reliably
allowlisted, causing HTTP 500 errors in production.

---

## DR-005 – VPS-hosted Node.js microservice as FatSecret proxy
**Date:** 2026-03  
**Status:** Active  
**Decision:** Replace the Firebase Cloud Function FatSecret proxy with a
production-grade Node.js + TypeScript microservice deployed on the VPS at
fixed IP `165.22.147.90` (`ssh digiocean`).

**Rationale:**
- The VPS has a fixed public IP that can be reliably allowlisted in
  FatSecret's IP restriction settings, resolving the HTTP 500 failures.
- The existing Firebase backend remains untouched for all other features.
- Docker + Nginx on the VPS provides the same security posture as Cloud
  Functions (TLS, no direct exposure of FatSecret credentials).

**Architecture:**
```
Mobile App → HTTPS → Nginx (VPS) → Docker container (Node.js)
                                         ↓
                                  Firebase Admin SDK (token verify)
                                         ↓
                                  FatSecret OAuth2 API
```

**Client contract preserved:** The mobile app only needs to update
`EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL` to point to the VPS endpoint.
Request/response shape is identical to the Firebase proxy contract.

**Rollback plan:** Update `EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL` back to the
Firebase Cloud Function URL and redeploy the app (or stop the VPS container
and update DNS). See `infra/scripts/rollback.sh`.

**Consequences:**
- Firebase remains the primary backend; this is a scoped deviation for food
  search only.
- VPS must be maintained (OS patches, Docker, Nginx).
- FatSecret IP allowlist must include `165.22.147.90`.
- Token cache lives in-process; horizontal scaling would require a shared
  cache (Redis) – deferred, tracked in pending-wiring.

**Related:** FR-243, SC-207, pending-wiring-checklist-v1.md

---

## DR-006 – HTTP 429 for quota exceeded (not 200 + error body)
**Date:** 2026-03  
**Status:** Active  
**Decision:** Return HTTP 429 (Too Many Requests) when the FatSecret quota is
exceeded, rather than HTTP 200 with `{ error: "quota_exceeded" }` in the body.

**Rationale:**
- HTTP 429 is semantically correct and tooling-friendly (rate-limit detection).
- The mobile client's non-2xx error path already fires for 429, which shows a
  generic error message – acceptable UX for a quota scenario.
- The response body still carries `{ error: "quota_exceeded" }` so the client
  can detect the specific reason if it evolves to handle it explicitly.
- Avoids the anti-pattern of sending error state in a 200 response.
