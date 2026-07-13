# SC-207 – Nutrition Plan Builder

## Overview

The Nutrition Plan Builder screen allows nutritionists and coaches to search
for food items and build a structured nutrition plan for an athlete.

**Screen ID:** SC-207  
**Version:** v2  
**Status:** Active – food search served by the root MyChampions server

---

## Screen Layout

1. **Search bar** – free-text food search
2. **Results list** – food items from FatSecret database
3. **Meal builder** – add items to breakfast / lunch / dinner / snacks
4. **Macro summary** – total kcal, protein, carbs, fat

---

## Data Source – Food Search

Food item search is served by the root **MyChampions Bun server**, which reads
the mirrored food catalog Postgres database. The Food Microservice remains the
catalog/FatSecret worker behind that server-owned boundary.

### Integration contract

| Property | Value |
|----------|-------|
| Source module | `features/nutrition/food-search-source.ts` |
| Endpoint env var | `EXPO_PUBLIC_MYCHAMPIONS_SERVER_URL` |
| Method | `POST /integrations/food/search` |
| Auth | `Authorization: Bearer <MyChampions access token>` |
| Request body | `{ query: string, maxResults: number, region: string, language: string }` |
| Success response | `{ results: FatSecretFoodItem[] }` |
| Empty results | `{ results: [] }` – valid, show "No results found" |
| Auth error | HTTP 401 – trigger re-auth flow |
| Quota error | HTTP 200 + `{ error: "quota_exceeded" }` |
| Other errors | Non-2xx – show generic error toast |

### Deployment path

```
Mobile App → HTTPS → MyChampions Bun server → local catalog Postgres
```

The catalog worker's VPS fixed IP (`<VPS_STATIC_IP>`) is allowlisted in
FatSecret for catalog refreshes and live provider operations.

---

## Functional Requirements

- **FR-243:** Food search integration (VPS microservice)
- **AC-207:** Acceptance criteria for food search
- **BR-207:** Business rules for nutrition plan construction
- **TC-207:** Test cases for SC-207

---

## Open Questions

- Q1: Should the results list support infinite scroll / pagination?
  *Currently: single page, maxResults capped at 50 server-side.*
- Q2: Should barcode scanning be added (Phase 2)?

---

## Change History

| Date | Change |
|------|--------|
| 2026-07 | Mobile integration moved to the root MyChampions server; catalog worker remains provider-facing. Quota behavior stays client-compatible as HTTP 200 + `{ error: "quota_exceeded" }`. |
