// Market day tab: one day's takings, items and sales, per hour, against the market days before it
import { toCents, toEuros, isIncome, linesOf, saleTime } from './common.js'

// Local days ('YYYY-MM-DD') with at least one sale, newest first
export function marketDays (transactions) {
  return [...new Set(transactions.filter(isIncome).map(sale => sale.date).filter(Boolean))].sort().reverse()
}

const figuresFor = (transactions, day) => {
  const sales = transactions.filter(sale => isIncome(sale) && sale.date === day)
  return {
    sales,
    cents: sales.reduce((sum, sale) => sum + toCents(sale.amount), 0),
    // Items come from lines; sales from before line data add none
    items: sales.reduce((sum, sale) => sum + linesOf(sale).reduce((acc, line) => acc + Number(line.quantity), 0), 0)
  }
}

// perHour[h] holds the takings of local hour h, from sold_at or else created. A sale with neither
// (an old entry queued on this device) counts in the takings but in no hour.
export function dayReport ({ transactions, day }) {
  const { sales, cents, items } = figuresFor(transactions, day)
  const hours = Array(24).fill(0)
  for (const sale of sales) {
    const at = saleTime(sale)
    if (at) hours[at.getHours()] += toCents(sale.amount)
  }
  return { takings: toEuros(cents), items, sales: sales.length, perHour: hours.map(toEuros) }
}

// The hours to chart: first to last hour with takings, or 9 to 17 when no sale has a time
export function hourWindow (perHour) {
  const used = perHour.map((value, hour) => (value ? hour : -1)).filter(hour => hour >= 0)
  const [first, last] = used.length ? [used[0], used[used.length - 1]] : [9, 17]
  return Array.from({ length: last - first + 1 }, (_, i) => first + i)
}

const mean = values => values.reduce((sum, value) => sum + value, 0) / values.length
const averageSaleCents = figures => (figures.sales.length ? figures.cents / figures.sales.length : 0)

// The day minus the average of up to `count` market days before it: takings and average sale in
// euros, items to one decimal. null when there is no earlier market day.
export function compareWithPrevious ({ transactions, day, count = 5 }) {
  const previous = marketDays(transactions).filter(item => item < day).slice(0, count)
  if (!previous.length) return null
  const current = figuresFor(transactions, day)
  const past = previous.map(item => figuresFor(transactions, item))
  return {
    days: previous.length,
    takings: toEuros(Math.round(current.cents - mean(past.map(figures => figures.cents)))),
    items: Math.round((current.items - mean(past.map(figures => figures.items))) * 10) / 10,
    averageSale: toEuros(Math.round(averageSaleCents(current) - mean(past.map(averageSaleCents))))
  }
}
