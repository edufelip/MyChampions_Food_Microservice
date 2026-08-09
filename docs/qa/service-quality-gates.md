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

The contract suite locks unauthenticated `401` behavior, the `{ results: [] }`
consumer shape, health metadata, and secret isolation. Tests use provider and
auth doubles only; no FatSecret, Redis, Postgres, or production writes occur.
