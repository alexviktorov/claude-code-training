import { describe, expect, it } from "vitest"
import { CARD_BIN, CARD_LIMIT_MAX, isLuhnValid, isNearLimit } from "@/lib/cards"
import {
  cardById,
  issueCard,
  listCards,
  publicCard,
  transitionCard,
} from "./cards"
import { merchantById } from "./merchants"
import { store } from "./store"
import { Card } from "./types"

const now = new Date("2026-09-09T16:00:00.000Z")
const later = new Date("2026-09-09T16:05:00.000Z")

const request = {
  nickname: "Ad spend",
  merchantId: "mch_01",
  currency: "USD" as const,
  limit: 25000,
  categoryLock: null,
  requestId: "req-1",
}

/** A fresh collection with one issued card, so tests never touch the seeded store. */
function issued() {
  const cards: Card[] = []
  const result = issueCard(request, cards, now)
  if (result.replayed) throw new Error("fixture replayed")
  return { cards, id: result.card.id, number: result.number }
}

describe("issueCard", () => {
  it("mints a Luhn-valid number on the test BIN and returns it exactly once", () => {
    const cards: Card[] = []
    const result = issueCard(request, cards, now)
    expect(result.replayed).toBe(false)
    if (result.replayed) return
    expect(result.number.startsWith(CARD_BIN)).toBe(true)
    expect(isLuhnValid(result.number)).toBe(true)
    expect(result.card.last4).toBe(result.number.slice(-4))
  })

  it("never stores the number on the record", () => {
    const { cards, number } = issued()
    const record = cards[0]
    expect(JSON.stringify(record)).not.toContain(number)
    expect(Object.values(record)).not.toContain(number)
  })

  it("records a fresh id, zero spend, active status, and an issued event", () => {
    const { cards } = issued()
    expect(cards[0]).toMatchObject({
      id: "card_000001",
      merchantId: "mch_01",
      nickname: "Ad spend",
      limit: 25000,
      spent: 0,
      currency: "USD",
      status: "active",
      categoryLock: null,
      requestId: "req-1",
      createdAt: now.toISOString(),
      events: [{ at: now.toISOString(), type: "issued" }],
    })
    expect(cards[0].numberRef).toMatch(/^cref_\d{12}$/)
  })

  it("continues ids after the highest existing card", () => {
    const { cards } = issued()
    cards[0].id = "card_000041"
    const result = issueCard({ ...request, requestId: "req-2" }, cards, later)
    expect(result.card.id).toBe("card_000042")
  })

  it("replays a repeated request id without minting a second card", () => {
    const { cards, id } = issued()
    const second = issueCard(request, cards, later)
    expect(second.replayed).toBe(true)
    expect(second.card.id).toBe(id)
    expect("number" in second).toBe(false)
    expect(cards).toHaveLength(1)
  })
})

describe("transitionCard", () => {
  it("freezes an active card and records the event", () => {
    const { cards, id } = issued()
    const result = transitionCard(id, "frozen", cards, later)
    expect(result).toMatchObject({ ok: true, card: { status: "frozen" } })
    expect(cards[0].events.at(-1)).toEqual({ at: later.toISOString(), type: "frozen" })
  })

  it("unfreezes back to active with an unfrozen event", () => {
    const { cards, id } = issued()
    transitionCard(id, "frozen", cards, later)
    const result = transitionCard(id, "active", cards, later)
    expect(result).toMatchObject({ ok: true, card: { status: "active" } })
    expect(cards[0].events.map((event) => event.type)).toEqual([
      "issued",
      "frozen",
      "unfrozen",
    ])
  })

  it("refuses a transition the state machine does not allow, without recording it", () => {
    const { cards, id } = issued()
    expect(transitionCard(id, "active", cards, later)).toEqual({
      ok: false,
      reason: "illegal_transition",
    })
    expect(cards[0].events).toHaveLength(1)
  })

  it("treats cancelled as terminal", () => {
    const { cards, id } = issued()
    transitionCard(id, "cancelled", cards, later)
    expect(transitionCard(id, "active", cards, later)).toEqual({
      ok: false,
      reason: "illegal_transition",
    })
    expect(cards[0].status).toBe("cancelled")
  })

  it("reports an unknown card", () => {
    expect(transitionCard("card_999999", "frozen", [], later)).toEqual({
      ok: false,
      reason: "not_found",
    })
  })
})

describe("publicCard", () => {
  it("drops the idempotency key and keeps the reference", () => {
    const { cards } = issued()
    const shown = publicCard(cards[0])
    expect("requestId" in shown).toBe(false)
    expect(shown.numberRef).toBe(cards[0].numberRef)
    expect(shown.last4).toBe(cards[0].last4)
  })
})

describe("listCards and cardById", () => {
  it("lists newest first and finds by id", () => {
    const cards: Card[] = []
    issueCard(request, cards, now)
    issueCard({ ...request, requestId: "req-2" }, cards, later)
    expect(listCards(cards).map((card) => card.id)).toEqual([
      "card_000002",
      "card_000001",
    ])
    expect(cardById("card_000001", cards)?.requestId).toBe("req-1")
    expect(cardById("card_000009", cards)).toBeUndefined()
  })
})

describe("seeded cards", () => {
  it("boots with five cards spanning the state machine", () => {
    expect(store.cards).toHaveLength(5)
    const statuses = new Set(store.cards.map((card) => card.status))
    expect(statuses).toEqual(new Set(["active", "frozen", "cancelled"]))
  })

  it("obeys every card rule, including the fixture rule", () => {
    for (const card of store.cards) {
      const merchant = merchantById(card.merchantId)
      expect(merchant).toBeDefined()
      expect(card.currency).toBe(merchant!.currency)
      expect(card.last4).toMatch(/^\d{4}$/)
      expect(card.numberRef).toMatch(/^cref_\d{12}$/)
      expect(Number.isInteger(card.limit) && card.limit > 0).toBe(true)
      expect(card.limit).toBeLessThanOrEqual(CARD_LIMIT_MAX)
      expect(Number.isInteger(card.spent) && card.spent >= 0).toBe(true)
      expect(card.events[0]?.type).toBe("issued")
    }
  })

  it("includes one card past eighty percent of its limit", () => {
    expect(store.cards.some((card) => isNearLimit(card.spent, card.limit))).toBe(true)
  })

  it("was generated after the rest of the dataset, which is unchanged", () => {
    expect(store.payments).toHaveLength(1658)
    expect(store.payments[0]).toMatchObject({ id: "pay_000001", amount: 2978 })
    expect(store.payouts.at(-1)).toMatchObject({ id: "po_0080", net: 360172 })
  })
})
