import { Divider } from "@/components/Divider"
import { StatusBadge } from "@/components/ui/payments/StatusBadge"
import { cardById } from "@/data/cards"
import { merchantById } from "@/data/merchants"
import { CardEventType } from "@/data/types"
import { isNearLimit, maskCardNumber, spendPercent } from "@/lib/cards"
import { formatInZone } from "@/lib/dates"
import { formatMoney } from "@/lib/money"
import { cx } from "@/lib/utils"
import Link from "next/link"
import { notFound } from "next/navigation"
import { CardActions } from "../card-actions"
import { CATEGORY_LABELS } from "../labels"

const EVENT_LABELS: Record<CardEventType, string> = {
  issued: "Issued",
  frozen: "Frozen",
  unfrozen: "Unfrozen",
  cancelled: "Cancelled",
}

const EVENT_DOTS: Record<CardEventType, string> = {
  issued: "bg-emerald-500",
  frozen: "bg-blue-500",
  unfrozen: "bg-emerald-500",
  cancelled: "bg-gray-500",
}

export default async function CardDetail({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const card = cardById(id)
  if (!card) notFound()

  const merchant = merchantById(card.merchantId)!
  const percent = spendPercent(card.spent, card.limit)
  const nearLimit = isNearLimit(card.spent, card.limit)
  const remaining = Math.max(0, card.limit - card.spent)
  const history = [...card.events].sort((a, b) => a.at.localeCompare(b.at))

  return (
    <div className="p-4 sm:p-6">
      <Link
        href="/cards"
        className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-50"
      >
        ← All cards
      </Link>

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
              {card.nickname}
            </h1>
            <StatusBadge status={card.status} />
          </div>
          <p className="mt-1 font-mono text-sm text-gray-500">
            {maskCardNumber(card.last4)} · {card.id}
          </p>
        </div>
        <CardActions
          id={card.id}
          nickname={card.nickname}
          last4={card.last4}
          status={card.status}
        />
      </div>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        Spend against limit
      </h2>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-xl font-semibold tabular-nums text-gray-900 dark:text-gray-50">
          {formatMoney(card.spent, card.currency)}
        </p>
        <p className="text-sm tabular-nums text-gray-500">
          {percent}% of {formatMoney(card.limit, card.currency)} ·{" "}
          {formatMoney(remaining, card.currency)} remaining
        </p>
      </div>
      <progress
        value={percent}
        max={100}
        aria-label="Spend against limit"
        className={cx(
          "mt-2 h-2 w-full appearance-none overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800",
          "[&::-webkit-progress-bar]:rounded-full [&::-webkit-progress-bar]:bg-gray-200 dark:[&::-webkit-progress-bar]:bg-gray-800",
          "[&::-moz-progress-bar]:rounded-full [&::-webkit-progress-value]:rounded-full",
          nearLimit
            ? "[&::-moz-progress-bar]:bg-amber-500 [&::-webkit-progress-value]:bg-amber-500"
            : "[&::-moz-progress-bar]:bg-blue-500 [&::-webkit-progress-value]:bg-blue-500",
        )}
      />
      {nearLimit ? (
        <p className="mt-2 text-sm text-amber-700 dark:text-amber-500">
          Past 80% of the limit.
        </p>
      ) : card.spent === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          No spend recorded. The console does not receive card transactions,
          so a card issued here stays at zero.
        </p>
      ) : null}

      <Divider />

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Merchant">
          {merchant.name}
          <span className="ml-2 text-gray-500">{merchant.country}</span>
        </Field>
        <Field label="Number">{maskCardNumber(card.last4)}</Field>
        <Field label="Number reference">
          <span className="font-mono text-sm">{card.numberRef}</span>
        </Field>
        <Field label="Spend limit">
          {formatMoney(card.limit, card.currency)}
          <span className="ml-2 text-gray-500">{card.currency}</span>
        </Field>
        <Field label="Category lock">
          {card.categoryLock ? CATEGORY_LABELS[card.categoryLock] : "No lock"}
        </Field>
        <Field label="Created (UTC)">
          <span className="font-mono text-sm">{card.createdAt}</span>
        </Field>
        <Field label={`Created (${merchant.timezone})`}>
          {formatInZone(card.createdAt, merchant.timezone)}
        </Field>
      </dl>

      <Divider />

      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
        History
      </h2>
      <ol className="mt-4 space-y-4">
        {history.map((event) => (
          <li key={`${event.at}-${event.type}`} className="flex gap-3">
            <span
              className={cx("mt-1.5 size-2 shrink-0 rounded-full", EVENT_DOTS[event.type])}
              aria-hidden="true"
            />
            <div>
              <p className="text-sm text-gray-900 dark:text-gray-50">
                {EVENT_LABELS[event.type]}
              </p>
              <p className="text-sm text-gray-500">
                {formatInZone(event.at, merchant.timezone)}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900 dark:text-gray-50">{children}</dd>
    </div>
  )
}
