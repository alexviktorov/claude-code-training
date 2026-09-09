import { issueCard, listCards, publicCard } from "@/data/cards"
import { validateIssueRequest } from "@/lib/cards"
import { NextRequest, NextResponse } from "next/server"

/**
 * Issue and list virtual cards.
 *
 * Everything in the body arrives from the client and is checked against the
 * allowlists in `validateIssueRequest` before it reaches the store. The full
 * card number exists in exactly one response: the 201 from POST. A replayed
 * request id returns the card already issued for it, and no number.
 */

function badRequest(message: string) {
  return NextResponse.json({ message }, { status: 400 })
}

export function GET() {
  return NextResponse.json({ cards: listCards().map(publicCard) })
}

export async function POST(request: NextRequest) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return badRequest("Body must be JSON")
  }

  const validation = validateIssueRequest(body)
  if (!validation.ok) return badRequest(validation.message)

  const result = issueCard(validation.value)
  if (result.replayed) {
    return NextResponse.json({ card: publicCard(result.card), replayed: true })
  }
  return NextResponse.json(
    { card: publicCard(result.card), number: result.number, replayed: false },
    { status: 201 },
  )
}
