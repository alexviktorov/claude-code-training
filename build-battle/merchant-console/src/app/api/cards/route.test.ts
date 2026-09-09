import { CARD_BIN, isLuhnValid } from "@/lib/cards"
import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { GET, POST } from "./route"

const headers = { "content-type": "application/json" }

const post = (body: string) =>
  POST(new NextRequest("http://console.test/api/cards", { method: "POST", body, headers }))

const valid = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  currency: "USD",
  limit: 25000,
  categoryLock: "advertising",
  requestId: "route-test-1",
}

describe("POST /api/cards", () => {
  it("issues a card and returns the number exactly once", async () => {
    const response = await post(JSON.stringify(valid))
    expect(response.status).toBe(201)
    const body = await response.json()
    expect(body.replayed).toBe(false)
    expect(body.number.startsWith(CARD_BIN)).toBe(true)
    expect(isLuhnValid(body.number)).toBe(true)
    expect(body.card.last4).toBe(body.number.slice(-4))
    expect(body.card.categoryLock).toBe("advertising")
    expect("requestId" in body.card).toBe(false)
    expect(JSON.stringify(body.card)).not.toContain(body.number)
  })

  it("replays a repeated request id without a number", async () => {
    const first = await (await post(JSON.stringify({ ...valid, requestId: "route-test-2" }))).json()
    const response = await post(JSON.stringify({ ...valid, requestId: "route-test-2" }))
    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.replayed).toBe(true)
    expect(body.card.id).toBe(first.card.id)
    expect("number" in body).toBe(false)
  })

  it("rejects a body that is not JSON", async () => {
    const response = await post("{not json")
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "Body must be JSON" })
  })

  it.each([
    [{ merchantId: undefined }, "Choose a merchant"],
    [{ limit: 0 }, "Limit must be greater than zero"],
    [{ limit: 5_000_001 }, "Limit cannot exceed 5,000,000 minor units"],
    [{ currency: "JPY" }, "Currency must be USD, EUR, or GBP"],
    [{ merchantId: "mch_05" }, "Currency must match the merchant's currency (EUR)"],
  ])("rejects %j with 400", async (override, message) => {
    const response = await post(JSON.stringify({ ...valid, ...override, requestId: "route-test-rejected" }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message })
  })
})

describe("GET /api/cards", () => {
  it("lists cards newest first, masked, without the request id", async () => {
    const response = await GET()
    expect(response.status).toBe(200)
    const { cards } = await response.json()
    expect(cards.length).toBeGreaterThanOrEqual(5)
    for (const card of cards) {
      expect(card.last4).toMatch(/^\d{4}$/)
      expect("number" in card).toBe(false)
      expect("requestId" in card).toBe(false)
    }
    expect(cards[0].createdAt >= cards[1].createdAt).toBe(true)
  })
})
