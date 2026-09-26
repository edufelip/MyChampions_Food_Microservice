# FR-NUTRITION-RECOVERY-001 — Offline nutrition description recovery

The food service shall provide an offline CLI that reads strict sanitized JSONL food rows, preserves source identity, and produces deterministic or replay-backed recovery proposals for descriptions rejected by the existing mapper.

The CLI shall support deterministic, replay, and explicitly budgeted live modes. Standard evaluation and report commands shall not call a network provider. Existing accepted rows shall result in `already_accepted` with zero TypeSafe calls.

The recovery result shall reference exact source spans and immutable source/suggestion hashes. Numeric parsing, units, serving-panel structure, bounds, and normalization shall remain deterministic. TypeSafe may select existing span IDs only.

The CLI shall write private run artifacts and support append-only review decisions. Review acceptance shall export a reviewed-proposal schema and shall not write to catalog storage.
