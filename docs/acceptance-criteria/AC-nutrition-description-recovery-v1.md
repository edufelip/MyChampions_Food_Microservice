# AC-NUTRITION-RECOVERY-001 — Offline recovery acceptance criteria

| ID | Given | When | Then |
|---|---|---|---|
| AC-1 | A row is accepted by `mapFatSecretResponse` | Evaluate it | Result is `already_accepted`, method `existing`, and the provider client is not called |
| AC-2 | A Portuguese, Spanish, or English description has one explicit gram panel and unique total macro labels | Evaluate deterministic mode | Result is a deterministic suggestion with exact spans and fixed-point normalized values |
| AC-3 | Description has two serving headers, including mixed units | Evaluate it | Result is abstained/rejected with `multiple_panels` and no model call |
| AC-4 | Description contains a sign, range, fraction, exponent, grouped number, comparator, or malformed separator | Evaluate it | Result is `unsupported_number`; no numeric fragment is accepted |
| AC-5 | A model response selects an unknown, duplicate, distractor, or wrong-role span | Replay it | Result is `invalid_model_response` or abstention; no numeric value is invented |
| AC-6 | Replay responses are present | Evaluate replay mode | No network request occurs and the run is reproducible from the input/response files |
| AC-7 | A reviewer accepts a current suggestion | Run review/export | Decision is appended and export uses reviewed-proposal schema only |
| AC-8 | A later reviewer changes a decision | Omit or misstate `--supersedes` | Operation fails and prior history remains unchanged |
| AC-9 | Source text contains HTML/script syntax | Generate report | Text is escaped and no source text executes as HTML or script |
| AC-10 | Input is malformed, oversized, duplicated, or conflicting | Evaluate it | A classified invalid result is emitted without persisting disallowed raw content |

The held-out continuation gate remains pending because no frozen independent provider dataset is available.
