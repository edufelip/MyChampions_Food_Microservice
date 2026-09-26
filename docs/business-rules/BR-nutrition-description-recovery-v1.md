# BR-NUTRITION-RECOVERY-001 — Review-only recovery rules

1. Existing mapper acceptance is authoritative for eligibility. Accepted rows are never overwritten by recovery.
2. Exactly one serving header is required. Any second serving header, including one using a non-gram unit, is ambiguous.
3. Only explicit gram units are eligible. Cups, ml, oz, kg, percentages, calories, sugars, and saturated/trans fat cannot substitute for required fields.
4. Numeric expressions that could lose meaning are rejected as a whole. No positive substring is extracted from signs, ranges, fractions, exponents, grouped thousands, malformed separators, or comparators.
5. Macro values are fixed-point hundredths of grams. Mass must be positive and within 10,000 g; macro values must be within mass and the aggregate bound.
6. A proposal is complete only when all four fields reference distinct admissible spans and pass deterministic validation.
7. TypeSafe responses are advisory selections. Unknown IDs, malformed probability maps, role mismatches, low measured confidence, or `none` produce abstention/failure.
8. A review decision is hash-bound and append-only. Supersession must name the current latest decision. No proposal is automatically imported.
