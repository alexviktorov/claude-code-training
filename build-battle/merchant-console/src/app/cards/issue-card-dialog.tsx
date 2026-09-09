"use client"

import { Button } from "@/components/Button"
import {
  Dialog,
  DialogBody,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/Dialog"
import { Input } from "@/components/Input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/Select"
import { CardCategory, Currency } from "@/data/types"
import {
  CARD_CATEGORIES,
  CURRENCIES,
  maskCardNumber,
  newRequestId,
} from "@/lib/cards"
import { parseAmountToMinorUnits } from "@/lib/money"
import { Plus } from "lucide-react"
import { useRouter } from "next/navigation"
import { FormEvent, useState } from "react"
import { CATEGORY_LABELS } from "./labels"

/**
 * Issue a card in two steps: the form, then the one-time reveal.
 *
 * The number arrives in the 201 and is held in state only while the reveal
 * step is open; closing the dialog resets everything. A request id is minted
 * when the dialog opens and reused across a corrected 400 or a retry, so a
 * double submit or a retry after a timeout cannot mint two cards — the server
 * answers the retry with the card already issued, and no number.
 */

type Merchant = { id: string; name: string; currency: Currency }

type Step =
  | { kind: "form" }
  | { kind: "revealed"; nickname: string; number: string; last4: string }
  | { kind: "replayed"; nickname: string; last4: string }

type Field = "nickname" | "merchant" | "limit" | "currency" | "category"

/** Which field a server message is about, so the error can be announced next to it. */
function fieldFor(message: string): Field | null {
  if (message.startsWith("Nickname")) return "nickname"
  if (message.startsWith("Choose a merchant")) return "merchant"
  if (message.startsWith("Limit") || message.startsWith("Enter the limit")) return "limit"
  if (message.startsWith("Currency")) return "currency"
  if (message.startsWith("Unknown category")) return "category"
  return null
}

/** Group digits in fours for reading aloud. Display only. */
const groupDigits = (number: string) => number.replace(/(\d{4})(?=\d)/g, "$1 ")

const labelStyles = "text-sm font-medium text-gray-900 dark:text-gray-50"
const hintStyles = "text-xs text-gray-500 dark:text-gray-500"

export function IssueCardDialog({ merchants }: { merchants: Merchant[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>({ kind: "form" })
  const [requestId, setRequestId] = useState("")
  const [pending, setPending] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [nickname, setNickname] = useState("")
  const [merchantId, setMerchantId] = useState("")
  const [currency, setCurrency] = useState<Currency>("USD")
  const [limit, setLimit] = useState("")
  const [category, setCategory] = useState<CardCategory | "none">("none")

  const errorField = message ? fieldFor(message) : null
  const describedBy = (field: Field) =>
    errorField === field ? "issue-card-message" : undefined

  const reset = () => {
    setStep({ kind: "form" })
    setRequestId("")
    setPending(false)
    setMessage(null)
    setNickname("")
    setMerchantId("")
    setCurrency("USD")
    setLimit("")
    setCategory("none")
  }

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (next) setRequestId(newRequestId())
    else reset()
  }

  const chooseMerchant = (id: string) => {
    setMerchantId(id)
    const merchant = merchants.find((candidate) => candidate.id === id)
    if (merchant) setCurrency(merchant.currency)
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const minorUnits = parseAmountToMinorUnits(limit)
    if (minorUnits === null) {
      setMessage("Enter the limit as an amount, like 250.00")
      return
    }

    setPending(true)
    setMessage(null)
    try {
      const response = await fetch("/api/cards", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          nickname,
          merchantId,
          currency,
          limit: minorUnits,
          categoryLock: category === "none" ? null : category,
          requestId,
        }),
      })
      const body = await response.json()
      if (!response.ok) {
        setMessage(body.message ?? "The card could not be issued.")
        return
      }
      router.refresh()
      if (body.replayed) {
        setStep({ kind: "replayed", nickname: body.card.nickname, last4: body.card.last4 })
      } else {
        setStep({
          kind: "revealed",
          nickname: body.card.nickname,
          number: body.number,
          last4: body.card.last4,
        })
      }
    } catch {
      setMessage("Could not reach the console. Check the connection and try again.")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button className="w-full gap-2 py-1.5 sm:w-fit">
          <Plus className="-ml-0.5 size-4 shrink-0" aria-hidden="true" />
          Issue card
        </Button>
      </DialogTrigger>

      <DialogContent>
        {step.kind === "form" && (
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle>Issue a virtual card</DialogTitle>
              <DialogDescription>
                Single-merchant, virtual, with a spend limit from the moment it
                exists. The full number is shown once, right after.
              </DialogDescription>
            </DialogHeader>

            <DialogBody className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="card-nickname" className={labelStyles}>
                  Nickname
                </label>
                <Input
                  id="card-nickname"
                  name="nickname"
                  value={nickname}
                  onChange={(event) => setNickname(event.target.value)}
                  maxLength={40}
                  placeholder="Ad spend — Meta"
                  hasError={errorField === "nickname"}
                  aria-invalid={errorField === "nickname" || undefined}
                  aria-describedby={describedBy("nickname")}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="card-merchant" className={labelStyles}>
                  Merchant
                </label>
                <Select value={merchantId} onValueChange={chooseMerchant}>
                  <SelectTrigger
                    id="card-merchant"
                    aria-invalid={errorField === "merchant" || undefined}
                    aria-describedby={describedBy("merchant")}
                  >
                    <SelectValue placeholder="Choose a merchant" />
                  </SelectTrigger>
                  <SelectContent>
                    {merchants.map((merchant) => (
                      <SelectItem key={merchant.id} value={merchant.id}>
                        {merchant.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="card-limit" className={labelStyles}>
                    Spend limit
                  </label>
                  <Input
                    id="card-limit"
                    name="limit"
                    inputMode="decimal"
                    value={limit}
                    onChange={(event) => setLimit(event.target.value)}
                    placeholder="250.00"
                    hasError={errorField === "limit"}
                    aria-invalid={errorField === "limit" || undefined}
                    aria-describedby={describedBy("limit") ?? "card-limit-hint"}
                  />
                  <p id="card-limit-hint" className={hintStyles}>
                    In {currency}. Up to 50,000.00.
                  </p>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="card-currency" className={labelStyles}>
                    Currency
                  </label>
                  <Select
                    value={currency}
                    onValueChange={(value) => setCurrency(value as Currency)}
                  >
                    <SelectTrigger
                      id="card-currency"
                      aria-invalid={errorField === "currency" || undefined}
                      aria-describedby={describedBy("currency") ?? "card-currency-hint"}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((code) => (
                        <SelectItem key={code} value={code}>
                          {code}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p id="card-currency-hint" className={hintStyles}>
                    Follows the merchant&apos;s settlement currency.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="card-category" className={labelStyles}>
                  Category lock
                </label>
                <Select
                  value={category}
                  onValueChange={(value) => setCategory(value as CardCategory | "none")}
                >
                  <SelectTrigger
                    id="card-category"
                    aria-invalid={errorField === "category" || undefined}
                    aria-describedby={describedBy("category")}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No lock</SelectItem>
                    {CARD_CATEGORIES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {CATEGORY_LABELS[code]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {message && (
                <p
                  id="issue-card-message"
                  role="alert"
                  className="text-sm text-red-600 dark:text-red-500"
                >
                  {message}
                </p>
              )}
            </DialogBody>

            <DialogFooter>
              <DialogClose asChild>
                <Button type="button" variant="secondary" className="py-1.5">
                  Cancel
                </Button>
              </DialogClose>
              <Button type="submit" className="py-1.5" disabled={pending}>
                {pending ? "Issuing…" : "Issue card"}
              </Button>
            </DialogFooter>
          </form>
        )}

        {step.kind === "revealed" && (
          <>
            <DialogHeader>
              <DialogTitle>Card issued</DialogTitle>
              <DialogDescription>
                {step.nickname} is active. This is the only time the full number
                is shown — after this it appears as {maskCardNumber(step.last4)}{" "}
                everywhere in the console.
              </DialogDescription>
            </DialogHeader>
            <DialogBody>
              <p
                aria-live="polite"
                className="rounded-md bg-gray-50 px-4 py-3 text-center font-mono text-2xl tracking-wider text-gray-900 dark:bg-gray-900 dark:text-gray-50"
              >
                {groupDigits(step.number)}
              </p>
            </DialogBody>
            <DialogFooter>
              <Button className="py-1.5" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}

        {step.kind === "replayed" && (
          <>
            <DialogHeader>
              <DialogTitle>Already issued</DialogTitle>
              <DialogDescription>
                {step.nickname} was issued as {maskCardNumber(step.last4)} by an
                earlier submit of this same request. The full number was shown
                once then and cannot be recovered; if it was lost, cancel that
                card and issue a new one.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="py-1.5" onClick={() => onOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
