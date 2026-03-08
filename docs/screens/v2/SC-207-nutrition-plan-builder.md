# SC-207 – Nutrition Plan Builder

## Overview

The Nutrition Plan Builder screen allows nutritionists and coaches to search
for food items and build a structured nutrition plan for an athlete.

**Screen ID:** SC-207  
**Version:** v2  
**Status:** Active – food search now served by VPS microservice (DR-005)

---

## Screen Layout

1. **Search bar** – free-text food search
2. **Results list** – food items from FatSecret database
3. **Meal builder** – add items to breakfast / lunch / dinner / snacks
4. **Macro summary** – total kcal, protein, carbs, fat

---

## Data Source – Food Search

Food item search is powered by the FatSecret API, accessed through the
**MyChampions Food Microservice** (VPS-hosted, not Firebase Cloud Function).

### Integration contract

| Property | Value |
|----------|-------|
| Source module | `features/nutrition/food-search-source.ts` |
| Endpoint env var | `EXPO_PUBLIC_FOOD_SEARCH_FUNCTION_URL` |
| Method | `POST /searchFoods` |
| Auth | `Authorization: Bearer <Firebase ID token>` |
| Request body | `{ query: string, maxResults: number }` |
| Success response | `{ results: FatSecretFoodItem[] }` |
| Empty results | `{ results: [] }` – valid, show "No results found" |
| Auth error | HTTP 401 – trigger re-auth flow |
| Quota error | HTTP 429 – show "Too many requests, try again later" |
| Other errors | Non-2xx – show generic error toast |

### Deployment path

```
Mobile App → HTTPS → food.mychampions.app (Nginx on VPS)
                          → Docker container → FatSecret API
```

The VPS fixed IP (`165.22.147.90`) is allowlisted in FatSecret to resolve the
dynamic-IP blocking that affected the Firebase Cloud Function proxy.

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
| 2026-03 | Updated integration source from Firebase proxy to VPS microservice (DR-005). Quota error HTTP code changed from implied 200+error to 429. |
