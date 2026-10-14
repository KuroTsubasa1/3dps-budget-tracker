import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  PRIZE_NOTE,
  UNDO_NOTE,
  OPEN_PRIZES_KEY,
  PRIZE_OUTBOX_KEY,
  NO_PRIZES,
  isGatcha,
  prizesFor,
  addPrizes,
  takePrize,
  returnPrize,
  prizeChoices,
  prizeMovement,
  undoMovement,
  undoPick,
  readOpenPrizes,
  writeOpenPrizes,
  readOutbox,
  writeOutbox,
  forgetPrizes
} from '../../utils/gatcha.js'
import { lowStockArticles } from '../../utils/printBoard.js'
import { salesSummary } from '../../utils/reports/sales.js'
import { runsOutSoonest } from '../../utils/reports/stock.js'
import { periodRange } from '../../utils/reports/period.js'

const CATEGORIES = [
  { id: 'cat-gatcha', name: 'GatchaPon', base_price: 4, sort_order: 0 },
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 1 },
  { id: 'cat-mini', name: 'Mini Figure', base_price: 8, sort_order: 2 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 3 }
]
const article = (id, name, category, extra = {}) => ({ id, name, category, active: true, stock: 3, low_stock_threshold: 2, ...extra })
const GATCHA = article('g1', 'GatchaPon', 'cat-gatcha', { stock: 0, prize_categories: ['cat-keychain', 'cat-mini'] })
const ARTICLES = [
  GATCHA,
  article('k2', 'Zubat Keychain', 'cat-keychain'),
  article('k1', 'Pikachu Keychain', 'cat-keychain', { stock: 1 }),
  article('k3', 'Evoli Keychain', 'cat-keychain', { stock: 0 }),
  article('k4', 'Old Keychain', 'cat-keychain', { active: false }),
  article('m1', 'Totoro Mini', 'cat-mini'),
  article('c1', 'Moon Coaster', 'cat-coaster')
]
const names = groups => groups.map(group => [group.category.name, group.articles.map(item => item.name)])

// A Storage stand-in; `broken` throws like a blocked or full localStorage
const memoryStorage = (broken = false) => {
  const data = new Map()
  const guard = () => { if (broken) throw new Error('blocked') }
  return {
    data,
    getItem: key => { guard(); return data.has(key) ? data.get(key) : null },
    setItem: (key, value) => { guard(); data.set(key, String(value)) },
    removeItem: (key) => { guard(); data.delete(key) }
  }
}

test('an article with at least one prize category is a gatcha', () => {
  assert.equal(isGatcha(GATCHA), true)
  assert.equal(isGatcha(article('a', 'A', 'cat-keychain', { prize_categories: [] })), false)
  // Older records and servers before the migration have no field at all
  assert.equal(isGatcha(article('a', 'A', 'cat-keychain')), false)
  assert.equal(isGatcha(article('a', 'A', 'cat-keychain', { prize_categories: null })), false)
  assert.equal(isGatcha(null), false)
})

test('a cart owes one prize per gatcha unit, from the union of the gatchas\' categories', () => {
  const coasterGatcha = article('g2', 'Coaster Gatcha', 'cat-gatcha', { prize_categories: ['cat-coaster', 'cat-keychain'] })
  assert.deepEqual(prizesFor([
    { ...GATCHA, quantity: 2 },
    { ...coasterGatcha, quantity: 1 },
    { ...ARTICLES[1], quantity: 4 },
    { ...article('g3', 'Unsold Gatcha', 'cat-gatcha', { prize_categories: ['cat-mini'] }), quantity: 0 }
  ]), { count: 3, categories: ['cat-keychain', 'cat-mini', 'cat-coaster'] })
  assert.deepEqual(prizesFor([{ ...ARTICLES[1], quantity: 1 }]), { count: 0, categories: [] })
})

test('open prizes add up, and start afresh once none are open', () => {
  const first = addPrizes(NO_PRIZES, { count: 2, categories: ['cat-keychain'] })
  assert.deepEqual(first, { count: 2, categories: ['cat-keychain'] })
  assert.deepEqual(addPrizes(first, { count: 1, categories: ['cat-mini', 'cat-keychain'] }), { count: 3, categories: ['cat-keychain', 'cat-mini'] })
  assert.equal(addPrizes(first, { count: 0, categories: [] }), first)
  // All picked: the old categories only stay for an Undo, a new checkout replaces them
  const done = takePrize(takePrize(first))
  assert.deepEqual(done, { count: 0, categories: ['cat-keychain'] })
  assert.deepEqual(takePrize(done), done)
  assert.deepEqual(returnPrize(done), { count: 1, categories: ['cat-keychain'] })
  assert.deepEqual(addPrizes(done, { count: 1, categories: ['cat-coaster'] }), { count: 1, categories: ['cat-coaster'] })
})

test('prize choices are active articles in stock from the prize categories, grouped and sorted by name', () => {
  const groups = prizeChoices({ articles: ARTICLES, categories: CATEGORIES, prizeCategories: ['cat-mini', 'cat-keychain'] })
  assert.deepEqual(names(groups), [
    ['Keychain', ['Pikachu Keychain', 'Zubat Keychain']],
    ['Mini Figure', ['Totoro Mini']]
  ])
  // The search filters by name, ignoring case and spaces around it; empty groups are left out
  assert.deepEqual(names(prizeChoices({ articles: ARTICLES, categories: CATEGORIES, prizeCategories: ['cat-mini', 'cat-keychain'], query: '  PIKA ' })), [
    ['Keychain', ['Pikachu Keychain']]
  ])
  assert.deepEqual(prizeChoices({ articles: ARTICLES, categories: CATEGORIES, prizeCategories: ['cat-keychain'], query: 'nothing' }), [])
})

test('a gatcha is never its own prize, even when its category is a prize category', () => {
  const groups = prizeChoices({ articles: [{ ...GATCHA, stock: 5 }, ...ARTICLES.slice(1)], categories: CATEGORIES, prizeCategories: ['cat-gatcha', 'cat-mini'] })
  assert.deepEqual(names(groups), [['Mini Figure', ['Totoro Mini']]])
})

test('a prize is a sale of one, and its undo a correction of one', () => {
  assert.deepEqual(prizeMovement('mv1', 'k1'), { id: 'mv1', article: 'k1', change: -1, reason: 'sale', note: 'Gatcha prize' })
  assert.deepEqual(undoMovement('mv2', 'k1'), { id: 'mv2', article: 'k1', change: 1, reason: 'correction', note: 'Gatcha prize undone' })
  assert.deepEqual([PRIZE_NOTE, UNDO_NOTE], ['Gatcha prize', 'Gatcha prize undone'])
})

test('undo takes a waiting pick out of the outbox, and balances a sent or sending one', () => {
  const pick = { id: 'mv1', article: 'k1', name: 'Pikachu Keychain' }
  const outbox = [prizeMovement('mv0', 'm1'), prizeMovement('mv1', 'k1')]
  assert.deepEqual(undoPick(outbox, pick, { id: 'mv9' }), [prizeMovement('mv0', 'm1')])
  // On its way: it may land, so the correction follows it
  assert.deepEqual(undoPick(outbox, pick, { sending: true, id: 'mv9' }), [...outbox, undoMovement('mv9', 'k1')])
  // Already on the server
  assert.deepEqual(undoPick([], pick, { id: 'mv9' }), [undoMovement('mv9', 'k1')])
})

test('open prizes and the outbox survive a reload, and garbage reads as nothing', () => {
  const storage = memoryStorage()
  writeOpenPrizes(storage, { count: 2, categories: ['cat-keychain'] })
  assert.deepEqual(readOpenPrizes(storage), { count: 2, categories: ['cat-keychain'] })
  writeOpenPrizes(storage, { count: 0, categories: ['cat-keychain'] })
  assert.equal(storage.data.has(OPEN_PRIZES_KEY), false)
  assert.deepEqual(readOpenPrizes(storage), NO_PRIZES)

  writeOutbox(storage, [prizeMovement('mv1', 'k1')])
  assert.deepEqual(readOutbox(storage), [prizeMovement('mv1', 'k1')])
  writeOutbox(storage, [])
  assert.equal(storage.data.has(PRIZE_OUTBOX_KEY), false)

  storage.setItem(OPEN_PRIZES_KEY, '{"count":-1,"categories":[]}')
  assert.deepEqual(readOpenPrizes(storage), NO_PRIZES)
  storage.setItem(OPEN_PRIZES_KEY, 'not json')
  assert.deepEqual(readOpenPrizes(storage), NO_PRIZES)
  storage.setItem(PRIZE_OUTBOX_KEY, JSON.stringify([prizeMovement('mv1', 'k1'), { id: 'x', article: 'k1', change: -40, reason: 'sale' }, 'junk']))
  assert.deepEqual(readOutbox(storage), [prizeMovement('mv1', 'k1')])

  // A blocked storage never throws
  const blocked = memoryStorage(true)
  writeOpenPrizes(blocked, { count: 1, categories: [] })
  writeOutbox(blocked, [prizeMovement('mv1', 'k1')])
  forgetPrizes(blocked)
  assert.deepEqual([readOpenPrizes(blocked), readOutbox(blocked)], [NO_PRIZES, []])
})

test('logging out forgets the open prizes and keeps waiting picks; clearing all data drops both', () => {
  const storage = memoryStorage()
  writeOpenPrizes(storage, { count: 1, categories: ['cat-keychain'] })
  writeOutbox(storage, [prizeMovement('mv1', 'k1')])
  forgetPrizes(storage)
  assert.deepEqual([storage.data.has(OPEN_PRIZES_KEY), storage.data.has(PRIZE_OUTBOX_KEY)], [false, true])
  forgetPrizes(storage, { keepOutbox: false })
  assert.equal(storage.data.size, 0)
})

test('a gatcha is never on the print board or in the stock check', () => {
  const low = lowStockArticles([GATCHA, article('k1', 'Pikachu Keychain', 'cat-keychain', { stock: 1 })])
  assert.deepEqual(low.map(item => item.id), ['k1'])
})

// Reports stay as they are: the gatcha's own line carries the revenue, prizes count for "runs out" only
const NOW = new Date(2026, 9, 14, 13, 0)
const stamp = date => date.toISOString().replace('T', ' ')
const MONTH = periodRange('month', NOW)

test('in Reports the gatcha sale is its own line and a prize is no article sale, even before any line data', () => {
  const gatchaSale = {
    id: 't1',
    description: 'GatchaPon',
    amount: 4,
    date: '2026-10-14',
    created: stamp(new Date(2026, 9, 14, 11, 0)),
    items: [{ article: 'g1', name: 'GatchaPon', category: 'cat-gatcha', categoryName: 'GatchaPon', quantity: 1, unitPrice: 4, lineTotal: 4, discount: 0, deal: '', dealName: '' }]
  }
  // The prize synced before the sale reached the server (the sale was still queued)
  const movements = [
    { id: 'mv1', article: 'k1', change: -1, reason: 'sale', note: PRIZE_NOTE, created: stamp(new Date(2026, 9, 14, 10, 0)) },
    { id: 'mv2', article: 'k2', change: -1, reason: 'sale', note: '', created: stamp(new Date(2026, 9, 14, 9, 0)) }
  ]
  const summary = salesSummary({ transactions: [gatchaSale], movements, articles: ARTICLES, categories: CATEGORIES, range: MONTH })
  assert.deepEqual(summary.topArticles.map(row => [row.name, row.units, row.revenue]), [
    ['GatchaPon', 1, 4],
    ['Zubat Keychain', 1, 0]
  ])
  assert.deepEqual(runsOutSoonest({ articles: ARTICLES, movements, now: NOW }).map(row => row.id), ['k1', 'k2'])
})
