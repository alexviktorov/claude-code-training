import { filterPayments, parseFilters, sortPayments } from "@/data/queries"
import {
  exportFilename,
  exportLabel,
  exportScopeFilters,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "@/lib/csv"
import { NextRequest, NextResponse } from "next/server"

/**
 * Exports the payments table as CSV.
 *
 * Ops picks the columns and the scope; both arrive from the client, so both
 * are checked against an allowlist before they reach the query builder or the
 * filename. The export never paginates — the whole matching set comes out.
 */

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams

  const columns = parseExportColumns(params.get("columns"))
  if (columns === null) return badRequest("Unknown export column.")
  if (columns.length === 0) return badRequest("Select at least one column.")

  const scope = parseExportScope(params.get("scope"))
  if (scope === null) return badRequest("Unknown export scope.")

  const filters = parseFilters(params)
  const scoped = exportScopeFilters(filters, scope)
  const rows = sortPayments(
    filterPayments(scoped),
    scoped.sort,
    scoped.direction,
  )

  const filename = exportFilename(exportLabel(filters, scope))

  return new Response(toCsv(rows, columns), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
    },
  })
}
