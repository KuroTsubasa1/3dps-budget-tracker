import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOW, ARTICLES, CATEGORIES, KEYCHAIN_DEAL, TRANSACTIONS, MOVEMENTS, COMMISSIONS } from '../fixtures/reports.js'
import { periodRange } from '../../utils/reports/period.js'
import { hasLines } from '../../utils/reports/common.js'
import { salesSummary, sortRows } from '../../utils/reports/sales.js'
import { marketDays, dayReport, hourWindow, compareWithPrevious } from '../../utils/reports/marketDay.js'
import { buckets, moneySeries } from '../../utils/reports/money.js'
import { stockValue, runsOutSoonest, printedVsSold, commissionFigures } from '../../utils/reports/stock.js'

const MONTH = periodRange('month', NOW)
const WEEK = periodRange('week', NOW)
const YEAR = periodRange('year', NOW)
const TODAY = periodRange('today', NOW)
const EMPTY = periodRange('custom', NOW, { from: '2025-01-01', to: '2025-01-31' })
const summary = (range, transactions = TRANSACTIONS) =>
  salesSummary({ transactions, movements: MOVEMENTS, articles: ARTICLES, categories: CATEGORIES, range })
const rows = list => list.map(row => [row.name, row.revenue, row.units])

test('top articles: revenue from lines, units from lines plus older sales from movements', () => {
  assert.deepEqual(rows(summary(MONTH).topArticles), [
    ['Glurak Figure', 60, 2],
    ['Moon Coaster', 19, 4],
    ['Pikachu Keychain', 18, 8],
    ['Lost Lamp', 0, 1]
  ])
  assert.deepEqual(summary(MONTH).topArticles[0], { id: 'f1', name: 'Glurak Figure', units: 2, revenue: 60 })
})

test('top articles sort by units on request', () => {
  assert.deepEqual(sortRows(summary(MONTH).topArticles, 'units').map(row => row.name), ['Pikachu Keychain', 'Moon Coaster', 'Glurak Figure', 'Lost Lamp'])
  assert.deepEqual(sortRows(summary(MONTH).topArticles).map(row => row.name), ['Glurak Figure', 'Moon Coaster', 'Pikachu Keychain', 'Lost Lamp'])
})

test('top categories add up their articles, a deleted article by its expanded category', () => {
  assert.deepEqual(rows(summary(MONTH).topCategories), [
    ['Big Figure', 60, 3],
    ['Coaster', 19, 4],
    ['Keychain', 18, 8]
  ])
})

test('deals count once per sale with their total discount', () => {
  assert.deepEqual(summary(MONTH).deals, [{ id: 'deal-keychain', name: 'Keychain 2 for 7', times: 2, discount: 2 }])
  assert.deepEqual(summary(WEEK).deals, [{ id: 'deal-keychain', name: 'Keychain 2 for 7', times: 1, discount: 1 }])
  // A deal renamed since is shown by its current name
  const renamed = salesSummary({ transactions: TRANSACTIONS, deals: [{ ...KEYCHAIN_DEAL, name: 'Keychain pair' }], range: MONTH })
  assert.equal(renamed.deals[0].name, 'Keychain pair')
})

test('older sales without lines are counted for the hint', () => {
  assert.equal(summary(MONTH).olderSalesCount, 2)
  assert.equal(summary(WEEK).olderSalesCount, 1)
  assert.equal(summary(YEAR).olderSalesCount, 3)
})

test('movements after the first sale with lines are not counted twice', () => {
  // The week's movements all follow the line data, so only lines count
  assert.deepEqual(rows(summary(WEEK).topArticles), [
    ['Glurak Figure', 30, 1],
    ['Moon Coaster', 19, 2],
    ['Pikachu Keychain', 11, 3]
  ])
})

test('older sales of inactive and deleted articles keep their names', () => {
  assert.deepEqual(rows(summary(YEAR).topArticles), [
    ['Glurak Figure', 60, 3],
    ['Moon Coaster', 19, 4],
    ['Pikachu Keychain', 18, 8],
    ['Lost Lamp', 0, 1],
    ['Retired Dino', 0, 1]
  ])
})

test('without any line data every sale movement counts its units', () => {
  const older = summary(MONTH, TRANSACTIONS.filter(sale => !hasLines(sale)))
  assert.deepEqual(rows(older.topArticles), [
    ['Pikachu Keychain', 0, 8],
    ['Moon Coaster', 0, 4],
    ['Glurak Figure', 0, 2],
    ['Lost Lamp', 0, 1]
  ])
  assert.deepEqual(older.deals, [])
})

test('an empty period has no rows, deals or older sales', () => {
  assert.deepEqual(summary(EMPTY), { topArticles: [], topCategories: [], deals: [], olderSalesCount: 0 })
})

test('market days are the local days with a sale, newest first', () => {
  assert.deepEqual(marketDays(TRANSACTIONS), ['2026-10-14', '2026-10-10', '2026-10-02', '2026-09-20'])
  assert.deepEqual(marketDays([]), [])
})

test('a day report adds takings, items and sales, per hour from sold_at or else created', () => {
  const report = dayReport({ transactions: TRANSACTIONS, day: '2026-10-14' })
  assert.deepEqual([report.takings, report.items, report.sales], [65, 6, 4])
  assert.equal(report.perHour.length, 24)
  assert.deepEqual(report.perHour.map((value, hour) => [hour, value]).filter(([, value]) => value), [[10, 41], [12, 19]])
  // The queued 5 € has no time: it counts in the takings, not in an hour
  assert.deepEqual(dayReport({ transactions: TRANSACTIONS, day: '2026-10-10' }), {
    takings: 37, items: 3, sales: 1, perHour: Array.from({ length: 24 }, (_, hour) => (hour === 14 ? 37 : 0))
  })
})

test('the hour window spans the first to the last hour with takings', () => {
  assert.deepEqual(hourWindow(dayReport({ transactions: TRANSACTIONS, day: '2026-10-14' }).perHour), [10, 11, 12])
  assert.deepEqual(hourWindow(Array(24).fill(0)), [9, 10, 11, 12, 13, 14, 15, 16, 17])
})

test('a market day compares with the average of the market days before it', () => {
  assert.deepEqual(compareWithPrevious({ transactions: TRANSACTIONS, day: '2026-10-14', count: 5 }), {
    days: 3, takings: 32.67, items: 5, averageSale: -16.08
  })
  assert.deepEqual(compareWithPrevious({ transactions: TRANSACTIONS, day: '2026-10-14', count: 2 }), {
    days: 2, takings: 40.5, items: 4.5, averageSale: -8.25
  })
  assert.equal(compareWithPrevious({ transactions: TRANSACTIONS, day: '2026-09-20' }), null)
})

test('a month is cut into weeks from Monday, the first one starting with the month', () => {
  assert.deepEqual(buckets(MONTH, 'week').map(bucket => bucket.label), ['1 Oct', '5 Oct', '12 Oct', '19 Oct', '26 Oct'])
  assert.deepEqual(buckets(YEAR, 'month').map(bucket => bucket.label), [
    'Jan 2026', 'Feb 2026', 'Mar 2026', 'Apr 2026', 'May 2026', 'Jun 2026',
    'Jul 2026', 'Aug 2026', 'Sep 2026', 'Oct 2026', 'Nov 2026', 'Dec 2026'
  ])
  // The last week of October holds a daylight-saving change in many zones
  assert.deepEqual(buckets(periodRange('custom', NOW, { from: '2026-10-19', to: '2026-11-03' }), 'week').map(bucket => bucket.label), ['19 Oct', '26 Oct', '2 Nov'])
})

test('money per week: income, expenses, profit, the running balance and Japan', () => {
  const money = moneySeries({ transactions: TRANSACTIONS, range: MONTH, bucket: 'week' })
  assert.deepEqual(money.buckets, [
    { label: '1 Oct', income: 12, expenses: 0, profit: 12 },
    { label: '5 Oct', income: 37, expenses: 20, profit: 17 },
    { label: '12 Oct', income: 65, expenses: 15, profit: 50 },
    { label: '19 Oct', income: 0, expenses: 0, profit: 0 },
    { label: '26 Oct', income: 0, expenses: 0, profit: 0 }
  ])
  // The balance starts from everything before the period (48 € in September)
  assert.deepEqual(money.balanceLine.map(point => point.balance), [60, 77, 127, 127, 127])
  assert.deepEqual(money.totals, { income: 114, expenses: 35, profit: 79, balance: 127 })
  assert.equal(money.japan, 11.4)
})

test('money per month over a year, and a single day', () => {
  const year = moneySeries({ transactions: TRANSACTIONS, range: YEAR, bucket: 'month' })
  assert.equal(year.buckets.length, 12)
  assert.deepEqual(year.buckets[8], { label: 'Sep 2026', income: 48, expenses: 0, profit: 48 })
  assert.deepEqual(year.buckets[9], { label: 'Oct 2026', income: 114, expenses: 35, profit: 79 })
  assert.deepEqual(year.balanceLine.slice(7, 10).map(point => point.balance), [0, 48, 127])
  assert.equal(year.japan, 16.2)
  const today = moneySeries({ transactions: TRANSACTIONS, range: TODAY })
  assert.deepEqual(today.buckets, [{ label: '14 Oct', income: 65, expenses: 15, profit: 50 }])
  assert.deepEqual(today.balanceLine, [{ label: '14 Oct', balance: 127 }])
})

test('an empty period has zero buckets and keeps the balance it started with', () => {
  const money = moneySeries({ transactions: TRANSACTIONS, range: EMPTY })
  assert.ok(money.buckets.every(bucket => bucket.income === 0 && bucket.expenses === 0))
  assert.deepEqual(money.totals, { income: 0, expenses: 0, profit: 0, balance: 0 })
  assert.equal(money.japan, 0)
})

test('stock value is stock × current price over active articles', () => {
  assert.equal(stockValue(ARTICLES, CATEGORIES), 190)
  // Without the category list the expanded category gives the base price
  assert.equal(stockValue(ARTICLES), 190)
  // The loaded category list wins over a stale expand
  assert.equal(stockValue(ARTICLES, [{ ...CATEGORIES[0], base_price: 5 }]), 200)
  assert.equal(stockValue([]), 0)
})

test('runs out soonest: days of stock at the last 30 days pace, articles without sales left out', () => {
  assert.deepEqual(runsOutSoonest({ articles: ARTICLES, movements: MOVEMENTS, now: NOW }), [
    { id: 'c1', name: 'Moon Coaster', stock: 0, days: 0 },
    { id: 'f1', name: 'Glurak Figure', stock: 3, days: 30 },
    { id: 'k1', name: 'Pikachu Keychain', stock: 10, days: 38 }
  ])
  assert.deepEqual(runsOutSoonest({ articles: ARTICLES, movements: MOVEMENTS, now: NOW, limit: 2 }).map(row => row.id), ['c1', 'f1'])
  assert.deepEqual(runsOutSoonest({ articles: ARTICLES, movements: [], now: NOW }), [])
})

test('printed vs sold per article in the period', () => {
  assert.deepEqual(printedVsSold(MOVEMENTS, MONTH, ARTICLES), {
    rows: [
      { id: 'k1', name: 'Pikachu Keychain', printed: 0, sold: 8 },
      { id: 'f1', name: 'Glurak Figure', printed: 2, sold: 2 },
      { id: 'c1', name: 'Moon Coaster', printed: 0, sold: 4 },
      { id: 'gone', name: 'Lost Lamp', printed: 0, sold: 1 }
    ],
    printed: 2,
    sold: 15
  })
  assert.deepEqual(printedVsSold(MOVEMENTS, TODAY, ARTICLES).rows.map(row => [row.id, row.sold]), [['k1', 3], ['c1', 2], ['f1', 1]])
  assert.deepEqual(printedVsSold(MOVEMENTS, EMPTY, ARTICLES), { rows: [], printed: 0, sold: 0 })
})

test('commission figures: open value, delivered in the period and average days to deliver', () => {
  assert.deepEqual(commissionFigures(COMMISSIONS, MONTH), { openCount: 3, openValue: 50, deliveredCount: 2, deliveredValue: 50, averageDays: 8.8 })
  assert.deepEqual(commissionFigures(COMMISSIONS, WEEK), { openCount: 3, openValue: 50, deliveredCount: 1, deliveredValue: 20, averageDays: 7.5 })
  assert.deepEqual(commissionFigures(COMMISSIONS, YEAR), { openCount: 3, openValue: 50, deliveredCount: 3, deliveredValue: 90, averageDays: 6.8 })
  assert.deepEqual(commissionFigures(COMMISSIONS, EMPTY), { openCount: 3, openValue: 50, deliveredCount: 0, deliveredValue: 0, averageDays: null })
  assert.deepEqual(commissionFigures([], MONTH), { openCount: 0, openValue: 0, deliveredCount: 0, deliveredValue: 0, averageDays: null })
})

test('amounts add up to the cent, not as floats', () => {
  const day = (id, amount, items) => ({ id, amount, date: '2026-10-14', created: '2026-10-14 08:00:00.000Z', ...(items && { items }) })
  const money = moneySeries({ transactions: [day('a', 0.1), day('b', 0.2)], range: TODAY })
  assert.deepEqual(money.totals, { income: 0.3, expenses: 0, profit: 0.3, balance: 0.3 })
  assert.equal(dayReport({ transactions: [day('a', 0.1), day('b', 0.2)], day: '2026-10-14' }).takings, 0.3)
  const lines = [{ article: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', quantity: 1, unitPrice: 0.1, lineTotal: 0.1, discount: 0 }]
  const sales = [day('a', 0.1, lines), day('b', 0.2, [{ ...lines[0], unitPrice: 0.2, lineTotal: 0.2 }])]
  assert.equal(salesSummary({ transactions: sales, range: TODAY }).topArticles[0].revenue, 0.3)
})
