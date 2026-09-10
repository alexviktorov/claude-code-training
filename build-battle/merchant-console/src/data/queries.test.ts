import { describe, expect, it } from "vitest"
import { sortPayments } from "./queries"
import { Payment } from "./types"

const payment = (id: string, amount: number): Payment => ({
  id,
  merchantId: "mch_01",
  amount,
  currency: "USD",
  status: "captured",
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt: "2026-08-01T00:00:00.000Z",
  description: "",
})

describe("sortPayments", () => {
  it("orders amounts as numbers, not as text", () => {
    const rows = [payment("a", 1000), payment("b", 999), payment("c", 25000)]
    expect(sortPayments(rows, "amount", "asc").map((row) => row.amount)).toEqual([
      999, 1000, 25000,
    ])
    expect(sortPayments(rows, "amount", "desc").map((row) => row.amount)).toEqual([
      25000, 1000, 999,
    ])
  })
})
