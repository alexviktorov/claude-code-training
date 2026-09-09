# SPEC · NWP-101 — Payments export: let ops choose columns and scope

> Written before any code. Generated with `/spec`, then edited by a human.
> Load it as context when you build: `@docs/specs/NWP-101-export-options.md`

**Ticket:** [NWP-101](../tickets/NWP-101.md)
**Author:** Alexander Viktorov
**Status:** building

## Problem

Dana's ops team exports the payments table several times a day for merchant queries, month-end reconciliation, and Finance requests. The export works but it is fixed: every column, current filter only, no say in what comes out. The card last-four is in every file, so anything going to a merchant is cleaned up by hand first — 3–4 hours a month of spreadsheet editing, and a near-miss last quarter where an unedited file nearly went to the wrong merchant.

## Current state

- `src/app/api/payments/export/route.ts:11-25` — `GET` runs `parseFilters` → `filterPayments` → `sortPayments` and returns `toCsv(rows)` with **every** column. It never calls `paginate`, so the whole filtered set already exports. Filename is `exportFilename()` = `payments-<today>.csv`. No `columns` or `scope` param exists, so there is nothing to validate and no error branch.
- `src/lib/csv.ts:13-24` — `EXPORT_COLUMNS`, the ten-name allowlist: `id, created_at, merchant, description, status, method, card_brand, last4, amount, currency`.
- `src/lib/csv.ts:58-67` — `toCsv(payments, columns = EXPORT_COLUMNS)` already honours a subset **in the order given**. The ticket needs a way to choose that subset, not a new serializer.
- `src/lib/csv.ts:33-56` — `cell()` formats `amount` once through `formatMoney` and emits `currency` as its own column. Acceptance criterion 4 is already satisfied here; the work is to not break it.
- `src/lib/csv.ts:69-71` — `exportFilename(date)` stamps the UTC date only, inlining what `utcDayKey` (`src/lib/dates.ts:7`) already does. No scope segment.
- `src/data/queries.ts:18-36` — `parseFilters` is the server-side allowlist for status, sort, direction, page. `filterPayments` / `sortPayments` / `paginate` / `queryPayments` (lines 45-106) are the one query builder.
- `src/app/payments/page.tsx:68-76` — the Export button is a `Button asChild` around a plain `<a href="/api/payments/export?…">`. The page already holds `total`, the current-filter row count (line 45). Its `query` (lines 46-48) carries `page`, which the export ignores.
- `src/lib/csv.test.ts` — vitest under plain Node (`vitest.config.ts`, no jsdom, `src/**/*.test.ts` only). Covers escaping, subset order, merchant fallback, null card, empty rows, and the filename date. Nothing covers a client-supplied column list or a labelled filename.
- **Contradicts the ticket's assumptions:** `.claude/rules/components.md` says `src/components/` "already has … Dialog", but there is no `Dialog.tsx`. `Drawer.tsx` is the only Radix dialog wrapper, it is a right-edge side sheet, it lacks a `"use client"` directive, and its overlay uses an inline `style` that `components.md` forbids. No checkbox or radio primitive exists, and nothing in `src/` calls `fetch`.

## Domain rules

| Rule | Source | What breaks if ignored |
| --- | --- | --- |
| "Anything from the client — column names, currencies, limits, statuses — is checked against an allowlist before it reaches a query, a filename, or the store." | `merchant-console/CLAUDE.md` §Conventions 4 | Unknown names reach the serializer or the filename |
| "Payment filtering goes through the builder behind `GET /api/payments`. A second implementation is a bug, not a shortcut." | `merchant-console/CLAUDE.md` §Conventions 3 | Export drifts from the table |
| "Money is integer minor units… Format once, at the edge, next to its currency code." | `merchant-console/CLAUDE.md` §Conventions 1, `money.md` | Amount cells disagree with the table |
| "Return the same error shape everywhere: a status code that means what it says, and a body with a message safe to show a user." / "Reject early and return." | `.claude/rules/api-routes.md` | Bad input yields a 200 with a broken file |
| "Dialogs and forms must be operable. Every input has a label, the dialog has an accessible name, focus moves into it and returns on close, Escape closes it." / "Tailwind only." | `.claude/rules/components.md` | Inaccessible dialog |
| "Mask everywhere else" | `.claude/rules/cards.md` | Last-four leaves in files that did not ask for it |
| "The payments table is paginated. Building this in the browser exports the current page only." | ticket §Notes | Truncated exports |

## Approach

The export stays a browser-downloadable GET link, and gains two validated query params: `columns` (comma-separated allowlisted names, request order preserved) and `scope` (`filtered` or `all`). Every pure piece — parsing both params, widening the filters for the all-payments scope, choosing the filename label, and building the filename — lives in `src/lib/csv.ts` beside the serializer, so `csv.test.ts` covers it without constructing a `Request`. The route handler stays a thin parse → reject early → query builder → CSV pipeline. The dialog is a client component that the server page renders; the page computes both row counts through the same query builder and the same scope-widening helper the route uses, so nothing is fetched from the client and the count ops sees cannot drift from the file they get. The filename label is a narrow type, `"all" | "filtered" | PaymentStatus`, so the compiler enforces that only allowlisted values can name a file.

**Considered and rejected:** a POST with a JSON body and a blob download in the browser. It loses the plain link `CLAUDE.md` documents as "a browser-downloadable CSV link", needs fetch and error plumbing inside a component that `components.md` says to keep free of data fetching, and buys nothing for two short strings that fit in a URL. Also rejected: silently dropping unknown column names, because `api-routes.md` asks for a status code that means what it says, and a quietly narrower file is one the caller cannot detect.

## File map

| File | Add or change | Why |
| --- | --- | --- |
| `src/lib/csv.ts` | change | Default columns, scope and column parsers, scope-widening, filename label, labelled filename |
| `src/app/api/payments/export/route.ts` | change | Read and validate both params, 400 on bad input, widen for `scope=all`, labelled filename |
| `src/components/Dialog.tsx` | add | Tremor Dialog on the already-installed `@radix-ui/react-dialog`; the rules doc says it should exist |
| `tailwind.config.ts` | change | `dialogOverlayShow` / `dialogContentShow` keyframes the Dialog needs |
| `src/app/payments/export-dialog.tsx` | add | The options dialog: column checkboxes, scope radios with counts, Download |
| `src/app/payments/page.tsx` | change | Render the dialog instead of the bare link; pass the query and both counts |
| `src/lib/csv.test.ts` | change | Cover column selection, scope, label, and the new filename signature |

## Plan

1. **Pure helpers in `csv.ts`, with the existing filename test updated in the same step** — done when: `npx tsc --noEmit` is clean and `npm test` is still 28 passing.
2. **Route handler validation** — done when: no params returns a nine-column header without `last4`; `columns=id,amount` returns those two in that order; `columns=`, `columns=id,pan`, and `scope=everything` each return 400 with a JSON message; `status=disputed` sets `filename="payments-disputed-<date>.csv"`; `status=disputed&scope=all` returns every payment.
3. **`Dialog.tsx` and the Tailwind keyframes** — done when: `npm run lint` is clean and the file contains no `style=`.
4. **`export-dialog.tsx`** — done when: Export opens the dialog, Escape closes it and focus returns, last-four starts unchecked, the counts follow the scope, and Download is disabled with a hint at zero columns.
5. **Wire `page.tsx`** — done when: a real download from `/payments?status=disputed` lands as `payments-disputed-<date>.csv` with the checked columns, and the all-payments scope yields `payments-all-…` with more rows.
6. **Tests in `csv.test.ts`, then `npm test`** — done when: the new blocks pass and the whole suite is green.

## Verification

| Acceptance criterion | How it is proven |
| --- | --- |
| Ops can choose columns; card last-four off by default | `parseExportColumns` unit tests; a default export whose header has no `last4`; the dialog opens with "Card last four" unchecked |
| Scope current filter or all; current filter default; row count visible before download | The two scope radio labels carry their counts; `exportScopeFilters` unit tests; a `scope=all` export row count that matches the all-payments count |
| Filename reflects scope and date | `exportLabel` and `exportFilename` unit tests, including the ticket's own `payments-disputed-2026-08-13.csv`; the `content-disposition` header |
| Amounts in minor units internally, formatted once, currency in its own column | The existing `toCsv` tests still pass; `cell()` is untouched; a default-columns test asserts the row ends `$250.00,USD` |
| Deselecting every column disables Download | The dialog renders a disabled button and a hint at zero columns; the route returns 400 for an empty selection, so an empty file cannot be produced by any caller |
| Column names validated server-side | `columns=id,pan` returns 400; `parseExportColumns` rejects unknown names |
| A unit test covers the column serializer and `npm test` passes | Tests extend `src/lib/csv.test.ts`; the run summary goes in the PR |

## Risks

- The filename label rule is the one judgment call: all-payments scope is `all`, a status filter names itself, merchant or search or date filters give `filtered`, and no filters gives `all`. Merchant ids and search text never enter a filename. One function to change if ops wants it differently.
- `Button asChild` with `disabled` does nothing on an anchor, so the zero-column state renders a real disabled button, the same way pagination does at `page.tsx:145-155`.
- Nesting `asChild` (`DialogClose` around `Button` around `<a>`) leaks `type="button"` onto the anchor, so the dialog uses a controlled `open` state and closes in the link's `onClick`.
- A 400 reached by hand-editing the URL navigates the tab to the JSON body. The dialog's allowlisted controls prevent it in normal use.
- Adding the dialog keyframes also activates the `animate-dialogOverlayShow` class that `Drawer.tsx:55` already references and that currently no-ops.

## Out of scope

- `sortPayments` orders by `String(amount).localeCompare` (`queries.ts:81`), so amount sort is lexical rather than numeric. A real defect, reported rather than fixed here.
- Date-range controls in the filter bar. The export honours `from` and `to` when they are in the URL, but nothing sets them today.
- Persisting a column preference between sessions. There is no persistence until NWP-203.
- Component or DOM tests. Vitest runs under plain Node, so the dialog is verified in the browser.

## Open questions

- None blocking. The filename label rule above is the one place a different preference would change the code.
