import { merchantById } from "@/data/merchants"
import { Payment, PaymentFilters, PaymentStatus } from "@/data/types"
import { utcDayKey } from "./dates"
import { formatMoney } from "./money"

/**
 * CSV export for the payments table.
 *
 * Ops chooses the columns and the scope (NWP-101). Everything the client
 * sends — column names and the scope — is checked against an allowlist here,
 * before it reaches the query builder or a filename. The card last four is
 * opt-in: a file bound for a merchant should not carry it by accident.
 */

export const EXPORT_COLUMNS = [
  "id",
  "created_at",
  "merchant",
  "description",
  "status",
  "method",
  "card_brand",
  "last4",
  "amount",
  "currency",
] as const

export type ExportColumn = (typeof EXPORT_COLUMNS)[number]

/** Everything but the card last four, which ops opts into per export. */
export const DEFAULT_EXPORT_COLUMNS: readonly ExportColumn[] =
  EXPORT_COLUMNS.filter((column) => column !== "last4")

/** Current filter, or every payment regardless of what the table shows. */
export const EXPORT_SCOPES = ["filtered", "all"] as const

export type ExportScope = (typeof EXPORT_SCOPES)[number]

function isExportColumn(value: string): value is ExportColumn {
  return (EXPORT_COLUMNS as readonly string[]).includes(value)
}

/**
 * Turn the client's `columns` param into a checked column list.
 *
 * Absent means "the default set", so an old bookmark keeps working and gets
 * the safer file. An empty selection returns an empty list — a distinct case
 * the caller rejects, rather than quietly falling back to every column. An
 * unknown name returns null: the request asked for something we cannot give,
 * and a silently narrower file is one nobody notices.
 */
export function parseExportColumns(raw: string | null): ExportColumn[] | null {
  if (raw === null) return [...DEFAULT_EXPORT_COLUMNS]

  const requested = raw
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean)

  const columns: ExportColumn[] = []
  for (const name of requested) {
    if (!isExportColumn(name)) return null
    if (!columns.includes(name)) columns.push(name)
  }
  return columns
}

/** Absent means the current filter. Anything unrecognised is rejected. */
export function parseExportScope(raw: string | null): ExportScope | null {
  if (raw === null) return "filtered"
  return (EXPORT_SCOPES as readonly string[]).includes(raw)
    ? (raw as ExportScope)
    : null
}

/**
 * The filters an export actually runs with.
 *
 * "all" drops everything that narrows the set and keeps the ordering, so the
 * file is the whole book in the order the table was showing. The page and the
 * route both call this, so the count ops sees cannot drift from the file.
 */
export function exportScopeFilters(
  filters: PaymentFilters,
  scope: ExportScope,
): PaymentFilters {
  if (scope === "filtered") return filters
  return { sort: filters.sort, direction: filters.direction }
}

/**
 * The filename's scope segment. Only allowlisted values inhabit this type, so
 * a merchant id or a search string cannot reach a filename.
 */
export type ExportLabel = "all" | "filtered" | PaymentStatus

export function exportLabel(
  filters: PaymentFilters,
  scope: ExportScope,
): ExportLabel {
  if (scope === "all") return "all"
  if (filters.status && filters.status !== "all") return filters.status
  if (filters.merchantId || filters.search || filters.from || filters.to) {
    return "filtered"
  }
  // An unfiltered "current filter" export is every payment. Name it so.
  return "all"
}

function escapeCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`
  return value
}

function cell(payment: Payment, column: ExportColumn): string {
  switch (column) {
    case "id":
      return payment.id
    case "created_at":
      return payment.createdAt
    case "merchant":
      return merchantById(payment.merchantId)?.name ?? payment.merchantId
    case "description":
      return payment.description
    case "status":
      return payment.status
    case "method":
      return payment.method
    case "card_brand":
      return payment.cardBrand ?? ""
    case "last4":
      return payment.last4 ?? ""
    case "amount":
      return formatMoney(payment.amount, payment.currency)
    case "currency":
      return payment.currency
  }
}

export function toCsv(
  payments: Payment[],
  columns: readonly ExportColumn[] = EXPORT_COLUMNS,
): string {
  const header = columns.join(",")
  const rows = payments.map((payment) =>
    columns.map((column) => escapeCell(cell(payment, column))).join(","),
  )
  return [header, ...rows].join("\n")
}

/** `payments-disputed-2026-08-13.csv`. The label says what is in the file. */
export function exportFilename(label: ExportLabel, date = new Date()): string {
  return `payments-${label}-${utcDayKey(date.toISOString())}.csv`
}
