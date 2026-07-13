# Decisions Log – Current Food Service Architecture

## DR-001 – Root MyChampions Server Owns App Auth and Data

**Date:** 2026-07
**Status:** Active

The root Bun/Elysia server owns mobile bearer sessions, app-domain persistence,
and app-facing catalog search. Mobile clients use the root server rather than
calling the food service directly.

## DR-002 – Food Service Is a Catalog and Provider Worker

**Date:** 2026-07
**Status:** Active

The Node.js food service owns catalog ingestion, Redis cache recovery, and
FatSecret provider operations. The root server reads the mirrored catalog
Postgres database for mobile food search.

## DR-003 – Protected Food Routes Validate Root Sessions

**Date:** 2026-07
**Status:** Active

Protected food and catalog routes forward the received bearer session to the
root server's authenticated `GET /me` boundary. A valid `profile.authUid`
becomes the controller UID. Root authorization rejection maps to HTTP 401;
root transport, server, or malformed-response failures map to HTTP 503.

## DR-004 – Preserve the Catalog Admin Key

**Date:** 2026-07
**Status:** Active

Catalog ingestion and localization administration retain their independent
`x-catalog-admin-key` authorization layer after user-session validation.

## DR-005 – Preserve Client-Compatible Quota Behavior

**Date:** 2026-03  
**Status:** Active

The service returns HTTP 200 with `{ error: "quota_exceeded" }` when the
FatSecret quota is exhausted. Internal rate limiting remains HTTP 429 with
`too_many_requests`.
