import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceCart, describeDeal, isValidDeal, dealForCategory } from '../../utils/deals.js'

const KEYCHAIN = { categoryId: 'key', basePrice: 4 }
const FIGURE = { categoryId: 'fig', basePrice: 30 }
const POKEBALL = { categoryId: 'poke', basePrice: 30 }
const CASE = { categoryId: 'case', basePrice: 30 }

const DEALS = [
  { id: 'd-key', name: 'Keychain 2 for 7', type: 'bundle', categories: ['key'], min_qty: 2, price: 7 },
  { id: 'd-big', name: 'Big items', type: 'group', categories: ['fig', 'poke', 'case'], min_qty: 2, price: 25 }
]

const line = (kind, quantity, extra = {}) =>
  ({ articleId: `${kind.categoryId}-${extra.id ?? 1}`, name: extra.name ?? kind.categoryId, quantity, override: 0, ...kind, ...extra })

const total = (lines, deals = DEALS) => priceCart(lines, deals).total

test('keychains: pairs at the pair price, leftovers at full price', () => {
  assert.equal(total([line(KEYCHAIN, 1)]), 4)
  assert.equal(total([line(KEYCHAIN, 2)]), 7)
  assert.equal(total([line(KEYCHAIN, 3)]), 11)
  assert.equal(total([line(KEYCHAIN, 4)]), 14)
  assert.equal(total([line(KEYCHAIN, 5)]), 18)
})

test('bundle counts across several articles of the same category', () => {
  assert.equal(total([line(KEYCHAIN, 1, { id: 'a' }), line(KEYCHAIN, 2, { id: 'b' })]), 11)
})

test('big items: any 2+ from the group cost 25 each', () => {
  assert.equal(total([line(FIGURE, 1)]), 30)
  assert.equal(total([line(FIGURE, 2)]), 50)
  assert.equal(total([line(FIGURE, 1), line(POKEBALL, 1)]), 50)
  assert.equal(total([line(POKEBALL, 1), line(CASE, 1)]), 50)
  assert.equal(total([line(FIGURE, 1), line(POKEBALL, 1), line(CASE, 1)]), 75)
})

test('an overridden article neither gets nor unlocks a deal', () => {
  assert.equal(total([line(POKEBALL, 1), line(POKEBALL, 1, { id: 'gold', override: 45 })]), 75)
  assert.equal(total([line(KEYCHAIN, 1), line(KEYCHAIN, 1, { id: 'gold', override: 6 })]), 10)
})

test('deals for different categories apply side by side', () => {
  const result = priceCart([line(KEYCHAIN, 2), line(FIGURE, 1)], DEALS)
  assert.equal(result.total, 37)
  assert.deepEqual(result.applied.map(deal => deal.name), ['Keychain 2 for 7'])
})

test('an empty cart costs nothing', () => {
  assert.deepEqual(priceCart([], DEALS), { lines: [], applied: [], subtotal: 0, savings: 0, total: 0 })
})

test('savings are attributed per deal and add up to subtotal minus total', () => {
  const result = priceCart([line(KEYCHAIN, 3), line(FIGURE, 1), line(POKEBALL, 1)], DEALS)
  assert.equal(result.subtotal, 72)
  assert.deepEqual(result.applied.map(deal => [deal.dealId, deal.saving]), [['d-key', 1], ['d-big', 10]])
  assert.equal(result.savings, 11)
  assert.equal(result.total, 61)
})

test('lines carry their unit price and undiscounted line total', () => {
  const [priced] = priceCart([line(KEYCHAIN, 3)], DEALS).lines
  assert.equal(priced.unitPrice, 4)
  assert.equal(priced.lineTotal, 12)
  const [own] = priceCart([line(KEYCHAIN, 2, { override: 6 })], DEALS).lines
  assert.equal(own.unitPrice, 6)
  assert.equal(own.lineTotal, 12)
})

test('a deal that would cost more is not applied', () => {
  const pricey = [{ id: 'bad', name: '2 for 9', type: 'bundle', categories: ['key'], min_qty: 2, price: 9 }]
  const result = priceCart([line(KEYCHAIN, 2)], pricey)
  assert.equal(result.total, 8)
  assert.deepEqual(result.applied, [])
})

test('cent arithmetic stays exact', () => {
  const odd = [{ id: 'odd', name: '2 for 4,99', type: 'bundle', categories: ['x'], min_qty: 2, price: 4.99 }]
  assert.equal(total([{ articleId: 'x1', name: 'x', quantity: 3, categoryId: 'x', basePrice: 2.55, override: 0 }], odd), 7.54)
  assert.equal(total([{ articleId: 'y1', name: 'y', quantity: 3, categoryId: 'y', basePrice: 0.1, override: 0 }], []), 0.3)
})

test("group savings use each item's own base price", () => {
  const mixed = [{ id: 'mix', name: 'Mix', type: 'group', categories: ['a', 'b'], min_qty: 2, price: 10 }]
  const result = priceCart([
    { articleId: 'a1', name: 'a', quantity: 1, categoryId: 'a', basePrice: 12, override: 0 },
    { articleId: 'b1', name: 'b', quantity: 1, categoryId: 'b', basePrice: 15, override: 0 }
  ], mixed)
  assert.equal(result.subtotal, 27)
  assert.equal(result.applied[0].saving, 7)
  assert.equal(result.total, 20)
})

test('invalid deals are skipped instead of throwing', () => {
  const broken = [
    { id: 'none', name: 'no categories', type: 'bundle', categories: [], min_qty: 2, price: 7 },
    { id: 'two', name: 'bundle on two', type: 'bundle', categories: ['key', 'fig'], min_qty: 2, price: 7 },
    { id: 'one', name: 'N of 1', type: 'bundle', categories: ['key'], min_qty: 1, price: 3 },
    { id: 'free', name: 'free', type: 'group', categories: ['fig'], min_qty: 2, price: 0 },
    { id: 'kind', name: 'unknown type', type: 'percent', categories: ['key'], min_qty: 2, price: 1 }
  ]
  assert.equal(total([line(KEYCHAIN, 2), line(FIGURE, 2)], broken), 68)
  broken.forEach(deal => assert.equal(isValidDeal(deal), false, deal.name))
  DEALS.forEach(deal => assert.equal(isValidDeal(deal), true, deal.name))
})

test('deals describe themselves', () => {
  assert.match(describeDeal(DEALS[0]), /^2 for 7,00\s€$/)
  assert.match(describeDeal(DEALS[1]), /^25,00\s€ each from 2$/)
})

test('dealForCategory finds the valid deal a category belongs to', () => {
  assert.equal(dealForCategory(DEALS, 'poke').id, 'd-big')
  assert.equal(dealForCategory(DEALS, 'nope'), undefined)
})

test('overlapping deals never stack: the first deal claims the category', () => {
  const overlapping = [
    { id: 'a', name: 'A pairs', type: 'bundle', categories: ['key'], min_qty: 2, price: 7 },
    { id: 'b', name: 'B group', type: 'group', categories: ['key', 'book'], min_qty: 2, price: 3 }
  ]
  const result = priceCart([line(KEYCHAIN, 2)], overlapping)
  assert.equal(result.total, 7)
  assert.deepEqual(result.applied.map(deal => deal.name), ['A pairs'])
})
