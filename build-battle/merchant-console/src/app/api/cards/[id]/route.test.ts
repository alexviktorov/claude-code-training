import { NextRequest } from "next/server"
import { describe, expect, it } from "vitest"
import { GET, PATCH } from "./route"

const headers = { "content-type": "application/json" }
const context = (id: string) => ({ params: Promise.resolve({ id }) })

const get = (id: string) =>
  GET(new NextRequest(`http://console.test/api/cards/${id}`), context(id))

const patch = (id: string, body: string) =>
  PATCH(
    new NextRequest(`http://console.test/api/cards/${id}`, { method: "PATCH", body, headers }),
    context(id),
  )

describe("GET /api/cards/[id]", () => {
  it("returns a seeded card masked, with its reference and without the request id", async () => {
    const response = await get("card_000001")
    expect(response.status).toBe(200)
    const { card } = await response.json()
    expect(card.id).toBe("card_000001")
    expect(card.last4).toMatch(/^\d{4}$/)
    expect(card.numberRef).toMatch(/^cref_/)
    expect("number" in card).toBe(false)
    expect("requestId" in card).toBe(false)
  })

  it("404s an unknown card", async () => {
    const response = await get("card_999999")
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: "Card not found" })
  })
})

describe("PATCH /api/cards/[id]", () => {
  it("freezes an active card and records the event", async () => {
    const response = await patch("card_000001", JSON.stringify({ status: "frozen" }))
    expect(response.status).toBe(200)
    const { card } = await response.json()
    expect(card.status).toBe("frozen")
    expect(card.events.at(-1).type).toBe("frozen")
  })

  it("refuses to bring a cancelled card back, with 409", async () => {
    const response = await patch("card_000004", JSON.stringify({ status: "active" }))
    expect(response.status).toBe(409)
    const { message } = await response.json()
    expect(message).toContain("cancelled")
  })

  it("rejects a status outside the allowlist", async () => {
    const response = await patch("card_000001", JSON.stringify({ status: "exploded" }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({
      message: "Status must be active, frozen, or cancelled",
    })
  })

  it("rejects a body that is not JSON", async () => {
    const response = await patch("card_000001", "nope")
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "Body must be JSON" })
  })

  it("404s a transition on an unknown card", async () => {
    const response = await patch("card_999999", JSON.stringify({ status: "frozen" }))
    expect(response.status).toBe(404)
  })
})
