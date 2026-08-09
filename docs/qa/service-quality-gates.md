# Food service quality gates

The Food service validates bearer sessions through the root MyChampions server
and preserves the documented `POST /searchFoods` response contract. It owns
FatSecret credentials and catalog storage; neither is exposed to mobile
consumers.

Required gates:

- `npm run lint`
- `npm run build`
- `npm run test:integration`
- `npm run test:contract`

All workflow jobs check out and verify the same exact PR head; the impact job
still uses the base/head SHAs only for scope classification. The contract suite
drives the real auth middleware, unified-search service, and HTTP controller
through catalog/provider boundary doubles. It locks missing,
invalid, and unavailable authentication, a complete populated response
envelope (including the mobile `results` array), health metadata, normalized
provider arguments, and secret isolation. No FatSecret, Redis, Postgres, or
production writes occur in the contract lane. The integration test job may run
the full suite or the changed-test subset selected by `impact`; the contract
job always runs separately after lint.
