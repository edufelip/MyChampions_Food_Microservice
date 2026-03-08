# AC-207 – Acceptance Criteria: Food Search (SC-207)

## AC-207.1 – Successful search
**Given** an authenticated user searches for "chicken"  
**When** the request reaches the Food Microservice  
**Then** the response is HTTP 200 with `{ results: [...] }` containing at least one item

## AC-207.2 – Empty results
**Given** an authenticated user searches for an obscure term with no matches  
**When** the request reaches the Food Microservice  
**Then** the response is HTTP 200 with `{ results: [] }`

## AC-207.3 – Unauthenticated request
**Given** a request with a missing or invalid Firebase ID token  
**When** the request reaches the Food Microservice  
**Then** the response is HTTP 401 with `{ error: "unauthenticated" }`

## AC-207.4 – Invalid input
**Given** a request with a missing `query` or invalid `maxResults`  
**When** the request reaches validation  
**Then** the response is HTTP 400 with `{ error: "bad_request" }`

## AC-207.5 – Quota exceeded
**Given** the FatSecret API quota is exhausted  
**When** the request reaches the Food Microservice  
**Then** the response is HTTP 200 with `{ error: "quota_exceeded" }`

## AC-207.6 – Internal error
**Given** an unexpected upstream error occurs  
**When** the request reaches the Food Microservice  
**Then** the response is HTTP 500 with `{ error: "internal_error" }` and no secrets are leaked

## AC-207.7 – Rate limiting
**Given** a single IP sends more than 60 requests within 60 seconds  
**When** the 61st request arrives  
**Then** the response is HTTP 429 with `{ error: "too_many_requests" }`
