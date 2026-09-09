import {
  IssueRequest,
  canTransition,
  eventFor,
  generateCardNumber,
} from "@/lib/cards"
import { pad } from "./generate"
import { store } from "./store"
import { Card, CardStatus } from "./types"

/**
 * Store operations for virtual cards. Every function takes its collection as
 * a trailing parameter defaulting to the store, so tests work on a fresh
 * array and never touch the seed.
 *
 * The number exists only in `issueCard`'s return value. The record carries
 * the last four and an opaque reference, so no route has to strip anything.
 * This module is server-side only — nothing under `"use client"` imports it.
 */

/** CSPRNG in [0, 1), for minting. The seed uses its own PRNG; tests inject a sequence. */
function secureRandom(): number {
  const [value] = globalThis.crypto.getRandomValues(new Uint32Array(1))
  return value / 2 ** 32
}

/** Newest first. */
export function listCards(cards: Card[] = store.cards): Card[] {
  return [...cards].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id),
  )
}

export function cardById(
  id: string,
  cards: Card[] = store.cards,
): Card | undefined {
  return cards.find((card) => card.id === id)
}

function nextCardId(cards: Card[]): string {
  const highest = cards.reduce(
    (max, card) => Math.max(max, Number(card.id.slice("card_".length)) || 0),
    0,
  )
  return `card_${pad(highest + 1)}`
}

export type IssueResult =
  | { replayed: false; card: Card; number: string }
  | { replayed: true; card: Card }

/**
 * Mint a card. A repeated `requestId` — a double-click, a retry after a
 * timeout — returns the card already issued for it and does not mint again.
 * The replay carries no number: it was shown once, and storing it to show it
 * twice is the one thing this feature must never do.
 */
export function issueCard(
  input: IssueRequest,
  cards: Card[] = store.cards,
  now = new Date(),
): IssueResult {
  const existing = cards.find((card) => card.requestId === input.requestId)
  if (existing) return { replayed: true, card: existing }

  const { number, last4, reference } = generateCardNumber(secureRandom)
  const at = now.toISOString()
  const card: Card = {
    id: nextCardId(cards),
    merchantId: input.merchantId,
    nickname: input.nickname,
    last4,
    numberRef: reference,
    limit: input.limit,
    spent: 0,
    currency: input.currency,
    status: "active",
    categoryLock: input.categoryLock,
    requestId: input.requestId,
    createdAt: at,
    events: [{ at, type: "issued" }],
  }
  cards.push(card)
  return { replayed: false, card, number }
}

export type TransitionResult =
  | { ok: true; card: Card }
  | { ok: false; reason: "not_found" | "illegal_transition" }

/** Move a card through the state machine, recording the event. Guarded here, not only in the UI. */
export function transitionCard(
  id: string,
  to: CardStatus,
  cards: Card[] = store.cards,
  now = new Date(),
): TransitionResult {
  const card = cardById(id, cards)
  if (!card) return { ok: false, reason: "not_found" }
  if (!canTransition(card.status, to)) {
    return { ok: false, reason: "illegal_transition" }
  }
  card.status = to
  card.events.push({ at: now.toISOString(), type: eventFor(to) })
  return { ok: true, card }
}

export type PublicCard = Omit<Card, "requestId">

/** What leaves the server. The idempotency key is client → server only. */
export function publicCard(card: Card): PublicCard {
  return {
    id: card.id,
    merchantId: card.merchantId,
    nickname: card.nickname,
    last4: card.last4,
    numberRef: card.numberRef,
    limit: card.limit,
    spent: card.spent,
    currency: card.currency,
    status: card.status,
    categoryLock: card.categoryLock,
    createdAt: card.createdAt,
    events: card.events,
  }
}
