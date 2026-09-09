import { describe, expect, it } from "vitest"
import {
  CARD_BIN,
  CARD_LIMIT_MAX,
  CARD_NUMBER_LENGTH,
  canTransition,
  eventFor,
  generateCardNumber,
  isLuhnValid,
  isNearLimit,
  luhnCheckDigit,
  maskCardNumber,
  newRequestId,
  spendPercent,
  validateIssueRequest,
} from "./cards"

/** A random source that replays a fixed sequence, so generation is reproducible. */
const sequence = (values: number[]) => {
  let i = 0
  return () => values[i++ % values.length]
}

describe("luhnCheckDigit", () => {
  it("completes the 4242 test number", () => {
    expect(luhnCheckDigit("424242424242424")).toBe("2")
  })

  it("wraps to zero when the partial already sums to a multiple of ten", () => {
    expect(luhnCheckDigit("424200000000000")).toBe("0")
  })
})

describe("isLuhnValid", () => {
  it("accepts the 4242 test number", () => {
    expect(isLuhnValid("4242424242424242")).toBe(true)
  })

  it("rejects a number whose last digit is off by one", () => {
    expect(isLuhnValid("4242424242424241")).toBe(false)
  })

  it("rejects anything that is not all digits", () => {
    expect(isLuhnValid("4242 4242 4242 4242")).toBe(false)
  })
})

describe("generateCardNumber", () => {
  it("starts with the test BIN and is sixteen digits", () => {
    const { number } = generateCardNumber(sequence([0.5]))
    expect(number.startsWith(CARD_BIN)).toBe(true)
    expect(number).toHaveLength(CARD_NUMBER_LENGTH)
    expect(number).toMatch(/^\d+$/)
  })

  it("always passes Luhn, whatever the random source returns", () => {
    for (let i = 0; i < 200; i++) {
      expect(isLuhnValid(generateCardNumber(Math.random).number)).toBe(true)
    }
  })

  it("is deterministic for a fixed random source", () => {
    const a = generateCardNumber(sequence([0.1, 0.9, 0.3]))
    const b = generateCardNumber(sequence([0.1, 0.9, 0.3]))
    expect(a).toEqual(b)
  })

  it("returns the last four and an opaque reference that is not the number", () => {
    const { number, last4, reference } = generateCardNumber(sequence([0.7]))
    expect(last4).toBe(number.slice(-4))
    expect(reference).toMatch(/^cref_\d{12}$/)
  })
})

describe("maskCardNumber", () => {
  it("shows only the last four behind bullets", () => {
    expect(maskCardNumber("4242")).toBe("•••• 4242")
  })
})

describe("canTransition", () => {
  it("allows active to frozen and back", () => {
    expect(canTransition("active", "frozen")).toBe(true)
    expect(canTransition("frozen", "active")).toBe(true)
  })

  it("allows either live state to cancel", () => {
    expect(canTransition("active", "cancelled")).toBe(true)
    expect(canTransition("frozen", "cancelled")).toBe(true)
  })

  it("treats cancelled as terminal", () => {
    expect(canTransition("cancelled", "active")).toBe(false)
    expect(canTransition("cancelled", "frozen")).toBe(false)
    expect(canTransition("cancelled", "cancelled")).toBe(false)
  })

  it("rejects a no-op transition", () => {
    expect(canTransition("active", "active")).toBe(false)
    expect(canTransition("frozen", "frozen")).toBe(false)
  })
})

describe("eventFor", () => {
  it("names the audit event for each destination", () => {
    expect(eventFor("frozen")).toBe("frozen")
    expect(eventFor("active")).toBe("unfrozen")
    expect(eventFor("cancelled")).toBe("cancelled")
  })
})

describe("isNearLimit", () => {
  it("turns on at exactly eighty percent, in integer arithmetic", () => {
    expect(isNearLimit(7999, 10000)).toBe(false)
    expect(isNearLimit(8000, 10000)).toBe(true)
    expect(isNearLimit(8001, 10000)).toBe(true)
  })

  it("is never near a limit of zero spend", () => {
    expect(isNearLimit(0, 25000)).toBe(false)
  })
})

describe("spendPercent", () => {
  it("floors to a whole percent for the bar", () => {
    expect(spendPercent(8400, 10000)).toBe(84)
    expect(spendPercent(1, 10000)).toBe(0)
  })

  it("clamps to one hundred when spend passes the limit", () => {
    expect(spendPercent(12000, 10000)).toBe(100)
  })

  it("is zero when there is no limit to measure against", () => {
    expect(spendPercent(500, 0)).toBe(0)
  })
})

describe("newRequestId", () => {
  it("mints a distinct, non-trivial id each time", () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(a.length).toBeGreaterThanOrEqual(16)
    expect(a).not.toBe(b)
  })
})

describe("validateIssueRequest", () => {
  const valid = {
    nickname: "  Ad spend  ",
    merchantId: "mch_01",
    currency: "USD",
    limit: 25000,
    categoryLock: null,
    requestId: "req-1",
  }

  it("accepts a well-formed request and trims the nickname", () => {
    const result = validateIssueRequest(valid)
    expect(result).toEqual({
      ok: true,
      value: { ...valid, nickname: "Ad spend" },
    })
  })

  it("rejects a body that is not an object", () => {
    expect(validateIssueRequest(null)).toEqual({
      ok: false,
      message: "Request body must be an object",
    })
  })

  it("rejects a missing or unknown merchant", () => {
    expect(validateIssueRequest({ ...valid, merchantId: undefined })).toEqual({
      ok: false,
      message: "Choose a merchant",
    })
    expect(validateIssueRequest({ ...valid, merchantId: "mch_99" })).toEqual({
      ok: false,
      message: "Choose a merchant",
    })
  })

  it("rejects a zero or negative limit", () => {
    expect(validateIssueRequest({ ...valid, limit: 0 }).ok).toBe(false)
    expect(validateIssueRequest({ ...valid, limit: -1 })).toEqual({
      ok: false,
      message: "Limit must be greater than zero",
    })
  })

  it("rejects a limit that is not a whole number of minor units", () => {
    expect(validateIssueRequest({ ...valid, limit: 250.5 })).toEqual({
      ok: false,
      message: "Limit must be a whole number of minor units",
    })
    expect(validateIssueRequest({ ...valid, limit: "25000" }).ok).toBe(false)
  })

  it("rejects a limit above five million minor units", () => {
    expect(validateIssueRequest({ ...valid, limit: CARD_LIMIT_MAX }).ok).toBe(true)
    expect(validateIssueRequest({ ...valid, limit: CARD_LIMIT_MAX + 1 })).toEqual({
      ok: false,
      message: "Limit cannot exceed 5,000,000 minor units",
    })
  })

  it("rejects a currency outside USD, EUR, GBP", () => {
    expect(validateIssueRequest({ ...valid, currency: "JPY" })).toEqual({
      ok: false,
      message: "Currency must be USD, EUR, or GBP",
    })
  })

  it("rejects a currency that does not match the merchant's", () => {
    // mch_05 (Brandt & Sohn) settles in EUR.
    expect(
      validateIssueRequest({ ...valid, merchantId: "mch_05", currency: "GBP" }),
    ).toEqual({
      ok: false,
      message: "Currency must match the merchant's currency (EUR)",
    })
  })

  it("rejects an empty or overlong nickname", () => {
    expect(validateIssueRequest({ ...valid, nickname: "   " })).toEqual({
      ok: false,
      message: "Nickname is required",
    })
    expect(validateIssueRequest({ ...valid, nickname: "x".repeat(41) })).toEqual({
      ok: false,
      message: "Nickname must be 40 characters or fewer",
    })
  })

  it("accepts an allowlisted category and rejects any other", () => {
    expect(
      validateIssueRequest({ ...valid, categoryLock: "advertising" }),
    ).toMatchObject({ ok: true, value: { categoryLock: "advertising" } })
    expect(validateIssueRequest({ ...valid, categoryLock: "office_chairs" })).toEqual({
      ok: false,
      message: "Unknown category",
    })
  })

  it("treats an absent category as no lock", () => {
    const withoutCategory = Object.fromEntries(
      Object.entries(valid).filter(([key]) => key !== "categoryLock"),
    )
    expect(validateIssueRequest(withoutCategory)).toMatchObject({
      ok: true,
      value: { categoryLock: null },
    })
  })

  it("requires a request id", () => {
    expect(validateIssueRequest({ ...valid, requestId: "" })).toEqual({
      ok: false,
      message: "Request id is required",
    })
  })
})
