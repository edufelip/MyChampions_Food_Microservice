# FR-001 – Domain, Role and Care Plans

## Overview

FR-001 defines the domain model, user roles, and care-plan management rules
for the MyChampions platform.

---

## Functional Requirements

### FR-001.1 – Role hierarchy
Athletes, coaches, and nutritionists operate under a role-based permission
model. Each role has scoped access to care-plan features.

### FR-001.2 – Care plan lifecycle
Care plans progress through `draft → active → completed` states. Only the
assigned coach or nutritionist may advance state.

### FR-001.3 – Nutrition planning
A care plan may include a nutrition plan. The nutrition plan references food
items sourced from the FatSecret database via the Food Microservice
(see FR-243 and SC-207).

---

## FR-243 – Food Search Integration (VPS Proxy)

> **Status:** Active – implemented via VPS-hosted microservice  
> **Replaces:** Firebase Cloud Function proxy (deprecated due to IP restriction)

The FatSecret food search is performed by a dedicated Node.js microservice
deployed on the VPS at `<VPS_STATIC_IP>`. The microservice:

1. Validates Firebase ID tokens issued by the app's Firebase project.
2. Calls the FatSecret `foods.search` API using OAuth2 client credentials.
3. Returns `{ results: FatSecretFoodItem[] }` to the mobile client.

**Client contract (unchanged):**

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL` (now points to VPS) |
| Headers | `Content-Type: application/json`, `Authorization: Bearer <Firebase ID token>` |
| Body | `{ query: string, maxResults: number }` |
| Success | HTTP 200, `{ results: [...] }` |
| Auth failure | HTTP 401 |
| Quota | HTTP 200, `{ error: "quota_exceeded" }` |
| Other errors | HTTP 4xx/5xx |

**Endpoint:** `POST /searchFoods`  
**Health check:** `GET /health`

**Related artifacts:**
- AC-207, BR-207, TC-207 (see respective docs)
- docs/discovery/decisions-log-v1.md (decision DR-005)
- docs/discovery/pending-wiring-checklist-v1.md

---

## References

- SC-207: Nutrition Plan Builder screen spec
- FR-243: Food search integration (this section)
