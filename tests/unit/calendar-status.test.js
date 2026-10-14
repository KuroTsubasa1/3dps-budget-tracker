import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isDone, displayStatus, lastDayOf } from '../../utils/calendar/status.js'

const local = (month, day, hours, minutes = 0) => new Date(2026, month - 1, day, hours, minutes)
const booked = overrides => ({ status: 'booked', starts_on: '2026-11-07', ends_on: '2026-11-08', ...overrides })

test('the last day is ends_on, falling back to starts_on, or empty without dates', () => {
  assert.equal(lastDayOf(booked()), '2026-11-08')
  assert.equal(lastDayOf(booked({ ends_on: '' })), '2026-11-07')
  assert.equal(lastDayOf(booked({ ends_on: '2026-11-08 00:00:00.000Z' })), '2026-11-08')
  assert.equal(lastDayOf(booked({ starts_on: '', ends_on: '' })), '')
})

test('a booked convention is done the day after its last day, not on it', () => {
  assert.equal(isDone(booked(), local(11, 8, 23, 59)), false)
  assert.equal(isDone(booked(), local(11, 9, 0, 1)), true)
  assert.equal(displayStatus(booked(), local(11, 8, 12)), 'Booked')
  assert.equal(displayStatus(booked(), local(11, 9, 12)), 'Done')
})

test('a one-day event without ends_on is done after its start day', () => {
  const oneDay = booked({ ends_on: '' })
  assert.equal(isDone(oneDay, local(11, 7, 12)), false)
  assert.equal(isDone(oneDay, local(11, 8, 12)), true)
})

test('only booked conventions are ever done, and without dates none is', () => {
  for (const status of ['interested', 'applied', 'rejected', 'cancelled']) {
    assert.equal(isDone(booked({ status }), local(12, 1, 12)), false, status)
  }
  assert.equal(displayStatus(booked({ status: 'applied' }), local(12, 1, 12)), 'Applied')
  assert.equal(isDone(booked({ starts_on: '', ends_on: '' }), local(12, 1, 12)), false)
})
