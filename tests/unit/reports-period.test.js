import { test } from 'node:test'
import assert from 'node:assert/strict'
import { localDate } from '../../utils/transactions.js'
import { toDate, saleTime, soldUnits, lineCents, linesOf } from '../../utils/reports/common.js'
import { PERIODS, periodRange, inPeriod, daysIn, bucketFor, rangeDays, addDays } from '../../utils/reports/period.js'

// Built with the local constructor: the same wall-clock times in every time zone
const NOW = new Date(2026, 9, 14, 13, 0) // Wednesday 14 October 2026, 13:00
const stamp = date => date.toISOString().replace('T', ' ')
const days = range => [localDate(range.start), localDate(range.end)]

test('the period picker offers Today, Week, Month, Year and Custom', () => {
  assert.deepEqual(PERIODS.map(period => period.label), ['Today', 'Week', 'Month', 'Year', 'Custom'])
})

test('today, week, month and year are local calendar ranges with an exclusive end', () => {
  assert.deepEqual(days(periodRange('today', NOW)), ['2026-10-14', '2026-10-15'])
  assert.deepEqual(days(periodRange('week', NOW)), ['2026-10-12', '2026-10-19'])
  assert.deepEqual(days(periodRange('month', NOW)), ['2026-10-01', '2026-11-01'])
  assert.deepEqual(days(periodRange('year', NOW)), ['2026-01-01', '2027-01-01'])
  const { start, end } = periodRange('week', NOW)
  assert.deepEqual([start.getHours(), start.getMinutes(), end.getHours()], [0, 0, 0])
})

test('a week runs Monday to Sunday, also on its first and last day', () => {
  assert.deepEqual(days(periodRange('week', new Date(2026, 9, 12, 0, 0))), ['2026-10-12', '2026-10-19'])
  assert.deepEqual(days(periodRange('week', new Date(2026, 9, 18, 23, 59))), ['2026-10-12', '2026-10-19'])
  // Across a month and a year end
  assert.deepEqual(days(periodRange('week', new Date(2026, 11, 31, 9))), ['2026-12-28', '2027-01-04'])
  assert.deepEqual(days(periodRange('month', new Date(2026, 11, 31, 9))), ['2026-12-01', '2027-01-01'])
})

test('a custom range includes its last day, swaps a reversed range and falls back to today', () => {
  assert.deepEqual(days(periodRange('custom', NOW, { from: '2026-10-01', to: '2026-10-03' })), ['2026-10-01', '2026-10-04'])
  assert.deepEqual(days(periodRange('custom', NOW, { from: '2026-10-03', to: '2026-10-01' })), ['2026-10-01', '2026-10-04'])
  assert.deepEqual(days(periodRange('custom', NOW, { from: '', to: 'nonsense' })), ['2026-10-14', '2026-10-15'])
  assert.deepEqual(days(periodRange('custom', NOW)), ['2026-10-14', '2026-10-15'])
  assert.throws(() => periodRange('decade', NOW), /Unknown period: decade/)
})

test('inPeriod reads day strings, ISO times, PocketBase stamps and dates', () => {
  const week = periodRange('week', NOW)
  assert.equal(inPeriod('2026-10-12', week), true)
  assert.equal(inPeriod('2026-10-18', week), true)
  assert.equal(inPeriod('2026-10-19', week), false)
  assert.equal(inPeriod('2026-10-11', week), false)
  assert.equal(inPeriod(stamp(new Date(2026, 9, 18, 23, 59)), week), true)
  assert.equal(inPeriod(stamp(new Date(2026, 9, 19, 0, 0)), week), false)
  assert.equal(inPeriod(new Date(2026, 9, 12, 0, 0).toISOString(), week), true)
  assert.equal(inPeriod(new Date(2026, 9, 11, 23, 59), week), false)
  assert.equal(inPeriod('', week), false)
  assert.equal(inPeriod(undefined, week), false)
  assert.equal(inPeriod('not a date', week), false)
})

test('days, money buckets and file-name days follow the calendar', () => {
  assert.equal(daysIn(periodRange('month', NOW)), 31)
  // October holds a daylight-saving change in many zones; counting by date ignores it
  assert.equal(daysIn(periodRange('custom', NOW, { from: '2026-10-20', to: '2026-10-30' })), 11)
  assert.equal(bucketFor('year', periodRange('year', NOW)), 'month')
  assert.equal(bucketFor('month', periodRange('month', NOW)), 'week')
  assert.equal(bucketFor('custom', periodRange('custom', NOW, { from: '2026-01-01', to: '2026-03-31' })), 'week')
  assert.equal(bucketFor('custom', periodRange('custom', NOW, { from: '2026-01-01', to: '2026-04-01' })), 'month')
  assert.deepEqual(rangeDays(periodRange('month', NOW)), { first: '2026-10-01', last: '2026-10-31' })
  assert.equal(localDate(addDays(new Date(2026, 9, 31), 1)), '2026-11-01')
})

test('toDate and saleTime read the times the app and PocketBase write', () => {
  assert.equal(toDate('2026-10-14').getTime(), new Date(2026, 9, 14).getTime())
  assert.equal(toDate('2026-10-14 08:30:00.000Z').toISOString(), '2026-10-14T08:30:00.000Z')
  assert.equal(toDate('2026-10-14T08:30:00.000Z').toISOString(), '2026-10-14T08:30:00.000Z')
  assert.equal(toDate(''), null)
  assert.equal(toDate(null), null)
  assert.equal(toDate('garbage'), null)
  const sold = new Date(2026, 9, 14, 10, 30)
  const created = new Date(2026, 9, 14, 10, 31)
  assert.equal(saleTime({ sold_at: sold.toISOString(), created: stamp(created) }).getTime(), sold.getTime())
  assert.equal(saleTime({ sold_at: '', created: stamp(created) }).getTime(), created.getTime())
  assert.equal(saleTime({ date: '2026-10-14' }), null)
})

test('sale movements count what left stock plus what was oversold; lines count their discount', () => {
  assert.equal(soldUnits({ reason: 'sale', change: -3, note: '' }), 3)
  assert.equal(soldUnits({ reason: 'sale', change: -1, note: 'oversold by 2' }), 3)
  assert.equal(soldUnits({ reason: 'sale', change: 0, note: 'oversold by 2' }), 2)
  assert.equal(soldUnits({ reason: 'printed', change: 5, note: '' }), 0)
  assert.equal(soldUnits({ reason: 'correction', change: -2, note: '' }), 0)
  assert.equal(lineCents({ lineTotal: 8, discount: 1 }), 700)
  assert.equal(lineCents({ lineTotal: 0.3, discount: 0.1 }), 20)
  assert.deepEqual(linesOf({ items: null }), [])
  assert.deepEqual(linesOf({}), [])
})
