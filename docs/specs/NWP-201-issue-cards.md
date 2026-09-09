# SPEC · NWP-201 — Issue virtual cards from the console

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-201-issue-cards.md`

**Ticket:** [NWP-201](../tickets/NWP-201.md)
**Author:** Alexander Viktorov
**Status:** reviewed

## Problem

Ops issues virtual cards by messaging the platform team, who create them by hand. It takes hours, it happens twelve to twenty times a week, and last month two cards were created with the wrong spend limit because the request lived in a Slack thread. Marcus wants ops to issue a card from the console, see the cards they have issued, and open one to check it — with a limit from the moment the card exists.

## Current state

Nothing card-shaped exists. `merchant-console/CLAUDE.md`'s layout table says "Cards is NWP-201 and does not exist yet", and the code agrees.

- `src/data/types.ts` — `Payment`, `Refund`, `Dispute`, `Payout`, `Merchant`; no `Card`. `Currency` (line 1) is exactly `USD | EUR | GBP` — the ticket's allowlist exists as a type but not as a runtime constant.
- `src/data/store.ts:16-22` — `Store` on `globalThis` holds merchants, payments, refunds, disputes, payouts. No `cards` slot. Writes live until restart, by design (NWP-203).
- `src/data/generate.ts:69` — `generate()` seeds everything at boot from a module-level `mulberry32(SEED)` consumed sequentially; ids via `pad` (line 55) as `pay_000001`; anchored to `GENERATED_AT` (line 58). Drawing from the PRNG before the existing loops would shift every payment, so any seeded cards must be generated last.
- `src/data/merchants.ts` — ten merchants, each with a `currency` (USD ×6, GBP ×2, EUR ×2) and an IANA `timezone`. Nothing in the console checks a card's currency against its merchant's. The ticket does not ask; the data model does.
- `src/app/api/` — every handler is `GET` (`payments/route.ts`, `payments/export/route.ts`). `POST /api/cards` is the console's first write endpoint; there is no write-path precedent on `main`. NWP-101's export route answers 400 with `{ message }`; this ticket mirrors it.
- `src/lib/money.ts` — `formatMoney` (15), `sumMinorUnits` (41), `parseAmountToMinorUnits` (46, "boundary only"). Every money helper this ticket needs already exists.
- `src/lib/dates.ts` — `utcDayKey` (7), `formatInZone` (22, merchant timezone, detail pages), `formatDate` (31, UTC, tables).
- `src/components/` — `Button` (primary/secondary/light/ghost/destructive), `Input` (`hasError`), `Select` (Radix), `Badge`, `Table*`, `Divider`, `Drawer`. **`Dialog.tsx` is not on `main`.** `.claude/rules/components.md` lists it, but it arrived with NWP-101 (branch `NWP-101-export-options`, PR #157, unmerged) together with `dialogOverlayShow`/`dialogContentShow` keyframes in `tailwind.config.ts`. `@radix-ui/react-dialog` is already in `package.json:15`.
- `src/components/ui/payments/StatusBadge.tsx` — one badge keyed over payment, dispute and payout statuses through three `Record`s; card statuses extend it without collisions.
- Patterns to match: detail page `src/app/payments/[id]/page.tsx` (awaited `params`, `paymentById` → `notFound()`, `<dl>` grid, timeline sorted by `at`); written empty row `src/app/payments/page.tsx:93-100`; client interaction `src/app/payments/filter-bar.tsx` (`"use client"`, `useRouter`, Radix `Select`).
- Accessible names are a new pattern here: no file under `src/app` or `src/components/ui` uses `htmlFor` today.
- Navigation is three lists that must agree: `baseLinks` in `src/app/siteConfig.ts`; `navigation` in `src/components/ui/navigation/AppSidebar.tsx:27-50` (lucide icons); `LABELS` in `src/components/ui/navigation/Breadcrumbs.tsx:7-12`.
- `vitest.config.ts` — `include: ["src/**/*.test.ts"]`, Node environment (v22). `src/data/` has no tests yet but is covered by the glob.
- Pre-existing defects, found in the NWP-101 pre-ship pass and described in [NWP-102](../tickets/NWP-102.md):
  - `src/data/queries.ts:80` — `sortPayments` compares amounts as strings (`String(a.amount).localeCompare(...)`); 999 sorts after 1000.
  - `src/data/metrics.ts:25` — `dailyVolume` keys by `toLocaleDateString("en-CA")` (server-local) while its buckets come from `lastUtcDays` (UTC). On a non-UTC server payments land on the wrong day, or at the window's edge are dropped by `if (!bucket) continue`.
  - `src/data/metrics.ts:31-43` — accumulates `amount / 100` as floats and rounds back. Violates ORG-STANDARDS #1–2 even where the total happens to come out right.
  - `src/data/metrics.ts:53-55` — headline "Gross volume" is captured + refunded. Whether that is the intended definition is a product question; not changed here.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Money is integer minor units. `$250.00` is `25000`. No floats, no strings with currency symbols. Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` conv. 1; ORG-STANDARDS #1–2 | A limit stored as `250.00` compares wrong against spend and drifts on display |
| "Every generated number starts `4242` and carries a valid Luhn check digit. Nothing here may resemble a real PAN, ever, including in tests and fixtures." | `.claude/rules/cards.md` | Anything else in this repository could be mistaken for real card data |
| "Generate on the server. A card number produced in the browser is a bug." | `.claude/rules/cards.md` | Client generation cannot be trusted and does not count |
| "The full number appears in the creation response and nowhere else: not on the card record, not in a list or detail payload, not left in client state after the success screen closes." | `.claude/rules/cards.md`; ORG-STANDARDS #8 | A stored PAN is the one thing this feature must never do |
| "Status is a state machine. `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal. Guard the transition on the server, not only in the UI." | `.claude/rules/cards.md`; ticket rule 3 | A cancelled card that comes back is a live card nobody meant to exist |
| "Reject a missing merchant, a zero or negative limit, a limit above 5,000,000 minor units, and any currency outside `USD`, `EUR`, `GBP`. The client is not trusted." | Ticket criterion 6; ORG-STANDARDS #7 | The wrong-limit incident that motivated the ticket, again |
| "Storage and bucketing are UTC. Display converts to the merchant's timezone." | `merchant-console/CLAUDE.md` conv. 2; ORG-STANDARDS #4–5 | Created dates shift by machine |
| "Dialogs and forms must be operable. Every input has a label, the dialog has an accessible name, focus moves into it and returns on close, Escape closes it." | `.claude/rules/components.md` | Ties break on keyboard and screen-reader behaviour |
| "Match the neighborhood." "No debris." | ORG-STANDARDS #9–10 | Reviewer findings by item number |

## Approach

Server first. `src/lib/cards.ts` is pure and client-safe: Luhn, a number generator with the random source injected (deterministic tests, reproducible seeds), the mask, the transition table, the near-limit check in integer arithmetic, and request validation — tested beside the file. `src/data/cards.ts` owns the store operations: mint with a CSPRNG, idempotency on a client-supplied request id, guarded transitions that append an audit event. The card record never contains the number — it exists only in `issueCard`'s return value, so no route has to remember to strip it. Routes are thin: validate, call, map failures to 400/404/409 with `{ message }`. Pages read the store directly, as every page here does; the JSON endpoints exist for the API surface and for curl-verifiable masking. The issue dialog reuses NWP-101's `Dialog`; its success step is the one place the number renders, and closing the dialog resets state. The store boots with five seeded cards so the list, the detail page, spend progress, and the terminal state are all visible before anyone issues one.

**Considered and rejected:**
- *Deriving `spent` from `store.payments`.* Payments are the merchants' incoming charges; an issued card is the merchant's outgoing spend. Linking them would invent a number. Seeded cards carry seeded spend, stated as seed data; new cards start at 0 and stay there because no spend source exists in this console.
- *A `/cards/new` page instead of a dialog.* Fewer accessibility surfaces, but a second navigation step for a twenty-times-a-week action, and inconsistent with the Export dialog next door.
- *Posting the typed `"250.00"` to the server.* `parseAmountToMinorUnits` is "boundary only", and the form is that boundary. The API speaks minor-unit integers like every other amount here, and the server re-validates the integer range regardless.
- *Hashing the number for the reference.* Needs `node:crypto` in a module client components import. An opaque reference minted alongside the number satisfies "last four and a reference" with no PAN-derived data anywhere.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/data/types.ts` | change | `Card`, `CardStatus`, `CardEvent`, `CardCategory` |
| `src/lib/cards.ts` | add | Luhn, generator, mask, transitions, near-limit, validation, request id — pure |
| `src/lib/cards.test.ts` | add | Tests beside the helpers |
| `src/data/cards.ts` | add | `listCards`, `cardById`, `issueCard`, `transitionCard`, `publicCard` |
| `src/data/cards.test.ts` | add | No number on the record, idempotent replay, guarded transitions, audit events |
| `src/data/store.ts` | change | `cards: Card[]` |
| `src/data/generate.ts` | change | Five deterministic seeded cards, generated last |
| `src/app/api/cards/route.ts` | add | `GET` list, `POST` issue |
| `src/app/api/cards/[id]/route.ts` | add | `GET` detail, `PATCH` status; `params` awaited |
| `src/components/Dialog.tsx` | add | Copied from `NWP-101-export-options`, unchanged |
| `tailwind.config.ts` | change | The two dialog keyframes and animations from the same branch |
| `src/components/ui/payments/StatusBadge.tsx` | change | `active`, `frozen`, `cancelled` |
| `src/app/siteConfig.ts`, `…/AppSidebar.tsx`, `…/Breadcrumbs.tsx` | change | `/cards` in nav, sidebar, breadcrumb |
| `src/app/cards/page.tsx` | add | List with written empty state |
| `src/app/cards/issue-card-dialog.tsx` | add | Form step → reveal-once step → replayed step |
| `src/app/cards/card-actions.tsx` | add | Freeze / unfreeze / cancel-with-confirm, no reload |
| `src/app/cards/[id]/page.tsx` | add | Detail, spend progress, audit timeline |
| `src/app/cards/[id]/not-found.tsx` | add | Written 404 |
| `src/data/queries.ts` | change | Numeric amount sort |
| `src/data/queries.test.ts` | add | Fails on the string sort |
| `src/data/metrics.ts` | change | `utcDayKey` bucketing; integer accumulation; injectable payments |
| `src/data/metrics.test.ts` | add | Fails on local-date bucketing under `TZ=Europe/Berlin` |

## Plan

1. **Types and pure helpers** — done when `npx vitest run src/lib/cards.test.ts` is green: check digit on known vectors; every generated number is 16 digits, starts `4242`, passes Luhn, and is deterministic for a fixed random source; the mask; every legal and illegal transition; near-limit at exactly 80%; each rejection the ticket names plus a currency that does not match the merchant.
2. **Store operations and seed** — done when `src/data/cards.test.ts` is green: the record carries `last4` and `numberRef` and no number-shaped field; a replayed request id returns the same card and no number and the collection does not grow; `cancelled → active` is refused; every transition appends an event. The dev server boots with five cards.
3. **Routes** — done when curl shows: `POST` 201 with `number` exactly once; the same body again → 200, `replayed`, no `number`; each rejection → 400 with a message; `GET` list and detail carry no `number`; `PATCH` cancelled → active → 409.
4. **Navigation, list, empty state, Dialog** — done when `/cards` renders the seeded rows masked, appears in the sidebar and the breadcrumb, and an emptied collection shows the written empty row.
5. **Issue dialog with one-time reveal** — done when a new card's full number appears once, reopening the dialog shows the form, and the list refreshes with the masked row. Tab order, labels, Escape, and focus return checked by keyboard.
6. **Detail page** — done when a seeded card past 80% shows an amber bar with `role="progressbar"`, the cancelled seed shows its terminal state with no actions, and an unknown id shows the written not-found page.
7. **Freeze, unfreeze, cancel** — done when a freeze flips the badge without a document reload, cancel asks for confirmation first, and a failed `PATCH` shows its message inline.
8. **Bug fixes** — done when `npx vitest run src/data` is green and the sort and bucketing tests were each seen red on the unfixed code.
9. **Gates** — `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `/ship-ready`; then `/pr` and `/submit`.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Issue a card | Dialog on `/cards`: fill, submit, row appears. `curl -X POST /api/cards` → 201 |
| Card list | `/cards` shows nickname, merchant, `•••• 1234`, `formatMoney` limit, `StatusBadge`, `formatDate` created |
| Card detail | Seeded card past 80%: full record, spend against limit, amber bar, events |
| Generated numbers | `src/lib/cards.test.ts`: BIN, length, Luhn, determinism. Generation lives only in `src/data/cards.ts` and `generate.ts`, both server-side |
| Reveal once | `src/data/cards.test.ts`: record has no number. curl: `GET` list and detail carry none. Browser: reopen after issuing shows the form |
| Server-side validation | curl: missing merchant, limit 0, limit −1, limit 5,000,001, currency `JPY`, EUR card on a USD merchant → 400 each |
| Freeze / unfreeze (stretch) | Network tab shows `PATCH` and an RSC refresh, no document navigation |
| Spend progress (stretch) | Seeded 84% card renders amber; `isNearLimit` tested at 79 / 80 / 81% |
| Category lock (stretch) | Issue with `advertising`, shown on row and detail; unknown category → 400 |
| Tests (stretch) | `npm test` summary pasted in the PR with the count before and after |
| Empty and error states (stretch) | Empty row; not-found page; inline `PATCH` failure; form field errors |
| Idempotent issue | Replay test; curl the same body twice → one card |
| Currency matches merchant | Mismatch test; curl → 400 |
| Cancel with confirmation | Confirm dialog, then terminal state, no actions |
| Audit trail | Detail timeline on the cancelled seed shows issued → frozen → unfrozen → cancelled |
| Bug fixes | Sort and bucketing tests seen red then green; `TZ=Europe/Berlin npm test` green |

## Risks

- Reveal-once against retry: if the first response is lost, a retry with the same request id returns the card masked and the number is gone. Stated on the reveal screen and in the PR; replaying the number would mean storing it.
- `Dialog.tsx` is an add/add with PR #157. Identical bytes, so a later rebase resolves clean; diff against the branch before committing.
- `process.env.TZ` at runtime in the bucketing test: Node 22 honours it and vitest's default pool is `forks`; the shell run under `TZ=Europe/Berlin` is the backstop.
- Store operations take their collection as a parameter defaulting to the store, so tests never mutate the seeded global.
- `router.refresh()` is a soft refresh, not a reload; confirm in the network tab.
- The accumulation fix cannot be caught by a test: with `Math.round` at the end, float error never reaches half a cent at this volume. It is a standards fix, and the PR says so.

## Out of scope

- Persistence, auth, network calls, editing a limit (NWP-202) — per the ticket.
- Gross-volume definition (`metrics.ts:53`) — product question, reported in the PR.
- Chart series converted to major units at the chart boundary (`analytics.ts:54,73`) — display-only, noted for `/ship-ready`.
- Expiry dates on cards — not in the ticket; the model leaves room.

## Open questions

- The audit trail has no actor because there is no auth; events record the transition and a timestamp only.
- Cancelled cards stay in the list with their status rather than being hidden; no list filter in this ticket.
