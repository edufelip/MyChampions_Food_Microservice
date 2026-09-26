# Nutrition description recovery v1

## Scope and boundary

This document defines the offline, review-only recovery tool delivered for ET-228. An operator supplies a local JSONL file containing approved and sanitized food rows. The tool preserves the source, identifies rows already accepted by the existing FatSecret mapper, applies deterministic locale-aware extraction to rejected descriptions, and may ask pinned TypeSafe model `jev-1.13.0` to select existing numeric spans for unresolved but structurally eligible rows.

The output is a static report and append-only, hash-bound review log. An accepted review is a reviewed proposal and is never a catalog import. The tool has no HTTP route, app UI, database or Redis integration, worker, cron, provider-ingestion hook, or call to `upsertFoods`/`appendToIndexes`.

The existing `mapFatSecretResponse` behavior remains the eligibility boundary. Rows it accepts are reported as `already_accepted` and never reinterpreted. Rejected raw provider rows are not available after the mapper/search path, so runtime raw-row capture is a separate pending task.

## Input and output contracts

Input records use `nutrition-recovery-input.v1` with `sourceId`, one of `en-US`, `pt-BR`, or `es-ES`, and a food object containing only `food_id`, `food_name`, `food_description`, and an allowlisted gram-serving envelope. Source IDs are unique within a run. Descriptions are 1–4096 UTF-16 code units; food names are 1–256; files are limited to 10 MB and 1,000 rows.

Results use `nutrition-recovery-result.v1`. `Span` offsets are UTF-16 offsets into the original description. A suggestion contains four span IDs and exact normalized values. The result stores source and suggestion SHA-256 hashes, prompt/policy versions, method, status, reason, and optional measured confidence/usage. Provider error text and credentials are never written to a result.

Statuses are `already_accepted`, `invalid_input`, `rejected`, `abstained`, `service_failure`, and `suggested`. Reasons are a closed union: `valid_existing_mapping`, `invalid_schema`, `duplicate_conflict`, `unsupported_number`, `missing_mass`, `multiple_panels`, `missing_macro`, `invalid_unit`, `invalid_bounds`, `too_many_candidates`, `no_selection`, `low_confidence`, `invalid_model_response`, `provider_unavailable`, `unauthorized`, `budget_exhausted`, and `complete_proposal`. A live run stops further provider transport after the first authorization failure and preserves `unauthorized` on rows that require TypeSafe thereafter.

## Recovery state machine

1. Strictly sanitize and hash the input. Malformed lines receive a redacted invalid result with no raw content.
2. Run the existing mapper. A successful map stops the state machine with `already_accepted` and zero provider calls.
3. Detect exactly one serving header in the declared locale. A second serving header, including a different unit, is `multiple_panels`; cups/ml/oz/kg without a gram serving are `missing_mass`.
4. Scan maximal numeric tokens. Signed values, ranges, fractions, scientific notation, grouped/ambiguous separators, malformed repeated separators, and comparators are unsupported. Candidate substrings are never salvaged from a rejected expression.
5. Require explicit gram units and recognize total carbohydrate, protein, and total fat labels in the declared locale. Saturated/trans fat, sugars, calories, and percentages are distractors. Deterministic extraction requires one admissible candidate per macro.
6. Validate mass and macros with integer hundredths-of-grams arithmetic. Mass is 0–10,000 g; each macro is non-negative and no larger than the mass; macro sum is bounded by mass plus `max(0.5 g, 1%)`. Values are rejected rather than clamped.
7. For unresolved fields, one TypeSafe request contains independent Choice questions for `grams`, `carbohydrate`, `protein`, and `fat`, plus `none`. The model may copy only existing span IDs. A `none`, low measured minimum confidence, malformed response, unknown ID, duplicate selection, wrong semantic role, or failed deterministic check abstains/fails.
8. Normalize to 100 g with fixed-point rational arithmetic and round half-up to two decimals only at output. No floating-point parsing or model-generated numeric value is accepted.

## Execution modes and privacy

`recovery:evaluate` defaults to replay and requires a matching response file. `deterministic` never calls a provider. `live` requires `--allow-provider-calls`, `TYPESAFE_API_KEY`, explicit request and input-token budgets, and a readable input file. The default live timeout is three seconds, concurrency is serialized by the CLI, and the adapter retries at most once for 429/5xx/transport failures. Retry requests consume budget. A 401/403 stops without retry. Estimated input tokens are byte-based and labeled estimates; they are not a hard money cap.

Run directories are private and contain sanitized inputs, results, decisions, summary, and a self-contained escaped HTML report. Files are written by temporary file plus rename. Report filters are local and keyboard-usable. Source descriptions are rendered as text, including script-like text.

## Review and export

Review is a CLI action bound to the current source and suggestion hashes. Repeated identical decisions are idempotent. Changing a decision requires `--supersedes` pointing at the current latest decision; history is never erased. Accepted exports use `nutrition-recovery-reviewed-proposal.v1` and carry source/provenance, selected spans, normalized nutrition, and reviewer details. No export function imports data into any catalog repository.

## Evidence limits and deferred wiring

The original 12 exploratory examples are development fixtures only. No independent held-out provider dataset is available in this delivery, so the proposed activation gate is pending and no production/provider result is claimed. Mobile localization is unaffected because the report is an operator artifact, not app copy. Runtime provider-boundary capture and any future catalog-import workflow remain explicitly out of scope.
