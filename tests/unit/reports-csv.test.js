import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NOW, ARTICLES, CATEGORIES, TRANSACTIONS, MOVEMENTS } from '../fixtures/reports.js'
import { periodRange } from '../../utils/reports/period.js'
import { salesSummary } from '../../utils/reports/sales.js'
import { dayReport } from '../../utils/reports/marketDay.js'
import { moneySeries } from '../../utils/reports/money.js'
import { printedVsSold } from '../../utils/reports/stock.js'
import { reportTable, toCsv } from '../../utils/reports/csv.js'

const MONTH = periodRange('month', NOW)
const csv = (tab, figures) => toCsv(reportTable(tab, figures)).split('\n')

test('the Sales CSV lists the top articles with units and revenue', () => {
  const sales = salesSummary({ transactions: TRANSACTIONS, movements: MOVEMENTS, articles: ARTICLES, categories: CATEGORIES, range: MONTH })
  assert.deepEqual(csv('sales', sales), [
    '"Article","Units","Revenue"',
    '"Glurak Figure","2","60.00"',
    '"Moon Coaster","4","19.00"',
    '"Pikachu Keychain","8","18.00"',
    '"Lost Lamp","1","0.00"'
  ])
})

test('the Market day CSV has one row per hour of the day', () => {
  const lines = csv('market', { day: '2026-10-14', report: dayReport({ transactions: TRANSACTIONS, day: '2026-10-14' }) })
  assert.equal(lines.length, 25)
  assert.equal(lines[0], '"Day","Hour","Takings"')
  assert.equal(lines[11], '"2026-10-14","10:00","41.00"')
  assert.equal(lines[13], '"2026-10-14","12:00","19.00"')
  assert.deepEqual(csv('market', { day: '', report: null }), ['"Day","Hour","Takings"'])
})

test('the Money CSV has one row per bucket with the running balance', () => {
  const lines = csv('money', moneySeries({ transactions: TRANSACTIONS, range: MONTH, bucket: 'week' }))
  assert.deepEqual(lines.slice(0, 3), [
    '"Period","Income","Expenses","Profit","Balance"',
    '"1 Oct","12.00","0.00","12.00","60.00"',
    '"5 Oct","37.00","20.00","17.00","77.00"'
  ])
  assert.equal(lines.length, 6)
})

test('the Stock CSV lists printed vs sold, and quotes names safely', () => {
  assert.deepEqual(csv('stock', { printed: printedVsSold(MOVEMENTS, MONTH, ARTICLES) }), [
    '"Article","Printed","Sold"',
    '"Pikachu Keychain","0","8"',
    '"Glurak Figure","2","2"',
    '"Moon Coaster","0","4"',
    '"Lost Lamp","0","1"'
  ])
  const quoted = { printed: { rows: [{ name: 'The "Big", one', printed: 1, sold: 0 }] } }
  assert.equal(csv('stock', quoted)[1], '"The ""Big"", one","1","0"')
  assert.throws(() => reportTable('weather', {}), /Unknown report: weather/)
})
