import { test } from 'node:test'
import assert from 'node:assert/strict'
import { targetFor, suggestedQuantity, isSameLocalDay, buildBoard } from '../../utils/printBoard.js'

// Built from local times, so the tests hold in every time zone
const NOW = new Date(2026, 9, 13, 12, 0, 0)
const pbDate = date => date.toISOString().replace('T', ' ')

const article = overrides => ({ id: 'a1', name: 'Pikachu Keychain', active: true, stock: 2, low_stock_threshold: 5, target_stock: 0, ...overrides })
const job = overrides => ({ id: 'j1', article: 'a1', quantity: 8, status: 'printing', done_at: '', created: '2026-10-13 08:00:00.000Z', ...overrides })
const commission = overrides => ({ id: 'c1', status: 'open', ready_at: '', created: '2026-10-01 10:00:00.000Z', ...overrides })
const idOf = card => (card.kind === 'commission' ? card.commission.id : card.kind === 'job' ? card.job.id : card.article.id)

test('the target is the article\'s own target stock, or twice the threshold', () => {
  assert.equal(targetFor(article()), 10)
  assert.equal(targetFor(article({ target_stock: 12 })), 12)
  assert.equal(targetFor(article({ target_stock: null })), 10)
})

test('the suggestion fills up to the target and is never below 1', () => {
  assert.equal(suggestedQuantity(article()), 8)
  assert.equal(suggestedQuantity(article({ stock: 0, target_stock: 3 })), 3)
  assert.equal(suggestedQuantity(article({ stock: 5, target_stock: 3 })), 1)
  assert.equal(suggestedQuantity(article({ stock: 10 })), 1)
})

test('To print holds active low-stock articles with a threshold, then open commissions', () => {
  const board = buildBoard({
    articles: [
      article(),
      article({ id: 'none', name: 'No threshold', stock: 0, low_stock_threshold: 0 }),
      article({ id: 'gone', name: 'Archived', active: false }),
      article({ id: 'full', name: 'Plenty', stock: 6 }),
      article({ id: 'edge', name: 'At threshold', stock: 5 })
    ],
    jobs: [],
    commissions: [commission(), commission({ id: 'c2', status: 'printing' })],
    now: NOW
  })
  assert.deepEqual(board.toPrint.map(idOf), ['a1', 'edge', 'c1'])
  assert.deepEqual(board.toPrint[0], { kind: 'stock', article: article(), quantity: 8 })
  assert.deepEqual(board.toPrint[2], { kind: 'commission', commission: commission() })
})

test('an article with a printing job leaves To print and shows under Printing', () => {
  const board = buildBoard({ articles: [article()], jobs: [job()], commissions: [commission({ status: 'printing' })], now: NOW })
  assert.deepEqual(board.toPrint, [])
  assert.deepEqual(board.printing, [
    { kind: 'job', job: job(), article: article() },
    { kind: 'commission', commission: commission({ status: 'printing' }) }
  ])
})

test('a done job does not keep its article off To print', () => {
  const board = buildBoard({ articles: [article()], jobs: [job({ status: 'done', done_at: pbDate(NOW) })], commissions: [], now: NOW })
  assert.deepEqual(board.toPrint.map(idOf), ['a1'])
  assert.deepEqual(board.printing, [])
})

test('To print sorts stock ascending, then by name, and commissions oldest first', () => {
  const board = buildBoard({
    articles: [article({ id: 'b', name: 'Bulbasaur', stock: 1 }), article({ id: 'z', name: 'Zubat', stock: 0 }), article({ id: 'a', name: 'Abra', stock: 1 })],
    jobs: [],
    commissions: [commission({ id: 'new', created: '2026-10-05 10:00:00.000Z' }), commission({ id: 'old', created: '2026-09-01 10:00:00.000Z' })],
    now: NOW
  })
  assert.deepEqual(board.toPrint.map(idOf), ['z', 'a', 'b', 'old', 'new'])
})

test('Done today starts at local midnight', () => {
  const midnight = new Date(2026, 9, 13, 0, 0, 0)
  const justBefore = new Date(2026, 9, 12, 23, 59, 59)
  const board = buildBoard({
    articles: [],
    jobs: [
      job({ id: 'today', status: 'done', done_at: pbDate(midnight) }),
      job({ id: 'yesterday', status: 'done', done_at: pbDate(justBefore) }),
      job({ id: 'running' })
    ],
    commissions: [
      commission({ id: 'ready-today', status: 'ready', ready_at: midnight.toISOString() }),
      commission({ id: 'ready-yesterday', status: 'ready', ready_at: pbDate(justBefore) }),
      commission({ id: 'delivered', status: 'delivered', ready_at: pbDate(midnight) })
    ],
    now: NOW
  })
  assert.deepEqual(board.doneToday.map(idOf), ['today', 'ready-today'])
  assert.equal(board.doneToday[0].article, null)
})

test('empty or invalid dates are never today', () => {
  assert.equal(isSameLocalDay('', NOW), false)
  assert.equal(isSameLocalDay(null, NOW), false)
  assert.equal(isSameLocalDay('not a date', NOW), false)
  assert.equal(isSameLocalDay(pbDate(NOW), NOW), true)
})
