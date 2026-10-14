import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CALENDAR_COPY_KEY, copyOf, writeCopy, readCopy, forgetCopy } from '../../utils/calendar/copy.js'

const memoryStorage = () => {
  const items = new Map()
  return {
    items,
    getItem: key => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: key => items.delete(key)
  }
}
const RECORD = {
  id: 'dokomi000000001',
  collectionId: 'abc',
  collectionName: 'conventions',
  created: '2026-10-01 10:00:00.000Z',
  updated: '2026-10-01 10:00:00.000Z',
  name: 'Dokomi',
  status: 'booked',
  starts_on: '2026-11-07 00:00:00.000Z',
  stand_fee: 45,
  fee_paid_at: '2026-10-14 11:00:00.000Z',
  fee_transaction: 'tx0000000000001',
  reminders: [{ id: 'auto-pack', kind: 'pack', at: '2026-11-05T17:00:00.000Z', auto: true }]
}

test('the saved copy keeps only the fields the calendar shows', () => {
  const copy = copyOf(RECORD)
  assert.deepEqual(Object.keys(copy), ['id', 'name', 'city', 'venue', 'hall', 'table', 'starts_on', 'ends_on', 'status', 'applications_open', 'applications_close', 'results_expected', 'setup_at', 'stand_fee', 'fee_paid_at', 'reminders'])
  for (const field of ['fee_transaction', 'collectionId', 'collectionName', 'created', 'updated']) assert.equal(field in copy, false, field)
  assert.equal(copy.city, '')
})

test('the copy is written, read back with its time, and forgotten', () => {
  const storage = memoryStorage()
  const savedAt = new Date(Date.UTC(2026, 9, 14, 11, 0))
  writeCopy(storage, [RECORD], savedAt)
  assert.deepEqual(readCopy(storage), { savedAt: '2026-10-14T11:00:00.000Z', items: [copyOf(RECORD)] })
  forgetCopy(storage)
  assert.equal(storage.getItem(CALENDAR_COPY_KEY), null)
  assert.equal(readCopy(storage), null)
})

test('a broken or blocked storage never throws', () => {
  const storage = memoryStorage()
  storage.setItem(CALENDAR_COPY_KEY, '{not json')
  assert.equal(readCopy(storage), null)
  const blocked = { getItem () { throw new Error('blocked') }, setItem () { throw new Error('full') }, removeItem () { throw new Error('blocked') } }
  assert.doesNotThrow(() => writeCopy(blocked, [RECORD]))
  assert.equal(readCopy(blocked), null)
  assert.doesNotThrow(() => forgetCopy(blocked))
})
