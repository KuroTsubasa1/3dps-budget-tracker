import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultReminders,
  syncReminders,
  allowedFor,
  dueReminders,
  markFor,
  withSentMarks,
  editReminder,
  removeReminder,
  addReminder,
  visibleReminders,
  ruleOf,
  stateOf
} from '../../utils/calendar/reminders.js'
import { addDays, daysBetween, dayKey, formatDay, inDays, weekdayIndex } from '../../utils/calendar/dates.js'

// Local times, so the tests hold in every time zone (run them with TZ=Pacific/Auckland too)
const local = (month, day, hours, minutes = 0) => new Date(2026, month - 1, day, hours, minutes)
const iso = (month, day, hours, minutes = 0) => local(month, day, hours, minutes).toISOString()
const convention = overrides => ({
  id: 'conv00000000001',
  name: 'Dokomi',
  city: 'Düsseldorf',
  venue: 'Messe',
  hall: 'Hall 4',
  table: 'B12',
  status: 'interested',
  starts_on: '2026-11-07',
  ends_on: '2026-11-08',
  applications_close: '2026-10-30',
  setup_at: '',
  reminders: [],
  ...overrides
})
const ids = reminders => reminders.map(reminder => reminder.id)
// Mid-October, before every default of the fixture
const NOW = local(10, 14, 12)

test('calendar days ignore the time zone and PocketBase date stamps', () => {
  assert.equal(dayKey('2026-10-30 00:00:00.000Z'), '2026-10-30')
  assert.equal(dayKey('2026-10-30'), '2026-10-30')
  assert.equal(dayKey(''), '')
  assert.equal(dayKey(null), '')
  assert.equal(addDays('2026-10-30', 3), '2026-11-02')
  assert.equal(addDays('2026-03-01', -1), '2026-02-28')
  assert.equal(daysBetween('2026-10-24', '2026-10-26'), 2)
  assert.equal(daysBetween('2026-10-26', '2026-10-24'), -2)
  assert.equal(formatDay('2026-10-21'), 'Wed 21 Oct')
  assert.equal(weekdayIndex('2026-10-26'), 0)
  assert.equal(weekdayIndex('2026-11-01'), 6)
  assert.deepEqual([0, 1, 5].map(inDays), ['today', 'tomorrow', 'in 5 days'])
})

test('an interested convention gets deadline reminders 7 days and 1 day before, at 09:00 local', () => {
  assert.deepEqual(defaultReminders(convention()), [
    { id: 'auto-deadline-7', kind: 'deadline', at: iso(10, 23, 9), auto: true },
    { id: 'auto-deadline-1', kind: 'deadline', at: iso(10, 29, 9), auto: true }
  ])
  for (const reminder of defaultReminders(convention())) assert.equal(new Date(reminder.at).getHours(), 9)
})

test('09:00 stays 09:00 in Berlin across the end of summer time on 25 October 2026', () => {
  const zone = process.env.TZ
  process.env.TZ = 'Europe/Berlin'
  try {
    // 23 Oct is summer time (UTC+2), 29 Oct winter time (UTC+1)
    assert.deepEqual(defaultReminders(convention()).map(reminder => reminder.at), ['2026-10-23T07:00:00.000Z', '2026-10-29T08:00:00.000Z'])
    const booked = defaultReminders(convention({ status: 'booked', starts_on: '2026-11-07' }))
    assert.equal(booked.find(reminder => reminder.kind === 'stock').at, '2026-10-24T07:00:00.000Z')
  } finally {
    if (zone === undefined) delete process.env.TZ
    else process.env.TZ = zone
  }
})

test('a booked convention gets the stock check, packing and setup reminders', () => {
  assert.deepEqual(defaultReminders(convention({ status: 'booked' })), [
    { id: 'auto-stock', kind: 'stock', at: iso(10, 24, 9), auto: true },
    { id: 'auto-pack', kind: 'pack', at: iso(11, 5, 18), auto: true },
    { id: 'auto-setup', kind: 'setup', at: iso(11, 7, 8), auto: true }
  ])
  // With a setup time the setup reminder comes an hour before it
  const setup = defaultReminders(convention({ status: 'booked', setup_at: local(11, 7, 10, 30).toISOString() }))
  assert.equal(setup.find(reminder => reminder.kind === 'setup').at, iso(11, 7, 9, 30))
})

test('other statuses and missing dates get no default reminders', () => {
  for (const status of ['applied', 'rejected', 'cancelled']) assert.deepEqual(defaultReminders(convention({ status })), [], status)
  assert.deepEqual(defaultReminders(convention({ applications_close: '' })), [])
  assert.deepEqual(defaultReminders(convention({ status: 'booked', starts_on: '', ends_on: '' })), [])
  // A setup time alone still gives the setup reminder
  assert.deepEqual(ids(defaultReminders(convention({ status: 'booked', starts_on: '', setup_at: local(11, 7, 10).toISOString() }))), ['auto-setup'])
})

test('a change of dates moves the unsent defaults', () => {
  const first = syncReminders(convention(), [], NOW)
  const moved = syncReminders(convention({ applications_close: '2026-11-02' }), first, NOW)
  assert.deepEqual(moved.map(reminder => reminder.at), [iso(10, 26, 9), iso(11, 1, 9)])
  assert.ok(moved.every(reminder => reminder.auto))
})

test('sent, edited, custom and removed reminders stay as they are', () => {
  const sent = { id: 'auto-deadline-7', kind: 'deadline', at: iso(10, 23, 9), auto: true, sent_at: iso(10, 23, 9, 2) }
  const edited = { id: 'auto-deadline-1', kind: 'deadline', at: iso(10, 28, 20), auto: false }
  const custom = { id: 'custom-1', kind: 'custom', at: iso(10, 20, 12), text: 'Order business cards', auto: false }
  const result = syncReminders(convention({ applications_close: '2026-11-02' }), [sent, edited, custom], NOW)
  // No second deadline-7 although the close date moved: that slot was sent
  assert.deepEqual(result, [custom, sent, edited])
  const removed = removeReminder(syncReminders(convention({ status: 'booked' }), [], NOW), 'auto-pack')
  assert.deepEqual(ids(visibleReminders(syncReminders(convention({ status: 'booked', starts_on: '2026-11-14' }), removed, NOW))), ['auto-stock', 'auto-setup'])
})

test('a status change swaps the unsent defaults and keeps the sent ones', () => {
  const sent = { id: 'auto-deadline-7', kind: 'deadline', at: iso(10, 23, 9), auto: true, sent_at: iso(10, 23, 9, 2) }
  const interested = syncReminders(convention(), [sent], local(10, 24, 12))
  assert.deepEqual(ids(interested), ['auto-deadline-7', 'auto-deadline-1'])
  const booked = syncReminders(convention({ status: 'booked' }), interested, local(10, 24, 12))
  assert.deepEqual(ids(booked), ['auto-deadline-7', 'auto-pack', 'auto-setup'])
})

test('a default whose time has passed is not added, but one already waiting is kept', () => {
  // Booked on 25 October: the stock check (24 October) is already late
  const late = local(10, 25, 12)
  assert.deepEqual(ids(syncReminders(convention({ status: 'booked' }), [], late)), ['auto-pack', 'auto-setup'])
  // The job has not reached the 09:00 reminder yet when the owner saves at 09:02
  const waiting = syncReminders(convention(), [], NOW)
  assert.deepEqual(syncReminders(convention(), waiting, local(10, 23, 9, 2)), waiting)
})

test('deadlines go out only while interested, the rest only while booked and not over', () => {
  const deadline = { kind: 'deadline' }
  const stock = { kind: 'stock' }
  const custom = { kind: 'custom' }
  assert.equal(allowedFor(deadline, convention(), NOW), true)
  assert.equal(allowedFor(deadline, convention({ status: 'applied' }), NOW), false)
  assert.equal(allowedFor(stock, convention({ status: 'booked' }), NOW), true)
  assert.equal(allowedFor(stock, convention({ status: 'applied' }), NOW), false)
  assert.equal(allowedFor(stock, convention({ status: 'booked' }), local(11, 9, 9)), false)
  assert.equal(allowedFor(custom, convention({ status: 'applied' }), NOW), true)
  assert.equal(allowedFor(custom, convention({ status: 'cancelled' }), NOW), false)
  assert.equal(allowedFor({ kind: 'custom', removed: true }, convention(), NOW), false)
})

test('due reminders are sent, skipped when the status changed, and missed after 24 hours', () => {
  const reminder = (id, kind, at, extra = {}) => ({ id, kind, at, auto: true, ...extra })
  const now = local(10, 29, 9, 30)
  const conventions = [
    convention({
      id: 'interested00001',
      reminders: [
        reminder('auto-deadline-7', 'deadline', iso(10, 23, 9)),
        reminder('auto-deadline-1', 'deadline', iso(10, 29, 9)),
        reminder('sent', 'custom', iso(10, 28, 9), { sent_at: iso(10, 28, 9, 1) }),
        reminder('future', 'custom', iso(10, 29, 9, 31)),
        reminder('gone', 'custom', iso(10, 29, 8), { removed: true })
      ]
    }),
    convention({ id: 'applied00000001', status: 'applied', reminders: [reminder('auto-deadline-1', 'deadline', iso(10, 29, 9))] }),
    // Exactly 24 hours late is still sent
    convention({ id: 'booked000000001', status: 'booked', reminders: [reminder('custom-1', 'custom', iso(10, 28, 9, 30))] }),
    convention({ id: 'old000000000001', reminders: null })
  ]
  const due = dueReminders(conventions, now)
  assert.deepEqual(due.map(item => [item.convention.id, item.reminder.id, item.action]), [
    ['interested00001', 'auto-deadline-7', 'miss'],
    ['booked000000001', 'custom-1', 'send'],
    ['interested00001', 'auto-deadline-1', 'send'],
    ['applied00000001', 'auto-deadline-1', 'skip']
  ])
})

test('the job marks a reminder sent, skipped or missed', () => {
  const now = local(10, 29, 9, 30)
  assert.deepEqual(markFor('send', now), { sent_at: now.toISOString() })
  assert.deepEqual(markFor('skip', now), { sent_at: now.toISOString(), skipped: true })
  assert.deepEqual(markFor('miss', now), { sent_at: now.toISOString(), missed: true })
})

test('sent marks land on the same reminder at the same time only', () => {
  const reminders = [
    { id: 'auto-deadline-7', kind: 'deadline', at: iso(10, 23, 9), auto: true },
    // Moved by the owner after the job loaded it
    { id: 'auto-deadline-1', kind: 'deadline', at: iso(10, 29, 20), auto: false },
    { id: 'custom-1', kind: 'custom', at: iso(10, 20, 9), auto: false, sent_at: iso(10, 20, 9, 1) }
  ]
  const marks = [
    { id: 'auto-deadline-7', at: iso(10, 23, 9), sent_at: iso(10, 23, 9, 5), skipped: true },
    { id: 'auto-deadline-1', at: iso(10, 29, 9), sent_at: iso(10, 29, 9, 5) },
    { id: 'custom-1', at: iso(10, 20, 9), sent_at: iso(10, 20, 9, 9), missed: true }
  ]
  assert.deepEqual(withSentMarks(reminders, marks), [
    { ...reminders[0], sent_at: iso(10, 23, 9, 5), skipped: true },
    reminders[1],
    reminders[2]
  ])
})

test('the owner edits, removes and adds reminders', () => {
  const list = syncReminders(convention(), [], NOW)
  const edited = editReminder(list, 'auto-deadline-1', { at: iso(10, 29, 20), text: 'ignored' })
  assert.deepEqual(edited[1], { id: 'auto-deadline-1', kind: 'deadline', at: iso(10, 29, 20), auto: false })
  assert.equal(ruleOf(edited[1], convention()), 'Edited')
  assert.equal(ruleOf(list[0], convention()), '7 days before applications close')

  const added = addReminder(list, { id: 'custom-1', at: iso(10, 25, 12), text: 'Book the hotel' })
  assert.deepEqual(ids(added), ['auto-deadline-7', 'custom-1', 'auto-deadline-1'])
  assert.equal(ruleOf(added[1], convention()), 'Custom')
  assert.deepEqual(editReminder(added, 'custom-1', { at: iso(10, 26, 12), text: 'Book the train' })[1].text, 'Book the train')

  // A removed custom reminder is gone; a removed default stays hidden as a marker
  assert.deepEqual(ids(removeReminder(added, 'custom-1')), ids(list))
  const removed = removeReminder(list, 'auto-deadline-7')
  assert.deepEqual(removed[0], { ...list[0], auto: false, removed: true })
  assert.deepEqual(ids(visibleReminders(removed)), ['auto-deadline-1'])
})

test('the setup rule names the setup time when there is one', () => {
  const [setup] = syncReminders(convention({ status: 'booked' }), [], NOW).filter(reminder => reminder.kind === 'setup')
  assert.equal(ruleOf(setup, convention({ status: 'booked' })), 'On the first day')
  assert.equal(ruleOf(setup, convention({ status: 'booked', setup_at: iso(11, 7, 10) })), '1 hour before setup')
})

test('a reminder reads Sent, Skipped, Missed or nothing', () => {
  assert.equal(stateOf({}), '')
  assert.equal(stateOf({ sent_at: 'x' }), 'Sent')
  assert.equal(stateOf({ sent_at: 'x', skipped: true }), 'Skipped')
  assert.equal(stateOf({ sent_at: 'x', missed: true }), 'Missed')
})
