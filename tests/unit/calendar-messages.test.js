import { test } from 'node:test'
import assert from 'node:assert/strict'
import { messageFor, STOCK_LIST_LIMIT } from '../../utils/calendar/messages.js'
import { lowStockArticles } from '../../utils/printBoard.js'

const local = (month, day, hours, minutes = 0) => new Date(2026, month - 1, day, hours, minutes)
const convention = overrides => ({
  id: 'conv00000000001',
  name: 'Dokomi',
  hall: '',
  table: '',
  status: 'booked',
  starts_on: '2026-11-07',
  ends_on: '2026-11-08',
  applications_close: '2026-10-21',
  setup_at: '',
  ...overrides
})
const reminder = (kind, text) => ({ id: `r-${kind}`, kind, at: '', auto: true, ...(text ? { text } : {}) })
const article = (id, name, stock, overrides = {}) => ({ id, name, active: true, stock, low_stock_threshold: 3, target_stock: 0, ...overrides })

test('a deadline counts the days to the close, and says tomorrow for one', () => {
  const deadline = convention({ status: 'interested' })
  assert.deepEqual(messageFor({ convention: deadline, reminder: reminder('deadline'), now: local(10, 14, 9) }), {
    title: 'Applications close in 7 days',
    body: 'Dokomi · closes Wed 21 Oct',
    url: '/calendar?c=conv00000000001'
  })
  assert.equal(messageFor({ convention: deadline, reminder: reminder('deadline'), now: local(10, 20, 9) }).title, 'Applications close tomorrow')
})

test('the stock check lists low articles with what to print, at most five', () => {
  const articles = [
    article('a', 'Abra', 1),
    article('b', 'Bulbasaur', 0),
    article('c', 'Charmander', 2),
    article('d', 'Ditto', 3),
    article('e', 'Eevee', 2),
    article('f', 'Flareon', 1),
    article('g', 'Gengar', 0),
    article('ok', 'Plenty', 9),
    article('off', 'Archived', 0, { active: false }),
    article('none', 'No threshold', 0, { low_stock_threshold: 0 })
  ]
  assert.equal(STOCK_LIST_LIMIT, 5)
  const message = messageFor({ convention: convention(), reminder: reminder('stock'), articles, now: local(10, 24, 9) })
  assert.equal(message.title, 'Dokomi in 14 days')
  // Lowest stock first, then by name; the print board suggests target (2 × 3) minus stock
  assert.equal(message.body, 'Low stock: Bulbasaur (print 6), Gengar (print 6), Abra (print 5), Flareon (print 5), Charmander (print 4), +2 more')
  assert.deepEqual(lowStockArticles(articles).map(item => item.id), ['b', 'g', 'a', 'f', 'c', 'e', 'd'])
})

test('the stock check says so when nothing is low', () => {
  const message = messageFor({ convention: convention(), reminder: reminder('stock'), articles: [article('ok', 'Plenty', 9)], now: local(10, 24, 9) })
  assert.equal(message.body, 'Stock looks fine')
})

test('packing names the hall and table when they are set', () => {
  const now = local(11, 5, 18)
  assert.deepEqual(messageFor({ convention: convention({ hall: 'Hall 4', table: 'B12' }), reminder: reminder('pack'), now }), {
    title: 'Dokomi in 2 days',
    body: 'Time to pack · Hall 4, Table B12',
    url: '/calendar?c=conv00000000001'
  })
  assert.equal(messageFor({ convention: convention({ table: 'B12' }), reminder: reminder('pack'), now }).body, 'Time to pack · Table B12')
  assert.equal(messageFor({ convention: convention(), reminder: reminder('pack'), now }).body, 'Time to pack')
})

test('setup lists the hall, table and setup time that are set', () => {
  const setupAt = local(11, 7, 10, 30).toISOString()
  const message = messageFor({ convention: convention({ hall: 'Hall 4', table: 'B12', setup_at: setupAt }), reminder: reminder('setup'), now: local(11, 7, 9, 30) })
  assert.deepEqual(message, { title: 'Setup today: Dokomi', body: 'Hall 4 · Table B12 · Setup 10:30', url: '/calendar?c=conv00000000001' })
  assert.equal(messageFor({ convention: convention({ hall: 'Hall 4' }), reminder: reminder('setup'), now: local(11, 7, 8) }).body, 'Hall 4')
})

test('a custom reminder shows its text under the convention name', () => {
  assert.deepEqual(messageFor({ convention: convention(), reminder: reminder('custom', 'Order business cards'), now: local(10, 20, 12) }), {
    title: 'Dokomi',
    body: 'Order business cards',
    url: '/calendar?c=conv00000000001'
  })
})

test('a reminder whose day was cleared still reads well', () => {
  assert.equal(messageFor({ convention: convention({ starts_on: '' }), reminder: reminder('pack'), now: local(11, 5, 18) }).title, 'Dokomi')
  assert.deepEqual(messageFor({ convention: convention({ applications_close: '' }), reminder: reminder('deadline'), now: local(10, 14, 9) }), {
    title: 'Applications close',
    body: 'Dokomi',
    url: '/calendar?c=conv00000000001'
  })
})

test('days already passed never read as a negative count', () => {
  assert.deepEqual(messageFor({ convention: convention({ status: 'interested' }), reminder: reminder('deadline'), now: local(10, 22, 9) }), {
    title: 'Applications closed',
    body: 'Dokomi · closes Wed 21 Oct',
    url: '/calendar?c=conv00000000001'
  })
  const running = local(11, 8, 9)
  assert.equal(messageFor({ convention: convention(), reminder: reminder('pack'), now: running }).title, 'Dokomi is on now')
  assert.equal(messageFor({ convention: convention(), reminder: reminder('stock'), articles: [], now: running }).title, 'Dokomi is on now')
  assert.equal(messageFor({ convention: convention(), reminder: reminder('setup'), now: running }).title, 'Setup: Dokomi')
})
