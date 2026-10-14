import { test } from 'node:test'
import assert from 'node:assert/strict'
import { upcoming, monthGrid, nextUp, displayStatus } from '../../utils/calendar/views.js'

// Wednesday 14 October 2026, noon local
const NOW = new Date(2026, 9, 14, 12, 0)
const convention = (id, overrides) => ({
  id,
  name: id,
  status: 'interested',
  starts_on: '',
  ends_on: '',
  applications_close: '',
  results_expected: '',
  ...overrides
})
const ids = list => list.map(item => item.id ?? item.convention.id)

const CONVENTIONS = [
  convention('closes-later', { applications_close: '2026-10-30', starts_on: '2027-03-01', ends_on: '2027-03-02' }),
  convention('closes-today', { applications_close: '2026-10-14 00:00:00.000Z', starts_on: '2027-01-10' }),
  convention('missed-deadline', { applications_close: '2026-10-01', starts_on: '2026-11-21' }),
  convention('applied-nov', { status: 'applied', starts_on: '2026-11-21', ends_on: '2026-11-22', results_expected: '2026-10-20' }),
  convention('booked-nov', { status: 'booked', starts_on: '2026-11-07', ends_on: '2026-11-08' }),
  convention('booked-running', { status: 'booked', starts_on: '2026-10-13', ends_on: '2026-10-15' }),
  convention('undated', { status: 'applied' }),
  convention('done', { status: 'booked', starts_on: '2026-09-05', ends_on: '2026-09-06' }),
  convention('rejected', { status: 'rejected', starts_on: '2026-12-01' }),
  convention('cancelled', { status: 'cancelled', starts_on: '2026-08-01' })
]

test('open applications are interested conventions still open, soonest first, with the days left', () => {
  const { openApplications } = upcoming(CONVENTIONS, NOW)
  assert.deepEqual(openApplications.map(item => [item.convention.id, item.daysLeft]), [['closes-today', 0], ['closes-later', 16]])
})

test('everything else that is not past is grouped by the month it starts in, undated last', () => {
  const { byMonth } = upcoming(CONVENTIONS, NOW)
  assert.deepEqual(byMonth.map(group => [group.key, group.label, ids(group.conventions)]), [
    ['2026-10', 'October 2026', ['booked-running']],
    ['2026-11', 'November 2026', ['booked-nov', 'applied-nov', 'missed-deadline']],
    ['undated', 'Dates not set', ['undated']]
  ])
})

test('past holds done, rejected and cancelled conventions, latest first', () => {
  assert.deepEqual(ids(upcoming(CONVENTIONS, NOW).past), ['rejected', 'done', 'cancelled'])
})

test('a booked convention reads Done once its last day has passed', () => {
  const booked = convention('b', { status: 'booked', starts_on: '2026-10-10', ends_on: '2026-10-13' })
  assert.equal(displayStatus(booked, NOW), 'Done')
  assert.equal(displayStatus({ ...booked, ends_on: '2026-10-14' }, NOW), 'Booked')
  assert.equal(displayStatus({ ...booked, ends_on: '' }, NOW), 'Done')
  assert.equal(displayStatus({ ...booked, status: 'applied' }, NOW), 'Applied')
  assert.equal(displayStatus(convention('x', { status: 'booked' }), NOW), 'Booked')
})

test('a month is laid out in weeks from Monday, with days from the months around it', () => {
  const october = monthGrid(2026, 9, [])
  assert.equal(october.length, 5)
  assert.deepEqual(october[0].map(day => day.date), ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'])
  assert.deepEqual(october[0].map(day => day.inMonth), [false, false, false, true, true, true, true])
  assert.equal(october[4][6].date, '2026-11-01')
  // November 2026 starts on a Sunday and needs six rows; the week of the time change has seven days
  const november = monthGrid(2026, 10, [])
  assert.equal(november.length, 6)
  assert.equal(november[0][0].date, '2026-10-26')
  assert.equal(november[5][6].date, '2026-12-06')
  assert.ok(november.every(week => week.length === 7))
})

test('convention days are bars and application deadlines are dots', () => {
  const grid = monthGrid(2026, 10, CONVENTIONS).flat()
  const day = date => grid.find(item => item.date === date)
  assert.deepEqual(day('2026-11-07').bars, [{ id: 'booked-nov', name: 'booked-nov', status: 'booked', starts: true, ends: false }])
  assert.deepEqual(day('2026-11-08').bars, [{ id: 'booked-nov', name: 'booked-nov', status: 'booked', starts: false, ends: true }])
  assert.deepEqual(day('2026-11-21').bars.map(bar => [bar.id, bar.starts, bar.ends]), [['applied-nov', true, false], ['missed-deadline', true, true]])
  assert.deepEqual(day('2026-10-30').dots, [{ id: 'closes-later', name: 'closes-later' }])
  // Rejected and cancelled conventions are not drawn
  assert.deepEqual(monthGrid(2026, 11, CONVENTIONS).flat().find(item => item.date === '2026-12-01').bars, [])
})

test('next up is the next open deadline and the next or running booked convention', () => {
  const next = nextUp(CONVENTIONS, NOW)
  assert.equal(next.deadline.convention.id, 'closes-today')
  assert.equal(next.deadline.daysLeft, 0)
  assert.equal(next.booked.convention.id, 'booked-running')
  assert.equal(next.booked.daysLeft, 0)
  const later = nextUp(CONVENTIONS, new Date(2026, 9, 16, 9))
  assert.deepEqual([later.deadline.convention.id, later.deadline.daysLeft], ['closes-later', 14])
  assert.deepEqual([later.booked.convention.id, later.booked.daysLeft], ['booked-nov', 22])
  assert.deepEqual(nextUp([], NOW), { deadline: null, booked: null })
})

test('only interested conventions have open applications', () => {
  const list = [
    convention('applied-open', { status: 'applied', applications_close: '2026-10-30', starts_on: '2027-02-01' }),
    convention('booked-open', { status: 'booked', applications_close: '2026-10-30', starts_on: '2027-03-01' })
  ]
  assert.deepEqual(upcoming(list, NOW).openApplications, [])
})

test('next up picks a booked convention even when an unbooked one starts sooner', () => {
  const list = [
    convention('applied-soon', { status: 'applied', starts_on: '2026-10-20', ends_on: '2026-10-21' }),
    convention('interested-soon', { starts_on: '2026-10-18' }),
    convention('booked-later', { status: 'booked', starts_on: '2026-12-05', ends_on: '2026-12-06' })
  ]
  assert.equal(nextUp(list, NOW).booked.convention.id, 'booked-later')
})

test('an interested convention without an applications deadline is listed under its month', () => {
  const list = [convention('no-deadline', { starts_on: '2026-11-14' })]
  const { openApplications, byMonth } = upcoming(list, NOW)
  assert.deepEqual(openApplications, [])
  assert.deepEqual(byMonth.map(group => [group.key, ids(group.conventions)]), [['2026-11', ['no-deadline']]])
})
