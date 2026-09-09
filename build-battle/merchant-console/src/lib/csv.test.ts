import { describe, expect, it } from "vitest"
import { Payment, PaymentFilters } from "@/data/types"
import {
  DEFAULT_EXPORT_COLUMNS,
  EXPORT_COLUMNS,
  exportFilename,
  exportLabel,
  exportScopeFilters,
  parseExportColumns,
  parseExportScope,
  toCsv,
} from "./csv"

/**
 * The export is the file ops hands to a merchant, so a broken cell is a
 * support ticket rather than a stack trace. These tests pin the escaping and
 * the column contract; NWP-101 changes which columns ship, not how a cell is
 * written, and these should still pass afterwards.
 */

const payment: Payment = {
  id: "pay_0001",
  merchantId: "mch_01",
  amount: 25000,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-03-14T10:15:00.000Z",
  description: "Order 1180",
}

describe("toCsv", () => {
  it("writes a header row followed by one row per payment", () => {
    const lines = toCsv([payment]).split("\n")
    expect(lines).toHaveLength(2)
    expect(lines[0]).toBe(EXPORT_COLUMNS.join(","))
  })

  it("writes only the requested columns, in the order given", () => {
    expect(toCsv([payment], ["id", "amount"])).toBe(
      ["id,amount", "pay_0001,$250.00"].join("\n"),
    )
  })

  it("quotes cells containing a comma, so amounts do not split", () => {
    const large = { ...payment, amount: 123456789 }
    expect(toCsv([large], ["amount"])).toBe(['amount', '"$1,234,567.89"'].join("\n"))
  })

  it("doubles embedded quotes rather than dropping them", () => {
    const quoted = { ...payment, description: 'Order "rush"' }
    expect(toCsv([quoted], ["description"])).toBe(
      ["description", '"Order ""rush"""'].join("\n"),
    )
  })

  it("keeps a newline inside a description in one quoted cell", () => {
    const multiline = { ...payment, description: "Order 1180\nsecond line" }
    const body = toCsv([multiline], ["description"]).split("\n").slice(1).join("\n")
    expect(body).toBe('"Order 1180\nsecond line"')
  })

  it("resolves the merchant name, and falls back to the id when unknown", () => {
    expect(toCsv([payment], ["merchant"])).toContain("Lumen Coffee Roasters")
    const orphan = { ...payment, merchantId: "mch_missing" }
    expect(toCsv([orphan], ["merchant"])).toContain("mch_missing")
  })

  it("writes an empty cell for a payment with no card", () => {
    const bank: Payment = {
      ...payment,
      method: "bank_transfer",
      cardBrand: null,
      last4: null,
    }
    expect(toCsv([bank], ["card_brand", "last4"])).toBe(
      ["card_brand,last4", ","].join("\n"),
    )
  })

  it("emits a header even with no rows", () => {
    expect(toCsv([], ["id"])).toBe("id")
  })
})

/**
 * Column names arrive from the client, so this parser is the allowlist that
 * stands between a URL and the file ops hands to a merchant.
 */
describe("parseExportColumns", () => {
  it("keeps the requested subset in the order it was asked for", () => {
    expect(parseExportColumns("amount,id")).toEqual(["amount", "id"])
    expect(parseExportColumns("id,amount")).toEqual(["id", "amount"])
  })

  it("leaves the card last four out by default, so a merchant file is clean", () => {
    const columns = parseExportColumns(null)
    expect(columns).not.toContain("last4")
    expect(columns).toEqual(EXPORT_COLUMNS.filter((c) => c !== "last4"))
    expect(columns).toEqual([...DEFAULT_EXPORT_COLUMNS])
  })

  it("returns an empty selection rather than falling back to every column", () => {
    expect(parseExportColumns("")).toEqual([])
  })

  it("rejects a name that is not a column, rather than quietly dropping it", () => {
    expect(parseExportColumns("id,pan")).toBeNull()
    expect(parseExportColumns("card_number")).toBeNull()
  })

  it("trims spacing and ignores a repeat, keeping the first position", () => {
    expect(parseExportColumns(" id , amount ,id")).toEqual(["id", "amount"])
  })

  it("includes the last four when it is asked for explicitly", () => {
    expect(parseExportColumns("last4")).toEqual(["last4"])
  })

  it("serializes the default selection without the card last four", () => {
    const csv = toCsv([payment], parseExportColumns(null)!)
    const [header, row] = csv.split("\n")
    expect(header).not.toContain("last4")
    expect(csv).not.toContain("4242")
    expect(row.endsWith("$250.00,USD")).toBe(true)
  })
})

describe("parseExportScope", () => {
  it("defaults to the current filter when no scope is asked for", () => {
    expect(parseExportScope(null)).toBe("filtered")
  })

  it("accepts the all-payments scope", () => {
    expect(parseExportScope("all")).toBe("all")
  })

  it("rejects a scope outside the allowlist", () => {
    expect(parseExportScope("everything")).toBeNull()
  })
})

describe("exportScopeFilters", () => {
  const filters: PaymentFilters = {
    status: "disputed",
    merchantId: "mch_01",
    search: "order",
    from: "2026-01-01",
    to: "2026-06-30",
    sort: "amount",
    direction: "asc",
  }

  it("hands the current filter straight through", () => {
    expect(exportScopeFilters(filters, "filtered")).toBe(filters)
  })

  it("drops everything that narrows the set but keeps the ordering", () => {
    expect(exportScopeFilters(filters, "all")).toEqual({
      sort: "amount",
      direction: "asc",
    })
  })
})

describe("exportLabel", () => {
  it("names the all-payments scope regardless of the filters in the URL", () => {
    expect(exportLabel({ status: "disputed" }, "all")).toBe("all")
  })

  it("names the status when the table is narrowed to one", () => {
    expect(exportLabel({ status: "disputed" }, "filtered")).toBe("disputed")
  })

  it("says filtered rather than leaking a merchant id or a search term", () => {
    expect(exportLabel({ merchantId: "mch_01" }, "filtered")).toBe("filtered")
    expect(exportLabel({ search: "order 1180" }, "filtered")).toBe("filtered")
  })

  it("calls an unfiltered export all, because that is what is in it", () => {
    expect(exportLabel({ status: "all" }, "filtered")).toBe("all")
    expect(exportLabel({}, "filtered")).toBe("all")
  })
})

describe("exportFilename", () => {
  it("stamps the UTC date, so two exports on the same day collide by design", () => {
    expect(exportFilename("all", new Date("2026-03-14T23:00:00.000Z"))).toBe(
      "payments-all-2026-03-14.csv",
    )
  })

  it("carries the scope, so a disputed export is named on sight", () => {
    expect(
      exportFilename("disputed", new Date("2026-08-13T09:30:00.000Z")),
    ).toBe("payments-disputed-2026-08-13.csv")
  })
})
