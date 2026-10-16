import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as tx from '../../utils/transactions.js'
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

test('fromRecord keeps the payment method and SumUp transaction, and leaves them out when empty', () => {
  const card = fromRecord({ id: 'c', description: 'Sale', amount: 19, created: '2026-10-16 10:00:00.000Z', payment_method: 'card', sumup_transaction: 'TEENSK4W2K' })
  assert.deepEqual([card.payment_method, card.sumup_transaction], ['card', 'TEENSK4W2K'])
  // PocketBase answers an unset select or text as ''
  const old = fromRecord({ id: 'o', description: 'Sale', amount: 19, created: '2026-10-16 10:00:00.000Z', payment_method: '', sumup_transaction: '' })
  assert.ok(!('payment_method' in old) && !('sumup_transaction' in old))
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

// Fix round 2: orphans are only dropped by record id, legacy queue items get one, logout and CSV see every local entry
const twin = (id, date = '2026-10-10') => legacy(id, 'Keychain', 5, date)

test('the orphan recheck drops an orphan whose record id reached the server', () => {
  const orphan = local('loc000000000001', 'Lost sale', 7, '2026-10-11')
  assert.deepEqual(tx.recheckOrphans({ server: [record('loc000000000001', 'Lost sale', 7)], orphans: [orphan] }), [])
  assert.deepEqual(tx.recheckOrphans({ server: [], orphans: [orphan] }), [orphan])
})

test('uploading one of two identical legacy orphans leaves the other one', () => {
  // The uploaded twin is on the server with its own date, distance 0 from the one left behind
  const uploaded = { ...record('upl000000000001', 'Keychain', 5, '2026-10-14 09:00:00.000Z'), date: '2026-10-10' }
  const left = twin(2)
  assert.deepEqual(tx.recheckOrphans({ server: [uploaded], orphans: [left] }), [left])
})

test('selling the same item again within the week does not remove an identical legacy orphan', () => {
  const orphan = twin(3)
  const again = record('new000000000001', 'Keychain', 5, '2026-10-12 10:00:00.000Z')
  assert.deepEqual(tx.recheckOrphans({ server: [again], orphans: [orphan] }), [orphan])
})

test('queued items count as pending by record id and by local id', () => {
  const queue = [
    { id: 1, recordId: 'rec000000000001', status: 'pending' },
    { id: 2, status: 'failed' },
    { id: 3, recordId: 'rec000000000003', status: 'synced' }
  ]
  assert.deepEqual(tx.pendingQueueIds(queue), ['rec000000000001', 1, 2])
})

test('unsynced queue items without a record id get one, others stay untouched', () => {
  let n = 0
  const makeId = () => `new${String(++n).padStart(12, '0')}`
  const withId = { id: 1, recordId: 'rec000000000001', status: 'pending' }
  const synced = { id: 3, status: 'synced' }
  const result = tx.withRecordIds([withId, { id: 2, status: 'failed', description: 'Old' }, synced], makeId)
  assert.deepEqual(result, [withId, { id: 2, status: 'failed', description: 'Old', recordId: 'new000000000001' }, synced])
  assert.equal(tx.withRecordIds([withId, synced], makeId), null)
})

test('entries the server has not confirmed count as local only', () => {
  const confirmed = local('srv000000000001', 'A', 1)
  const unknown = local('loc000000000001', 'B', 2)
  const queued = local('que000000000001', 'C', 3)
  const oldApp = legacy(9, 'D', 4, '2026-01-01')
  const transactions = [confirmed, unknown, queued, oldApp]
  const pending = ['que000000000001']
  // After a successful refresh: anything not in that list and not queued
  assert.equal(tx.unconfirmedCount({ transactions, serverIds: new Set(['srv000000000001']), pending }), 2)
  // No successful refresh yet: only entries that never had a record id
  assert.equal(tx.unconfirmedCount({ transactions, serverIds: null, pending }), 1)
  assert.equal(tx.unconfirmedCount({ transactions: [{ ...oldApp }], serverIds: null, pending: [9] }), 0)
})

test('the CSV quotes every field and lists orphans and sales waiting to sync', () => {
  const csv = tx.transactionsCsv({
    transactions: [
      { id: 'srv1', recordId: 'srv1', description: 'Say "hi"', amount: 5, date: '2026-10-10', notes: 'a,b' },
      { id: 7, recordId: 'que1', description: 'Queued', amount: 3, date: '2026-10-11', notes: '' }
    ],
    orphans: [{ id: 8, description: 'Lost', amount: 2, date: '2026-10-09' }],
    queue: [
      { id: 7, recordId: 'que1', description: 'Queued', amount: 3, date: '2026-10-11', status: 'pending' },
      { id: 9, recordId: 'que2', description: 'Only queued', amount: 4, date: '2026-10-12', status: 'failed' },
      { id: 10, recordId: 'syn1', description: 'Done', amount: 1, date: '2026-10-12', status: 'synced' }
    ]
  })
  assert.deepEqual(csv.split('\n'), [
    'ID,Description,Amount,Date,Notes,Status',
    '"srv1","Say ""hi""","5","2026-10-10","a,b",""',
    '"7","Queued","3","2026-10-11","","waiting to sync"',
    '"8","Lost","2","2026-10-09","","not on server"',
    '"9","Only queued","4","2026-10-12","","waiting to sync"'
  ])
})


test('fromRecord keeps the sale lines, the sale time and the created stamp for the reports', () => {
  const items = [{ article: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', categoryName: 'Keychain', quantity: 2, unitPrice: 4, lineTotal: 8, discount: 1, deal: 'd1', dealName: 'Keychain 2 for 7' }]
  const entry = fromRecord({ ...record('a', 'Sale', 7, '2026-10-14 08:30:01.000Z'), date: '2026-10-14', items, sold_at: '2026-10-14 08:30:00.000Z' })
  assert.deepEqual(entry, {
    id: 'a',
    recordId: 'a',
    description: 'Sale',
    amount: 7,
    notes: '',
    date: '2026-10-14',
    items,
    sold_at: '2026-10-14 08:30:00.000Z',
    created: '2026-10-14 08:30:01.000Z'
  })
  // Records from before the reports: PocketBase sends null and '' for the empty fields
  const older = fromRecord({ ...record('b', 'Old sale', 3), date: '2026-10-12', items: null, sold_at: '' })
  assert.equal('items' in older, false)
  assert.equal('sold_at' in older, false)
  assert.equal(older.created, '2026-10-12 10:00:00.000Z')
})
