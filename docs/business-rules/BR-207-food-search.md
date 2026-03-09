# BR-207 – Business Rules: Food Search

## BR-207.1 – Authentication required
Every food search request must carry a valid Firebase ID token. The service
never calls FatSecret on behalf of unauthenticated users.

## BR-207.2 – FatSecret credentials never exposed
The FatSecret client ID and client secret are stored as environment variables
on the server and never included in any response to the client.

## BR-207.3 – maxResults cap
The client may request up to 50 results per query. Any `maxResults` value
above 50 is silently capped to 50 server-side to prevent excessive FatSecret
API usage.

## BR-207.4 – Rate limiting per IP
Each client IP is limited to 60 requests per 60-second window to protect
against abuse and FatSecret quota exhaustion.

## BR-207.5 – Token cache
The FatSecret OAuth2 access token is cached in memory and reused until it
expires (with a 60-second safety margin). A new token is fetched transparently
before the margin is reached.

## BR-207.6 – Transient retry policy
On transient upstream errors (network timeout, 5xx from FatSecret), the
service retries up to 2 times with exponential back-off (200 ms, 400 ms).
Non-transient errors (4xx) are not retried.

## BR-207.7 – VPS IP must be allowlisted
The VPS IP `<VPS_STATIC_IP>` must be allowlisted in the FatSecret developer
portal for the OAuth2 credentials in use. Without this, all FatSecret calls
will fail with a 403/401 error.
