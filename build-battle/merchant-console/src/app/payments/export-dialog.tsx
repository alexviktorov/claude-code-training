"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
import type { ExportColumn, ExportScope } from "@/lib/csv"
import { cx, focusRing } from "@/lib/utils"
import { Download } from "lucide-react"
import { useState } from "react"

/**
 * Export options for the payments table.
 *
 * The counts and filenames arrive from the page, which computes them with the
 * same helpers the route uses, so what ops reads here is what lands on disk.
 * The checkboxes are a convenience; the route re-checks every column name.
 */

const COLUMN_LABELS: Record<ExportColumn, string> = {
  id: "Payment ID",
  created_at: "Created at (UTC)",
  merchant: "Merchant",
  description: "Description",
  status: "Status",
  method: "Method",
  card_brand: "Card brand",
  last4: "Card last four",
  amount: "Amount",
  currency: "Currency",
}

const SCOPE_LABELS: { value: ExportScope; label: string }[] = [
  { value: "filtered", label: "Current filter" },
  { value: "all", label: "All payments" },
]

const controlStyles = cx(
  "size-4 shrink-0 cursor-pointer accent-blue-500",
  focusRing,
)

export function ExportDialog({
  query,
  columns,
  defaultColumns,
  counts,
  filenames,
}: {
  query: string
  columns: readonly ExportColumn[]
  defaultColumns: readonly ExportColumn[]
  counts: Record<ExportScope, number>
  filenames: Record<ExportScope, string>
}) {
  const [open, setOpen] = useState(false)
  const [scope, setScope] = useState<ExportScope>("filtered")
  const [selected, setSelected] = useState<Set<ExportColumn>>(
    () => new Set(defaultColumns),
  )

  const toggle = (column: ExportColumn) => {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(column)) next.delete(column)
      else next.add(column)
      return next
    })
  }

  // Order comes from the canonical column list, not from click order, so the
  // header is predictable however ops ticks the boxes.
  const ordered = columns.filter((column) => selected.has(column))
  const rowCount = counts[scope]

  const params = new URLSearchParams(query)
  params.set("columns", ordered.join(","))
  params.set("scope", scope)
  const href = `/api/payments/export?${params.toString()}`

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" className="w-full gap-2 py-1.5 sm:w-fit">
          <Download
            className="-ml-0.5 size-4 shrink-0 text-gray-400 dark:text-gray-600"
            aria-hidden="true"
          />
          Export
        </Button>
      </DialogTrigger>

      <DialogContent>
        <DialogHeader>
          <DialogTitle>Export payments</DialogTitle>
          <DialogDescription>
            Choose what goes in the file. Card last four is left out unless you
            ask for it.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="flex flex-col gap-6">
          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Columns
            </legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {columns.map((column) => (
                <label
                  key={column}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="checkbox"
                    name="columns"
                    value={column}
                    checked={selected.has(column)}
                    onChange={() => toggle(column)}
                    className={controlStyles}
                  />
                  {COLUMN_LABELS[column]}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-sm font-medium text-gray-900 dark:text-gray-50">
              Scope
            </legend>
            <div className="flex flex-col gap-2">
              {SCOPE_LABELS.map(({ value, label }) => (
                <label
                  key={value}
                  className="flex cursor-pointer items-center gap-2 text-sm text-gray-700 dark:text-gray-300"
                >
                  <input
                    type="radio"
                    name="scope"
                    value={value}
                    checked={scope === value}
                    onChange={() => setScope(value)}
                    className={controlStyles}
                  />
                  {label}
                  <span className="text-gray-500 tabular-nums dark:text-gray-500">
                    · {counts[value].toLocaleString()} rows
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div
            aria-live="polite"
            className="text-sm text-gray-500 dark:text-gray-500"
          >
            {rowCount === 0 ? (
              <p>No payments match this scope. The file will hold only a header row.</p>
            ) : (
              <p>
                {rowCount.toLocaleString()} rows and {ordered.length}{" "}
                {ordered.length === 1 ? "column" : "columns"} as{" "}
                <span className="font-medium text-gray-900 dark:text-gray-50">
                  {filenames[scope]}
                </span>
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary" className="py-1.5">
              Cancel
            </Button>
          </DialogClose>
          {ordered.length === 0 ? (
            <div className="flex flex-col items-end gap-1">
              <Button className="py-1.5" disabled>
                Download
              </Button>
              <p className="text-xs text-gray-500 dark:text-gray-500">
                Select at least one column
              </p>
            </div>
          ) : (
            <Button className="gap-2 py-1.5" asChild>
              <a href={href} onClick={() => setOpen(false)}>
                <Download className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
                Download
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
