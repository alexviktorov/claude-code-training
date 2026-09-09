# Northwind Payments — Merchant Console

The internal tool support and ops staff use to look up a payment, refund it, work the dispute queue, and issue virtual cards.

Northwind Payments is fictional. Every merchant, cardholder, amount, and card in this app is generated.

## Run it

```bash
npm install
npm run dev
```

No database, no seed step, no Docker.

Other scripts: `npm run build` (production build), `npm run lint` (`next lint`), `npm run test:watch` (Vitest watch mode). Run a single test file with `npx vitest run src/lib/money.test.ts`, or filter by name with `npx vitest run -t "<pattern>"`. `@/*` resolves to `src/*` (`tsconfig.json`) — every import uses it instead of a relative path.

## Data lives in memory

There is no JSON file. `src/data/generate.ts` builds every payment, refund, dispute, and payout once at boot with a seeded PRNG (`mulberry32`), anchored to the fixed date `GENERATED_AT` (2026-08-13) instead of `Date.now()` — that's what makes "the last 30 days" identical on every machine and stable as real time passes. Merchants are a hardcoded array in `src/data/merchants.ts`. `src/data/store.ts` holds the result on `globalThis` so Next's dev-server module reloading doesn't hand each request a freshly-reseeded copy. Route handlers and server components both read and write that same store.

- Writes last for the life of the dev server and vanish on restart. That is expected.
- Persistence is tracked separately as NWP-203. **Do not add a database, an ORM, or migrations.**
- If you need more seed data, extend `generate.ts` (volume and shape) or `merchants.ts` (the merchant list). Never edit either to make a failing case disappear.

## Where the rest of the context lives

This file loads every session, so it stays short. Detail that only matters once you open a particular kind of file lives in `.claude/rules/` and loads when you do:

| Rule | Applies to |
| --- | --- |
| `money.md` | `src/lib/`, `src/app/api/`, `src/data/` |
| `api-routes.md` | `src/app/api/` |
| `cards.md` | anything card-related |
| `components.md` | `src/components/`, `src/app/` |

## Conventions

These four explain most of the code, and breaking them is how bugs get in here.

1. **Money is integer minor units.** `$250.00` is `25000`. No floats, no strings with currency symbols. Format once, at the edge, next to its currency code.
2. **Storage and bucketing are UTC.** Display converts to the merchant's timezone. Nothing else does.
3. **One query builder.** Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug, not a shortcut.
4. **Validate on the server.** Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store.

Pages don't call their own API. `src/app/payments/page.tsx` and the dashboard under `src/app/overview/` import `src/data/queries.ts` / `analytics.ts` / `metrics.ts` directly as server components. `GET /api/payments` and `GET /api/payments/export` are real HTTP endpoints for the two cases that need one: a JSON API surface, and a browser-downloadable CSV link. All three paths funnel through the same `parseFilters → filterPayments → sortPayments → paginate` pipeline in `queries.ts` — that pipeline is "the one query builder" rule 3 refers to.

## Card rules

- Generated numbers use the `4242` test BIN and a valid Luhn check digit. Nothing here may resemble a real PAN.
- The full number is returned exactly once, in the creation response. After that, last four only.
- Status is a state machine: `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal.

## Layout

| Path | What lives there |
| --- | --- |
| `src/app/` | Console routes: overview, payments, disputes, payouts. Cards is NWP-201 and does not exist yet |
| `src/app/api/` | Route handlers |
| `src/data/` | Deterministic generator, the in-memory store, query builder, and types |
| `src/components/` | Tremor-based primitives and the console's own components |
| `src/lib/` | Money, date, and CSV helpers, each with a `.test.ts` beside it. Read these before touching an amount |

## Before you push

Run `npm test`, then `/ship-ready`. The skill checks the rules above, not just formatting.
