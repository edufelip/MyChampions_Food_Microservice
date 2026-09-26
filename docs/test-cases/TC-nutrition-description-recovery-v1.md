# TC-NUTRITION-RECOVERY-001 — Offline recovery test cases

Automated coverage must include accepted structured servings; EN/PT/ES labels; decimal comma; zero macros; zero mass; missing macros; total versus saturated/trans fat; carbohydrate versus sugar; calories and percentages; package weight; multiple panels; non-gram serving units; signed/range/fraction/scientific/grouped/malformed numbers; UTF-16 offsets; too many candidates; malformed JSONL; duplicate IDs; replay with no network; missing key; unknown model/choice IDs; malformed confidence/probabilities; 401; 429 retry; timeout; budget reservation; cache invalidation; stale review hash; accept/reject supersession chains; concurrent writers; HTML/script injection; and no catalog writes.

Focused commands from the service root:

```sh
npm run recovery:typecheck
npx jest --runInBand src/__tests__/unit/nutrition-recovery src/__tests__/integration/nutrition-recovery-cli.test.ts
npm run recovery:evaluate -- --input testdata/nutrition-recovery/development.jsonl --mode deterministic --output /tmp/nutrition-recovery-run-001
npm run recovery:report -- --run /tmp/nutrition-recovery-run-001
```

The 12 synthetic experiment examples are regression fixtures, not a held-out evaluation set.
