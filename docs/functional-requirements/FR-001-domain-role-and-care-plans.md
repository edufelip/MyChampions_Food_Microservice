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

> **Status:** Active – implemented through the root MyChampions Bun server and local catalog Postgres

The mobile food search is performed by the root MyChampions server against the
local mirrored catalog Postgres database. The food microservice remains the
catalog/FatSecret worker. The root server:

1. Validates the MyChampions bearer session.
2. Searches the mirrored catalog database.
3. Returns normalized food results to the mobile client.

**Client contract (unchanged):**

| Field | Value |
|-------|-------|
| Method | `POST` |
| URL | `EXPO_PUBLIC_MYCHAMPIONS_SERVER_URL/integrations/food/search` |
| Headers | `Content-Type: application/json`, `Authorization: Bearer <MyChampions access token>` |
| Body | `{ query: string, maxResults: number, region: string, language: string }` |
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
