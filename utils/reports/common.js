// Shared rules for the reports: money in whole cents, PocketBase times, sales and their lines
export const toCents = value => Math.round(Number(value) * 100)
export const toEuros = cents => cents / 100

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/

// 'YYYY-MM-DD' is a local calendar day (its local midnight). Anything else is a point in time:
// ISO ('…T…Z') or PocketBase's 'YYYY-MM-DD HH:MM:SS.sssZ'. Returns null for empty or unreadable values.
export function toDate (value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (!value) return null
  const day = String(value).match(DAY)
  const date = day
    ? new Date(Number(day[1]), Number(day[2]) - 1, Number(day[3]))
    : new Date(String(value).replace(' ', 'T'))
  return Number.isNaN(date.getTime()) ? null : date
}

// Expenses are negative amounts and never count as sales
export const isIncome = transaction => Number(transaction.amount) > 0
// PocketBase returns an empty json field as null; entries from before line data have no items at all
export const linesOf = transaction => (Array.isArray(transaction?.items) ? transaction.items : [])
export const hasLines = transaction => linesOf(transaction).length > 0
// When the sale happened: sold_at, else the record's created stamp; null for entries with neither
export const saleTime = transaction => toDate(transaction.sold_at) ?? toDate(transaction.created)
// A line's takings: its total less its share of the deal savings
export const lineCents = line => toCents(line.lineTotal) - toCents(line.discount)

const OVERSOLD = /oversold by (\d+)/
// Units a sale movement stands for: what left stock plus what was oversold (stock stops at 0, the rest is noted)
export const soldUnits = movement => (movement.reason === 'sale'
  ? -Number(movement.change) + Number(String(movement.note ?? '').match(OVERSOLD)?.[1] ?? 0)
  : 0)
