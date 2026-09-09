import { CardCategory } from "@/data/types"

/** Display names for the category lock. The allowlist itself lives in `src/lib/cards.ts`. */
export const CATEGORY_LABELS: Record<CardCategory, string> = {
  advertising: "Advertising",
  software: "Software",
  travel: "Travel",
  contractors: "Contractors",
  utilities: "Utilities",
  office: "Office",
}
