import { merchantById } from "@/data/merchants"
import {
  CardCategory,
  CardEventType,
  CardStatus,
  Currency,
} from "@/data/types"

/**
 * Virtual cards: number generation, masking, the status state machine, and
 * request validation. Pure and client-safe — no Node imports — so pages and
 * client components can share the allowlists and the mask. Anything that
 * touches the store lives in `src/data/cards.ts`.
 */

/** Every generated number starts here. Nothing in this repo may look like a real PAN. */
export const CARD_BIN = "4242"
export const CARD_NUMBER_LENGTH = 16
/** Ticket NWP-201: no card above 5,000,000 minor units. */
export const CARD_LIMIT_MAX = 5_000_000
export const CARD_NICKNAME_MAX = 40

export const CURRENCIES = ["USD", "EUR", "GBP"] as const satisfies readonly Currency[]

export const CARD_STATUSES = [
  "active",
  "frozen",
  "cancelled",
] as const satisfies readonly CardStatus[]

export const isCardStatus = (value: unknown): value is CardStatus =>
  typeof value === "string" && (CARD_STATUSES as readonly string[]).includes(value)

export const CARD_CATEGORIES = [
  "advertising",
  "software",
  "travel",
  "contractors",
  "utilities",
  "office",
] as const satisfies readonly CardCategory[]

/**
 * Luhn sum, walking the digits from the right. `doubleEven` says whether
 * even positions (0 = rightmost) are the doubled ones: they are when the
 * string is a partial awaiting its check digit, not when it is complete.
 */
function luhnSum(digits: string, doubleEven: boolean): number {
  let sum = 0
  for (let i = 0; i < digits.length; i++) {
    let digit = Number(digits[digits.length - 1 - i])
    if ((i % 2 === 0) === doubleEven) {
      digit *= 2
      if (digit > 9) digit -= 9
    }
    sum += digit
  }
  return sum
}

export function luhnCheckDigit(partial: string): string {
  return String((10 - (luhnSum(partial, true) % 10)) % 10)
}

export function isLuhnValid(number: string): boolean {
  if (!/^\d+$/.test(number)) return false
  return luhnSum(number, false) % 10 === 0
}

/**
 * Mint a number on the test BIN with a valid check digit, plus an opaque
 * reference to store in its place. The random source is injected: the store
 * passes a CSPRNG, the seed passes its PRNG, tests pass a fixed sequence.
 */
export function generateCardNumber(random: () => number): {
  number: string
  last4: string
  reference: string
} {
  const digit = () => String(Math.floor(random() * 10) % 10)

  let partial = CARD_BIN
  while (partial.length < CARD_NUMBER_LENGTH - 1) partial += digit()
  const number = partial + luhnCheckDigit(partial)

  let reference = "cref_"
  while (reference.length < "cref_".length + 12) reference += digit()

  return { number, last4: number.slice(-4), reference }
}

/** How a card number appears anywhere other than the creation response. */
export function maskCardNumber(last4: string): string {
  return `•••• ${last4}`
}

/** `active ⇄ frozen`, either to `cancelled`, and `cancelled` is terminal. */
const TRANSITIONS: Record<CardStatus, readonly CardStatus[]> = {
  active: ["frozen", "cancelled"],
  frozen: ["active", "cancelled"],
  cancelled: [],
}

export function canTransition(from: CardStatus, to: CardStatus): boolean {
  return TRANSITIONS[from].includes(to)
}

const EVENTS: Record<CardStatus, CardEventType> = {
  active: "unfrozen",
  frozen: "frozen",
  cancelled: "cancelled",
}

/** The audit event a transition into `to` records. */
export function eventFor(to: CardStatus): CardEventType {
  return EVENTS[to]
}

/** Past eighty percent of the limit, in integer arithmetic — no division. */
export function isNearLimit(spent: number, limit: number): boolean {
  return limit > 0 && spent * 5 >= limit * 4
}

/** Whole-percent width for a progress bar. Display only; clamps at 100. */
export function spendPercent(spent: number, limit: number): number {
  if (limit <= 0) return 0
  return Math.min(100, Math.floor((spent * 100) / limit))
}

/**
 * Idempotency key for one issue attempt. `randomUUID` needs a secure context,
 * which a LAN `http://` origin is not; `getRandomValues` does not.
 */
export function newRequestId(): string {
  const webCrypto = globalThis.crypto
  if (typeof webCrypto.randomUUID === "function") return webCrypto.randomUUID()
  const bytes = new Uint8Array(16)
  webCrypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export interface IssueRequest {
  nickname: string
  merchantId: string
  currency: Currency
  /** Integer minor units. */
  limit: number
  categoryLock: CardCategory | null
  requestId: string
}

export type IssueValidation =
  | { ok: true; value: IssueRequest }
  | { ok: false; message: string }

const reject = (message: string): IssueValidation => ({ ok: false, message })

const isCurrency = (value: unknown): value is Currency =>
  typeof value === "string" && (CURRENCIES as readonly string[]).includes(value)

const isCategory = (value: unknown): value is CardCategory =>
  typeof value === "string" &&
  (CARD_CATEGORIES as readonly string[]).includes(value)

/**
 * Check an issue request from the client against the allowlists. Rejects
 * early and returns, in the ticket's order: merchant, limit, currency. The
 * message is safe to show ops as written.
 */
export function validateIssueRequest(body: unknown): IssueValidation {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return reject("Request body must be an object")
  }
  const input = body as Record<string, unknown>

  const merchant =
    typeof input.merchantId === "string" ? merchantById(input.merchantId) : undefined
  if (!merchant) return reject("Choose a merchant")

  const { limit } = input
  if (typeof limit !== "number" || !Number.isInteger(limit)) {
    return reject("Limit must be a whole number of minor units")
  }
  if (limit <= 0) return reject("Limit must be greater than zero")
  if (limit > CARD_LIMIT_MAX) {
    return reject("Limit cannot exceed 5,000,000 minor units")
  }

  if (!isCurrency(input.currency)) {
    return reject("Currency must be USD, EUR, or GBP")
  }
  if (input.currency !== merchant.currency) {
    return reject(`Currency must match the merchant's currency (${merchant.currency})`)
  }

  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : ""
  if (!nickname) return reject("Nickname is required")
  if (nickname.length > CARD_NICKNAME_MAX) {
    return reject(`Nickname must be ${CARD_NICKNAME_MAX} characters or fewer`)
  }

  const categoryLock = input.categoryLock ?? null
  if (categoryLock !== null && !isCategory(categoryLock)) {
    return reject("Unknown category")
  }

  if (typeof input.requestId !== "string" || !input.requestId) {
    return reject("Request id is required")
  }

  return {
    ok: true,
    value: {
      nickname,
      merchantId: merchant.id,
      currency: input.currency,
      limit,
      categoryLock,
      requestId: input.requestId,
    },
  }
}
