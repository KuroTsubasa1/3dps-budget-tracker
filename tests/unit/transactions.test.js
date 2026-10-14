import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fromRecord, mergeTransactions } from '../../utils/transactions.js'

const record = (id, description, amount, created = '2026-10-12 10:00:00.000Z') =>
  ({ id, description, amount, notes: '', created })
const local = (recordId, description, amount, date = '2026-10-12') =>
  ({ id: 1, recordId, description, amount, date, notes: '' })

test('fromRecord maps a PocketBase record to a history entry', () => {
  const entry = fromRecord({ id: 'abc', description: 'Sale', amount: '12.5', notes: 'n', created: '2026-10-12 10:00:00.000Z' })
  assert.equal(entry.id, 'abc')
  assert.equal(entry.recordId, 'abc')
  assert.equal(entry.amount, 12.5)
  assert.equal(entry.notes, 'n')
  assert.match(entry.date, /^\d{4}-\d{2}-\d{2}$/)
})

test('fromRecord uses the local calendar date of the UTC created stamp', () => {
  const created = '2026-10-12 23:30:00.000Z'
  const d = new Date('2026-10-12T23:30:00.000Z')
  const expected = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  assert.equal(fromRecord(record('a', 'x', 1, created)).date, expected)
})

test('server records are mapped and kept in created order within a date', () => {
  const { transactions, orphans } = mergeTransactions({
    server: [record('a', 'A', 1), record('b', 'B', 2)], local: [], pending: []
  })
  assert.deepEqual(transactions.map(t => t.recordId), ['a', 'b'])
  assert.deepEqual(orphans, [])
})

test('a local entry that is on the server is not duplicated', () => {
  const { transactions, orphans } = mergeTransactions({
    server: [record('a', 'A', 1)], local: [local('a', 'A', 1)], pending: []
  })
  assert.equal(transactions.length, 1)
  assert.deepEqual(orphans, [])
})

test('a pending local entry is kept, and dropped once the server has it', () => {
  const pendingOnly = mergeTransactions({ server: [record('a', 'A', 1)], local: [local('p', 'P', 5)], pending: ['p'] })
  assert.deepEqual(pendingOnly.transactions.map(t => t.recordId), ['a', 'p'])
  assert.deepEqual(pendingOnly.orphans, [])

  const synced = mergeTransactions({ server: [record('a', 'A', 1), record('p', 'P', 5)], local: [local('p', 'P', 5)], pending: ['p'] })
  assert.deepEqual(synced.transactions.map(t => t.recordId), ['a', 'p'])
})

test('a local entry neither on the server nor pending is an orphan', () => {
  const lonely = local('x', 'Lonely', 9)
  const { transactions, orphans } = mergeTransactions({ server: [record('a', 'A', 1)], local: [lonely], pending: [] })
  assert.deepEqual(transactions.map(t => t.recordId), ['a'])
  assert.deepEqual(orphans, [lonely])
})

test('a legacy entry without recordId is an orphan unless an identical server record exists', () => {
  const legacy = { id: 5, description: 'Old', amount: 3, date: '2026-10-12', notes: '' }
  const other = { id: 6, description: 'Other', amount: 4, date: '2026-10-12', notes: '' }
  const created = '2026-10-12 12:00:00.000Z'
  const serverRecord = record('s', 'Old', 3, created)
  const date = fromRecord(serverRecord).date
  const matched = mergeTransactions({
    server: [serverRecord], local: [{ ...legacy, date }, { ...other, date }], pending: []
  })
  assert.deepEqual(matched.orphans.map(o => o.description), ['Other'])
  assert.equal(matched.transactions.length, 1)
})

test('entries are ordered by date, oldest first', () => {
  const { transactions } = mergeTransactions({
    server: [record('b', 'B', 1, '2026-10-13 10:00:00.000Z'), record('a', 'A', 1, '2026-10-10 10:00:00.000Z')],
    local: [], pending: []
  })
  assert.deepEqual(transactions.map(t => t.recordId), ['a', 'b'])
})
