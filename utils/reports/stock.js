// Stock tab: stock value, what runs out first, printed vs sold, and commission figures
import { UNKNOWN_ARTICLE } from '../commissions.js'
import { effectivePrice } from '../pricing.js'
import { toCents, toEuros, toDate, soldUnits } from './common.js'
import { inPeriod } from './period.js'

const DAY_MS = 86_400_000
// "Runs out in" uses the average daily units sold over this many days
export const RECENT_DAYS = 30
const OPEN = ['open', 'printing', 'ready']

const isActive = article => article.active !== false
const categoryOf = (article, categories) => categories.find(category => category.id === article.category) ?? article.expand?.category
const stockOf = article => Math.max(0, Number(article.stock) || 0)

// Σ stock × current price (the article's override, else its category's base price) over active articles
export function stockValue (articles, categories = []) {
  const cents = articles.filter(isActive)
    .reduce((sum, article) => sum + toCents(effectivePrice(article, categoryOf(article, categories))) * stockOf(article), 0)
  return toEuros(cents)
}

// Active articles by days of stock left at the last RECENT_DAYS days' pace, fewest first.
// Articles without a sale in that time are not listed.
export function runsOutSoonest ({ articles, movements, now = new Date(), limit = 5 }) {
  const from = now.getTime() - RECENT_DAYS * DAY_MS
  const sold = new Map()
  for (const movement of movements) {
    const at = toDate(movement.created)
    if (!at || at.getTime() <= from || at > now) continue
    sold.set(movement.article, (sold.get(movement.article) ?? 0) + soldUnits(movement))
  }
  return articles
    .filter(article => isActive(article) && sold.get(article.id) > 0)
    .map((article) => {
      const perDay = sold.get(article.id) / RECENT_DAYS
      return { id: article.id, name: article.name, stock: stockOf(article), days: Math.round(stockOf(article) / perDay) }
    })
    .sort((a, b) => a.days - b.days || a.name.localeCompare(b.name))
    .slice(0, limit)
}

// Units printed and sold per article in the period, busiest first
export function printedVsSold (movements, range, articles = []) {
  const rows = new Map()
  for (const movement of movements) {
    if (!inPeriod(movement.created, range)) continue
    const printed = movement.reason === 'printed' ? Number(movement.change) : 0
    const sold = soldUnits(movement)
    if (!printed && !sold) continue
    const name = articles.find(article => article.id === movement.article)?.name ?? movement.expand?.article?.name ?? UNKNOWN_ARTICLE
    const row = rows.get(movement.article) ?? { id: movement.article, name, printed: 0, sold: 0 }
    row.printed += printed
    row.sold += sold
    rows.set(movement.article, row)
  }
  const list = [...rows.values()].sort((a, b) => b.printed + b.sold - (a.printed + a.sold) || a.name.localeCompare(b.name))
  return {
    rows: list,
    printed: list.reduce((sum, row) => sum + row.printed, 0),
    sold: list.reduce((sum, row) => sum + row.sold, 0)
  }
}

// Open value (open, printing and ready, whenever created), the value delivered in the period and the
// average days from created to delivered for those, to one decimal (null when none was delivered)
export function commissionFigures (commissions, range) {
  const open = commissions.filter(commission => OPEN.includes(commission.status))
  const delivered = commissions.filter(commission => commission.status === 'delivered' && inPeriod(commission.delivered_at, range))
  const spans = delivered
    .map(commission => [toDate(commission.created), toDate(commission.delivered_at)])
    .filter(([created, done]) => created && done)
    .map(([created, done]) => (done - created) / DAY_MS)
  const value = list => toEuros(list.reduce((sum, commission) => sum + toCents(commission.agreed_price), 0))
  return {
    openCount: open.length,
    openValue: value(open),
    deliveredCount: delivered.length,
    deliveredValue: value(delivered),
    averageDays: spans.length ? Math.round(spans.reduce((sum, days) => sum + days, 0) / spans.length * 10) / 10 : null
  }
}
