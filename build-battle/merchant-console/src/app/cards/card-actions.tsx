"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
import { CardStatus } from "@/data/types"
import { maskCardNumber } from "@/lib/cards"
import { useRouter } from "next/navigation"
import { useState } from "react"

/**
 * Freeze, unfreeze, or cancel a card from the list or the detail page.
 *
 * A transition is a PATCH followed by router.refresh(), which re-renders the
 * server components in place — no document reload. The state machine is
 * guarded on the server; these buttons only offer what it allows, and a
 * cancelled card offers nothing, because nothing comes back from it.
 */
export function CardActions({
  id,
  nickname,
  last4,
  status,
}: {
  id: string
  nickname: string
  last4: string
  status: CardStatus
}) {
  const router = useRouter()
  const [pending, setPending] = useState<CardStatus | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)

  if (status === "cancelled") return null

  const label = `${nickname} (${maskCardNumber(last4)})`

  const transition = async (to: CardStatus) => {
    setPending(to)
    setMessage(null)
    try {
      const response = await fetch(`/api/cards/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: to }),
      })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        setMessage(body.message ?? "The change was not saved.")
        return
      }
      setConfirming(false)
      router.refresh()
    } catch {
      setMessage("Could not reach the console. Try again.")
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {status === "active" ? (
          <Button
            variant="secondary"
            className="py-1"
            disabled={pending !== null}
            onClick={() => transition("frozen")}
            aria-label={`Freeze ${label}`}
          >
            {pending === "frozen" ? "Freezing…" : "Freeze"}
          </Button>
        ) : (
          <Button
            variant="secondary"
            className="py-1"
            disabled={pending !== null}
            onClick={() => transition("active")}
            aria-label={`Unfreeze ${label}`}
          >
            {pending === "active" ? "Unfreezing…" : "Unfreeze"}
          </Button>
        )}

        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              className="py-1 text-red-600 hover:text-red-700 dark:text-red-500 dark:hover:text-red-400"
              disabled={pending !== null}
              aria-label={`Cancel ${label}`}
            >
              Cancel card
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Cancel {nickname}?</DialogTitle>
              <DialogDescription>
                {maskCardNumber(last4)} stops working immediately and cannot be
                reactivated. Anything charged to it after this is declined.
              </DialogDescription>
            </DialogHeader>
            {message && (
              <p role="alert" className="px-6 text-sm text-red-600 dark:text-red-500">
                {message}
              </p>
            )}
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="secondary" className="py-1.5">
                  Keep card
                </Button>
              </DialogClose>
              <Button
                variant="destructive"
                className="py-1.5"
                disabled={pending !== null}
                onClick={() => transition("cancelled")}
              >
                {pending === "cancelled" ? "Cancelling…" : "Cancel card"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {message && !confirming && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-500">
          {message}
        </p>
      )}
    </div>
  )
}
