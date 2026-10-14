// Sales tab: what sells best in the period. Revenue comes from sale lines; units from lines plus, for
// older sales without lines, their stock movements.
import { UNKNOWN_ARTICLE } from '../commissions.js'
import { toCents, toEuros, toDate, isIncome, hasLines, linesOf, lineCents, saleTime, soldUnits } from './common.js'
import { inPeriod } from './period.js'

// Units whose category is unknown (a commission line for an article that was already gone) group here
export const OTHER_CATEGORY = 'Other'

const byRevenue = (a, b) => b.revenue - a.revenue || b.units - a.units || a.name.localeCompare(b.name)
const byUnits = (a, b) => b.units - a.units || b.revenue - a.revenue || a.name.localeCompare(b.name)
export const sortRows = (rows, key = 'revenue') => [...rows].sort(key === 'units' ? byUnits : byRevenue)

// Sale movements logged before the first sale with lines reached the server belong to older sales;
// later ones are already counted in lines. The record's created stamp is server time, like the movements'.
const lineDataStart = (transactions) => {
  const times = transactions.filter(hasLines).map(sale => toDate(sale.created) ?? saleTime(sale)).filter(Boolean)
  return times.length ? Math.min(...times.map(date => date.getTime())) : Infinity
}

export function salesSummary ({ transactions, movements = [], articles = [], categories = [], deals = [], range }) {
  const sales = transactions.filter(sale => isIncome(sale) && inPeriod(sale.date, range))
  const articleRows = new Map()
  const categoryRows = new Map()
  const dealRows = new Map()
  const categoryName = (id, fallback) => categories.find(category => category.id === id)?.name || fallback || OTHER_CATEGORY
  const add = (rows, id, name, cents, units) => {
    const row = rows.get(id) ?? { id, name, cents: 0, units: 0 }
    row.cents += cents
    row.units += units
    rows.set(id, row)
  }

  for (const sale of sales) {
    const counted = new Set()
    for (const line of linesOf(sale)) {
      const cents = lineCents(line)
      const units = Number(line.quantity)
      const name = articles.find(article => article.id === line.article)?.name ?? line.name ?? UNKNOWN_ARTICLE
      add(articleRows, line.article, name, cents, units)
      add(categoryRows, line.category || '', categoryName(line.category, line.categoryName), cents, units)
      if (!line.deal) continue
      // A deal counts once per sale, however many of its lines it covered. It is named as it is
      // called now, else as it was called at the sale.
      const dealName = deals.find(item => item.id === line.deal)?.name ?? line.dealName
      const deal = dealRows.get(line.deal) ?? { id: line.deal, name: dealName, times: 0, discountCents: 0 }
      deal.discountCents += toCents(line.discount)
      if (!counted.has(line.deal)) deal.times++
      counted.add(line.deal)
      dealRows.set(line.deal, deal)
    }
  }

  const start = lineDataStart(transactions)
  for (const movement of movements) {
    const at = toDate(movement.created)
    if (movement.reason !== 'sale' || !at || at.getTime() >= start || !inPeriod(at, range)) continue
    const article = articles.find(item => item.id === movement.article) ?? movement.expand?.article
    const units = soldUnits(movement)
    add(articleRows, movement.article, article?.name ?? UNKNOWN_ARTICLE, 0, units)
    add(categoryRows, article?.category || '', categoryName(article?.category, ''), 0, units)
  }

  const rows = map => sortRows([...map.values()].map(({ cents, ...row }) => ({ ...row, revenue: toEuros(cents) })))
  return {
    topArticles: rows(articleRows),
    topCategories: rows(categoryRows),
    deals: [...dealRows.values()]
      .map(({ discountCents, ...deal }) => ({ ...deal, discount: toEuros(discountCents) }))
      .sort((a, b) => b.times - a.times || b.discount - a.discount || a.name.localeCompare(b.name)),
    olderSalesCount: sales.filter(sale => !hasLines(sale)).length
  }
}
