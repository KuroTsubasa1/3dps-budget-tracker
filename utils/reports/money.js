// Money tab: income, expenses and profit per week or month, the running balance and the Japan share
import { toCents, toEuros, toDate } from './common.js'
import { addDays } from './period.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const dayLabel = date => `${date.getDate()} ${MONTHS[date.getMonth()]}`
const monthLabel = date => `${MONTHS[date.getMonth()]} ${date.getFullYear()}`

// The range cut at each Monday (weeks) or each 1st (months); the first bucket starts with the range
export function buckets (range, bucket) {
  const list = []
  let start = range.start
  while (start < range.end) {
    const next = bucket === 'month'
      ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
      : addDays(start, 7 - ((start.getDay() + 6) % 7))
    const end = next < range.end ? next : range.end
    list.push({ start, end, label: bucket === 'month' ? monthLabel(start) : dayLabel(start) })
    start = end
  }
  return list
}

// Transactions count on their local day. The balance includes everything before the range, so its
// last point is the balance at the end of the period. Japan is 10% of the period's income.
export function moneySeries ({ transactions, range, bucket = 'week' }) {
  const dated = transactions
    .map(transaction => ({ at: toDate(transaction.date), cents: toCents(transaction.amount) }))
    .filter(transaction => transaction.at)
  let balance = dated.filter(transaction => transaction.at < range.start).reduce((sum, transaction) => sum + transaction.cents, 0)
  let income = 0
  let expenses = 0
  const rows = buckets(range, bucket).map(({ start, end, label }) => {
    const inside = dated.filter(transaction => transaction.at >= start && transaction.at < end)
    const bucketIncome = inside.filter(transaction => transaction.cents > 0).reduce((sum, transaction) => sum + transaction.cents, 0)
    const bucketExpenses = inside.filter(transaction => transaction.cents < 0).reduce((sum, transaction) => sum - transaction.cents, 0)
    income += bucketIncome
    expenses += bucketExpenses
    balance += bucketIncome - bucketExpenses
    return { label, income: bucketIncome, expenses: bucketExpenses, balance }
  })
  return {
    buckets: rows.map(row => ({ label: row.label, income: toEuros(row.income), expenses: toEuros(row.expenses), profit: toEuros(row.income - row.expenses) })),
    balanceLine: rows.map(row => ({ label: row.label, balance: toEuros(row.balance) })),
    totals: { income: toEuros(income), expenses: toEuros(expenses), profit: toEuros(income - expenses), balance: toEuros(balance) },
    japan: toEuros(Math.round(income * 0.1))
  }
}
