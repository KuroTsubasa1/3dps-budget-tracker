import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceCart } from '../../utils/deals.js'
import { formatCurrency as eur } from '../../utils/currency.js'
import { cartLines, checkoutBooking, homeBooking, saleTransaction } from '../../utils/checkout.js'

const KEYCHAIN = { id: 'cat-keychain', name: 'Keychain', base_price: 4 }
const GATCHA_CATEGORY = { id: 'cat-gatcha', name: 'GatchaPon', base_price: 4 }
const DEAL = { id: 'deal-key', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }
const article = (id, name, category, extra = {}) =>
  ({ id, name, category: category.id, expand: { category }, price: 0, stock: 5, prize_categories: [], ...extra })
const CART = [
  { ...article('k1', 'Pikachu Keychain', KEYCHAIN), quantity: 2 },
  { ...article('k2', 'Zubat Keychain', KEYCHAIN, { stock: 0 }), quantity: 1 },
  { ...article('g1', 'GatchaPon', GATCHA_CATEGORY, { prize_categories: ['cat-keychain'] }), quantity: 2 }
]
// Local time: the sale's day is the device's day
const NOW = new Date(2026, 9, 16, 23, 30)
let next = 0
const ids = () => `mv${String(++next).padStart(13, '0')}`
const book = () => {
  next = 0
  return checkoutBooking({ products: CART, pricedCart: priceCart(cartLines(CART), [DEAL]), deals: [DEAL], newId: ids, now: NOW })
}

test('a cart books its description, lines, deals, stock movements and gatcha prizes', () => {
  const booking = book()
  assert.equal(booking.description, `3D Printing Products:\nPikachu Keychain (${eur(4)} × 2)\nZubat Keychain (${eur(4)} × 1)\nGatchaPon (${eur(4)} × 2)\nDeals: Keychain 2 for 7 (−${eur(1)})`)
  assert.equal(booking.amount, 19)
  assert.equal(booking.date, '2026-10-16')
  assert.equal(booking.sold_at, NOW.toISOString())
  assert.deepEqual(booking.items.map(line => [line.article, line.quantity, line.lineTotal, line.discount, line.dealName]), [
    ['k1', 2, 8, 0.66, 'Keychain 2 for 7'],
    ['k2', 1, 4, 0.34, 'Keychain 2 for 7'],
    ['g1', 2, 8, 0, '']
  ])
  // The gatcha's own stock never moves; an article out of stock records its oversell
  assert.deepEqual(booking.stockMovements, [
    { id: 'mv0000000000001', article: 'k1', change: -2, reason: 'sale', note: '' },
    { id: 'mv0000000000002', article: 'k2', change: 0, reason: 'sale', note: 'oversold by 1' }
  ])
  assert.deepEqual(booking.prizes, { count: 2, categories: ['cat-keychain'] })
})

test('cash and card book the same sale; card adds SumUp and the payment id', () => {
  const booking = book()
  const cash = saleTransaction(booking, { paymentMethod: 'cash' })
  const card = saleTransaction(booking, { paymentMethod: 'card', sumupTransaction: 'TEENSK4W2K', recordId: 'pay000000000001' })
  const { prizes, ...sale } = booking
  assert.deepEqual(cash, { ...sale, payment_method: 'cash' })
  assert.deepEqual(card, { ...sale, payment_method: 'card', sumup_transaction: 'TEENSK4W2K', recordId: 'pay000000000001' })
  assert.throws(() => saleTransaction(booking, { paymentMethod: 'cheque' }), /Unknown payment method: cheque/)
})

test('a booking survives a JSON round trip unchanged, as stored with a card payment', () => {
  const booking = book()
  assert.deepEqual(JSON.parse(JSON.stringify(booking)), booking)
  assert.deepEqual(saleTransaction(JSON.parse(JSON.stringify(booking)), { paymentMethod: 'card' }), saleTransaction(booking, { paymentMethod: 'card' }))
})

test('the Home quick entry books its description, amount and notes on the device\'s day', () => {
  assert.deepEqual(homeBooking({ description: 'Market sale', amount: '25', notes: 'n', now: NOW }), { description: 'Market sale', amount: 25, notes: 'n', date: '2026-10-16' })
  assert.deepEqual(saleTransaction(homeBooking({ description: 'Print', amount: 12.5, now: NOW }), { paymentMethod: 'cash' }),
    { description: 'Print', amount: 12.5, notes: '', date: '2026-10-16', payment_method: 'cash' })
})

test('a booking takes its date from the local day, just after midnight and just before it', () => {
  for (const now of [new Date(2026, 9, 16, 0, 30), new Date(2026, 9, 16, 23, 30)]) {
    assert.equal(checkoutBooking({ products: CART, pricedCart: priceCart(cartLines(CART), [DEAL]), deals: [DEAL], newId: () => 'm', now }).date, '2026-10-16')
    assert.equal(homeBooking({ description: 'Sale', amount: 5, now }).date, '2026-10-16')
  }
})
