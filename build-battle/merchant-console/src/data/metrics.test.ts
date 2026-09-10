import { sumMinorUnits } from "@/lib/money"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { dailyVolume } from "./metrics"
import { Payment, PaymentStatus } from "./types"

const payment = (
  id: string,
  createdAt: string,
  amount: number,
  status: PaymentStatus = "captured",
): Payment => ({
  id,
  merchantId: "mch_05",
  amount,
  currency: "EUR",
  status,
  method: "card",
  cardBrand: "visa",
  last4: "4242",
  createdAt,
  description: "",
})

const bucket = (rows: Payment[], date: string) =>
  dailyVolume(30, rows).find((day) => day.date === date)

describe("dailyVolume", () => {
  // The Berlin merchant in NWP-102: two hours ahead of UTC in August.
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = "Europe/Berlin"
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it("buckets by UTC day whatever timezone the server runs in", () => {
    // 23:30 UTC on the 12th is already the 13th in Berlin.
    const rows = [payment("a", "2026-08-12T23:30:00.000Z", 1000)]
    expect(bucket(rows, "2026-08-12")?.captured).toBe(1000)
    expect(bucket(rows, "2026-08-13")?.captured).toBe(0)
  })

  it("keeps a payment on the newest day instead of dropping it", () => {
    // The window ends on GENERATED_AT (2026-08-13). In Berlin this instant is
    // the 14th, which has no bucket — the old code skipped it silently.
    const rows = [payment("a", "2026-08-13T23:30:00.000Z", 700)]
    expect(bucket(rows, "2026-08-13")?.captured).toBe(700)
  })

  it("accumulates in integer minor units, refunds separately", () => {
    const rows = [
      payment("a", "2026-08-10T10:00:00.000Z", 1999),
      payment("b", "2026-08-10T11:00:00.000Z", 1),
      payment("c", "2026-08-10T12:00:00.000Z", 500, "refunded"),
    ]
    const day = bucket(rows, "2026-08-10")
    expect(day?.captured).toBe(sumMinorUnits([1999, 1]))
    expect(day?.refunded).toBe(500)
  })
})
