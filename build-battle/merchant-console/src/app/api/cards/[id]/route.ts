import { cardById, publicCard, transitionCard } from "@/data/cards"
import { isCardStatus } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * One card: read it, or move it through the state machine. The guard lives
 * in `transitionCard`, not here and not in the UI, so a hand-built PATCH
 * cannot bring a cancelled card back.
 */

type Context = { params: Promise<{ id: string }> }

function respond(message: string, status: number) {
  return NextResponse.json({ message }, { status })
}

export async function GET(_request: NextRequest, { params }: Context) {
  const { id } = await params
  const card = cardById(id)
  if (!card) return respond("Card not found", 404)
  return NextResponse.json({ card: publicCard(card) })
}

export async function PATCH(request: NextRequest, { params }: Context) {
  const { id } = await params

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return respond("Body must be JSON", 400)
  }

  const status =
    typeof body === "object" && body !== null
      ? (body as { status?: unknown }).status
      : undefined
  if (!isCardStatus(status)) {
    return respond("Status must be active, frozen, or cancelled", 400)
  }

  const result = transitionCard(id, status)
  if (!result.ok) {
    if (result.reason === "not_found") return respond("Card not found", 404)
    const current = cardById(id)!.status
    return respond(`Cannot change a ${current} card to ${status}`, 409)
  }
  return NextResponse.json({ card: publicCard(result.card) })
}
