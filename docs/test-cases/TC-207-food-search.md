# TC-207 – Test Cases: Food Search

## TC-207.1 – Happy path: search returns results
**Type:** Integration  
**Input:** `POST /searchFoods` with valid auth and `{ query: "chicken", maxResults: 10 }`  
**Expected:** HTTP 200, `{ results: [...] }` with ≥1 item

## TC-207.2 – Happy path: empty results
**Type:** Integration  
**Input:** `POST /searchFoods` with valid auth and query that returns no matches  
**Expected:** HTTP 200, `{ results: [] }`

## TC-207.3 – Missing Authorization header
**Type:** Unit  
**Input:** `POST /searchFoods` with no Authorization header  
**Expected:** HTTP 401, `{ error: "unauthenticated" }`

## TC-207.4 – Invalid Firebase token
**Type:** Unit  
**Input:** `POST /searchFoods` with `Authorization: Bearer invalid-token`  
**Expected:** HTTP 401, `{ error: "unauthenticated" }`

## TC-207.5 – Missing query field
**Type:** Unit  
**Input:** `POST /searchFoods` with valid auth and `{ maxResults: 10 }` (no query)  
**Expected:** HTTP 400, `{ error: "bad_request" }`

## TC-207.6 – Invalid maxResults
**Type:** Unit  
**Input:** `POST /searchFoods` with valid auth and `{ query: "chicken", maxResults: -1 }`  
**Expected:** HTTP 400, `{ error: "bad_request" }`

## TC-207.7 – maxResults capped at 50
**Type:** Unit  
**Input:** `POST /searchFoods` with valid auth and `{ query: "chicken", maxResults: 999 }`  
**Expected:** HTTP 200 (server internally caps to 50), no error

## TC-207.8 – FatSecret quota exceeded
**Type:** Integration (mocked)  
**Input:** FatSecret returns error code 22 (quota exceeded)  
**Expected:** HTTP 200, `{ error: "quota_exceeded" }`

## TC-207.9 – Upstream network failure
**Type:** Integration (mocked)  
**Input:** FatSecret network call times out  
**Expected:** HTTP 500, `{ error: "internal_error" }`, no secrets in body

## TC-207.10 – Health endpoint
**Type:** Integration  
**Input:** `GET /health`  
**Expected:** HTTP 200, `{ status: "ok" }`

## TC-207.11 – Rate limit enforcement
**Type:** Integration  
**Input:** >60 requests from same IP within 60 seconds  
**Expected:** HTTP 429 on requests exceeding the limit

## TC-207.12 – Contract compatibility
**Type:** Contract  
**Input:** Full request cycle as modelled by `food-search-source.ts`  
**Expected:** Response shape matches `{ results: FatSecretFoodItem[] }` on 200

---

## Manual Verification Commands

```bash
BASE_URL="https://foodservice.eduwaldo.com"  # Replace with actual VPS URL
TOKEN="<Firebase-ID-token>"              # Replace with valid token

# TC-207.1 – Happy path
curl -s -X POST "$BASE_URL/searchFoods" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"query":"chicken","maxResults":5}' | jq .

# TC-207.3 – Missing auth
curl -s -X POST "$BASE_URL/searchFoods" \
  -H "Content-Type: application/json" \
  -d '{"query":"chicken","maxResults":5}' | jq .

# TC-207.5 – Missing query
curl -s -X POST "$BASE_URL/searchFoods" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"maxResults":5}' | jq .

# TC-207.10 – Health check
curl -s "$BASE_URL/health" | jq .
```
