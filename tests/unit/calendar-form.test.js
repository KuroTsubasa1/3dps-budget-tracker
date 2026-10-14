import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  blankForm,
  formFrom,
  fieldsFrom,
  validateConvention,
  parseFee,
  toLocalInput,
  fromLocalInput,
  splitMoment,
  joinMoment,
  validateReminder
} from '../../utils/calendar/form.js'

const setup = new Date(2026, 10, 7, 10, 30)
const RECORD = {
  id: 'c1',
  name: 'Dokomi',
  city: 'Düsseldorf',
  venue: 'Messe',
  hall: 'Hall 4',
  table: 'B12',
  starts_on: '2026-11-07 00:00:00.000Z',
  ends_on: '2026-11-08 00:00:00.000Z',
  status: 'booked',
  applications_open: '',
  applications_close: '2026-10-30 00:00:00.000Z',
  results_expected: '',
  setup_at: setup.toISOString().replace('T', ' '),
  stand_fee: 45.5,
  reminders: []
}

test('a record becomes the form and back, dates as days and the setup time in local time', () => {
  const form = formFrom(RECORD)
  assert.deepEqual(form, {
    name: 'Dokomi',
    city: 'Düsseldorf',
    venue: 'Messe',
    hall: 'Hall 4',
    table: 'B12',
    starts_on: '2026-11-07',
    ends_on: '2026-11-08',
    applications_open: '',
    applications_close: '2026-10-30',
    results_expected: '',
    status: 'booked',
    setup_at: '2026-11-07T10:30',
    stand_fee: '45,5'
  })
  assert.deepEqual(fieldsFrom({ ...form, name: '  Dokomi  ' }), {
    name: 'Dokomi',
    city: 'Düsseldorf',
    venue: 'Messe',
    hall: 'Hall 4',
    table: 'B12',
    starts_on: '2026-11-07',
    ends_on: '2026-11-08',
    applications_open: '',
    applications_close: '2026-10-30',
    results_expected: '',
    status: 'booked',
    setup_at: setup.toISOString(),
    stand_fee: 45.5
  })
  assert.equal(blankForm().status, 'interested')
  assert.equal(formFrom({ ...RECORD, stand_fee: 0 }).stand_fee, '')
})

test('the setup time round-trips through the datetime input in local time', () => {
  assert.equal(toLocalInput(setup.toISOString()), '2026-11-07T10:30')
  assert.equal(fromLocalInput('2026-11-07T10:30'), setup.toISOString())
  assert.equal(toLocalInput(''), '')
  assert.equal(fromLocalInput(''), '')
  assert.equal(fromLocalInput('2026-11-07T'), '')
})

test('the stand fee takes a comma or a dot and at most two decimals', () => {
  assert.equal(parseFee('45,50'), 45.5)
  assert.equal(parseFee('45.5'), 45.5)
  assert.equal(parseFee(''), 0)
  assert.ok(Number.isNaN(parseFee('-5')))
  assert.ok(Number.isNaN(parseFee('4,555')))
  assert.ok(Number.isNaN(parseFee('abc')))
})

test('saving needs a name, dates in order, both dates to book and a valid fee', () => {
  const ok = { ...blankForm(), name: 'Dokomi' }
  assert.equal(validateConvention(ok), '')
  assert.equal(validateConvention({ ...ok, name: '  ' }), 'Enter a name')
  assert.equal(validateConvention({ ...ok, starts_on: '2026-11-08', ends_on: '2026-11-07' }), 'The end is before the start')
  assert.equal(validateConvention({ ...ok, status: 'booked', starts_on: '2026-11-07' }), 'Add the start and end dates before booking')
  assert.equal(validateConvention({ ...ok, status: 'booked', starts_on: '2026-11-07', ends_on: '2026-11-07' }), '')
  assert.equal(validateConvention({ ...ok, applications_open: '2026-10-10', applications_close: '2026-10-01' }), 'Applications close before they open')
  assert.equal(validateConvention({ ...ok, stand_fee: '12,345' }), 'Enter the stand fee as an amount, like 45 or 45,50')
})

test('a reminder time is a local date and time', () => {
  const at = new Date(2026, 9, 29, 9, 0).toISOString()
  assert.deepEqual(splitMoment(at), { date: '2026-10-29', time: '09:00' })
  assert.equal(joinMoment('2026-10-29', '09:00'), at)
  assert.deepEqual(splitMoment(''), { date: '', time: '' })
  assert.equal(validateReminder({ date: '', time: '09:00' }), 'Pick a date and a time')
  assert.equal(validateReminder({ date: '2026-10-29', time: '09:00', text: ' ', custom: true }), 'Enter what to remind you of')
  assert.equal(validateReminder({ date: '2026-10-29', time: '09:00', text: '', custom: false }), '')
})
