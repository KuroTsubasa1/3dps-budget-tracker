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

// Sales from the old app carry the UTC date of the sale; server records are dated by the local date of
// `created`, and sales queued offline were created on the day they synced. The tests below run in Berlin.
const inBerlin = (fn) => () => {
  const previous = process.env.TZ
  process.env.TZ = 'Europe/Berlin'
  try { fn() } finally { process.env.TZ = previous }
}
const legacy = (id, description, amount, date) => ({ id, description, amount, date, notes: '' })

test('a legacy sale made just after midnight (UTC date one day earlier) matches its record', inBerlin(() => {
  const { transactions, orphans } = mergeTransactions({
    server: [record('a', 'Dragon', 15, '2026-07-09 22:30:00.000Z')],
    local: [legacy(1, 'Dragon', 15, '2026-07-09')],
    pending: []
  })
  assert.deepEqual(orphans, [])
  assert.equal(transactions.length, 1)
}))

test('a legacy sale synced two days later matches its record', inBerlin(() => {
  const { orphans } = mergeTransactions({
    server: [record('b', 'Keychain', 5, '2026-07-13 09:00:00.000Z')],
    local: [legacy(2, 'Keychain', 5, '2026-07-11')],
    pending: []
  })
  assert.deepEqual(orphans, [])
}))

test('two identical legacy sales on different days each match their own record', inBerlin(() => {
  const server = [record('a', 'Vase', 20, '2026-07-10 12:00:00.000Z'), record('b', 'Vase', 20, '2026-07-13 12:00:00.000Z')]
  const both = mergeTransactions({ server, local: [legacy(2, 'Vase', 20, '2026-07-12'), legacy(1, 'Vase', 20, '2026-07-09')], pending: [] })
  assert.deepEqual(both.orphans, [])
  assert.equal(both.transactions.length, 2)

  // One record cannot absorb two sales: the second identical sale stays an orphan
  const one = mergeTransactions({ server: [server[1]], local: [legacy(1, 'Vase', 20, '2026-07-12'), legacy(2, 'Vase', 20, '2026-07-11')], pending: [] })
  assert.deepEqual(one.orphans.map(o => o.id), [2])
}))

test('a legacy sale is never matched to a record created before it or more than 7 days later', inBerlin(() => {
  const late = mergeTransactions({ server: [record('a', 'Vase', 20, '2026-07-19 12:00:00.000Z')], local: [legacy(1, 'Vase', 20, '2026-07-11')], pending: [] })
  assert.deepEqual(late.orphans.map(o => o.id), [1])
  const early = mergeTransactions({ server: [record('a', 'Vase', 20, '2026-07-10 12:00:00.000Z')], local: [legacy(1, 'Vase', 20, '2026-07-11')], pending: [] })
  assert.deepEqual(early.orphans.map(o => o.id), [1])
  const sameDay = mergeTransactions({ server: [record('a', 'Vase', 20, '2026-07-18 12:00:00.000Z')], local: [legacy(1, 'Vase', 20, '2026-07-11')], pending: [] })
  assert.deepEqual(sameDay.orphans, [])
}))

test('a record already claimed by its record id is not matched to a legacy sale', inBerlin(() => {
  const { orphans } = mergeTransactions({
    server: [record('a', 'Vase', 20, '2026-07-11 12:00:00.000Z')],
    local: [local('a', 'Vase', 20, '2026-07-11'), legacy(1, 'Vase', 20, '2026-07-11')],
    pending: []
  })
  assert.deepEqual(orphans.map(o => o.id), [1])
}))

test('a queued legacy entry without record id counts as pending by its id', () => {
  const queued = legacy(4, 'Queued legacy', 7, '2026-07-11')
  const { transactions, orphans } = mergeTransactions({ server: [], local: [queued], pending: [4] })
  assert.deepEqual(orphans, [])
  assert.deepEqual(transactions, [queued])
})

test('fromRecord keeps the sale date the record carries', () => {
  assert.equal(fromRecord({ ...record('a', 'x', 1, '2026-10-14 08:00:00.000Z'), date: '2026-10-12' }).date, '2026-10-12')
})

test('a record carrying its sale date matches a legacy sale of that date exactly', () => {
  const { orphans } = mergeTransactions({
    server: [{ ...record('a', 'Vase', 20, '2026-10-20 12:00:00.000Z'), date: '2026-10-12' }],
    local: [legacy(1, 'Vase', 20, '2026-10-12')],
    pending: []
  })
  assert.deepEqual(orphans, [])
})
