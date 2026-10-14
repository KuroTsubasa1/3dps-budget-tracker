import { test } from 'node:test'
import assert from 'node:assert/strict'
import { priceCart } from '../../utils/deals.js'
import { spread, saleLines, commissionLines } from '../../utils/reports/lines.js'

const CATEGORIES = {
  key: { id: 'cat-keychain', name: 'Keychain', base_price: 4 },
  fig: { id: 'cat-figure', name: 'Big Figure', base_price: 30 },
  big: { id: 'cat-big', name: 'Walldisplay', base_price: 35 },
  coaster: { id: 'cat-coaster', name: 'Coaster', base_price: 8 }
}
const DEALS = [
  { id: 'd-key', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 },
  { id: 'd-big', name: 'Big items', type: 'group', categories: ['cat-figure', 'cat-big'], min_qty: 2, price: 25 },
  { id: 'd-coaster', name: 'Coaster 2 for 15', type: 'bundle', categories: ['cat-coaster'], min_qty: 2, price: 15 }
]

// A cart line as pages/catalog.vue builds it, including the category name
const cartLine = (id, category, quantity, override = 0) => ({
  articleId: id,
  name: `Article ${id}`,
  quantity,
  categoryId: category.id,
  categoryName: category.name,
  basePrice: category.base_price,
  override
})
const cents = value => Math.round(value * 100)
const sumCents = (lines, key) => lines.reduce((sum, line) => sum + cents(line[key]), 0)

test('spread keeps proportions, rounds down and puts the remainder on the last share', () => {
  assert.deepEqual(spread(1000, [1, 1, 1]), [333, 333, 334])
  assert.deepEqual(spread(1500, [3000, 3500]), [692, 808])
  assert.deepEqual(spread(1, [1, 1, 0]), [0, 0, 1])
  assert.deepEqual(spread(0, [5, 5]), [0, 0])
  assert.deepEqual(spread(700, [0, 0]), [350, 350])
  assert.deepEqual(spread(500, []), [])
})

test('a keychain bundle puts its saving on the keychain line', () => {
  const priced = priceCart([cartLine('k1', CATEGORIES.key, 3)], DEALS)
  assert.deepEqual(saleLines(priced, DEALS), [{
    article: 'k1',
    name: 'Article k1',
    category: 'cat-keychain',
    categoryName: 'Keychain',
    quantity: 3,
    unitPrice: 4,
    lineTotal: 12,
    discount: 1,
    deal: 'd-key',
    dealName: 'Keychain 2 for 7'
  }])
})

test('a group deal spreads its saving over its lines by their totals, the remainder on the last', () => {
  const priced = priceCart([cartLine('f1', CATEGORIES.fig, 1), cartLine('w1', CATEGORIES.big, 1)], DEALS)
  assert.equal(priced.total, 50)
  const lines = saleLines(priced, DEALS)
  assert.deepEqual(lines.map(line => [line.lineTotal, line.discount, line.dealName]), [[30, 6.92, 'Big items'], [35, 8.08, 'Big items']])
  assert.equal(sumCents(lines, 'lineTotal') - sumCents(lines, 'discount'), cents(priced.total))
})

test('two deals, an overridden article and a line without a deal add up to the cart total', () => {
  const priced = priceCart([
    cartLine('k1', CATEGORIES.key, 2),
    cartLine('k2', CATEGORIES.key, 1),
    cartLine('f1', CATEGORIES.fig, 1),
    cartLine('f2', CATEGORIES.fig, 1, 45),
    cartLine('w1', CATEGORIES.big, 1),
    cartLine('c1', CATEGORIES.coaster, 1)
  ], DEALS)
  const lines = saleLines(priced, DEALS)
  assert.deepEqual(lines.map(line => [line.article, line.discount, line.deal]), [
    ['k1', 0.66, 'd-key'],
    ['k2', 0.34, 'd-key'],
    ['f1', 6.92, 'd-big'],
    // An overridden article never takes part in a deal
    ['f2', 0, ''],
    ['w1', 8.08, 'd-big'],
    // One coaster does not reach its bundle
    ['c1', 0, '']
  ])
  assert.equal(sumCents(lines, 'discount'), cents(priced.savings))
  assert.equal(sumCents(lines, 'lineTotal') - sumCents(lines, 'discount'), cents(priced.total))
})

test('every cart of up to 5 keychains, 3 figures and 3 coasters adds up to its total', () => {
  for (let keys = 0; keys <= 5; keys++) {
    for (let figures = 0; figures <= 3; figures++) {
      for (let coasters = 0; coasters <= 3; coasters++) {
        const cart = [
          ...(keys ? [cartLine('k1', CATEGORIES.key, Math.ceil(keys / 2)), cartLine('k2', CATEGORIES.key, Math.floor(keys / 2))] : []),
          ...(figures ? [cartLine('f1', CATEGORIES.fig, figures), cartLine('w1', CATEGORIES.big, 1)] : []),
          ...(coasters ? [cartLine('c1', CATEGORIES.coaster, coasters)] : [])
        ].filter(line => line.quantity > 0)
        const priced = priceCart(cart, DEALS)
        const lines = saleLines(priced, DEALS)
        const label = `${keys} keys, ${figures} figures, ${coasters} coasters`
        assert.equal(sumCents(lines, 'lineTotal') - sumCents(lines, 'discount'), cents(priced.total), label)
        assert.ok(lines.every(line => line.discount >= 0), label)
      }
    }
  }
})

test('a cart without deals stores its lines at full price', () => {
  const priced = priceCart([cartLine('c1', CATEGORIES.coaster, 1)], [])
  assert.deepEqual(saleLines(priced, []).map(line => [line.lineTotal, line.discount, line.deal, line.dealName]), [[8, 0, '', '']])
  assert.deepEqual(saleLines(priceCart([], DEALS), DEALS), [])
})

const ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, expand: { category: CATEGORIES.key } },
  { id: 't1', name: 'Totoro', category: 'cat-mini', price: 0, expand: { category: { id: 'cat-mini', name: 'Mini Figure', base_price: 8 } } },
  { id: 's1', name: 'Signed Print', category: 'cat-figure', price: 12.5, expand: { category: CATEGORIES.fig } }
]
const commission = (items, price) => ({ items, agreed_price: price, customer_name: 'Ash' })
const item = (article, name, quantity) => ({ article, name, quantity })

test('a commission spreads its agreed price by list value, the remainder on the last line', () => {
  const lines = commissionLines(commission([item('k1', 'Pikachu Keychain', 2), item('t1', 'Totoro', 1)], 15), ARTICLES)
  assert.deepEqual(lines, [
    { article: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', categoryName: 'Keychain', quantity: 2, unitPrice: 3.75, lineTotal: 7.5, discount: 0, deal: '', dealName: '' },
    { article: 't1', name: 'Totoro', category: 'cat-mini', categoryName: 'Mini Figure', quantity: 1, unitPrice: 7.5, lineTotal: 7.5, discount: 0, deal: '', dealName: '' }
  ])
  const uneven = commissionLines(commission([item('k1', 'Pikachu Keychain', 1), item('t1', 'Totoro', 1), item('s1', 'Signed Print', 1)], 10), ARTICLES)
  // List values 4, 8 and 12.50: 10 € splits as 1.63, 3.26 and the remaining 5.11
  assert.deepEqual(uneven.map(line => line.lineTotal), [1.63, 3.26, 5.11])
  assert.equal(sumCents(uneven, 'lineTotal'), 1000)
})

test('a line whose article is gone gets no share while others have a price', () => {
  const lines = commissionLines(commission([item('k1', 'Pikachu Keychain', 1), item('gone', 'Retired Dino', 2)], 9.99), ARTICLES)
  assert.deepEqual(lines.map(line => [line.name, line.category, line.categoryName, line.lineTotal]), [
    ['Pikachu Keychain', 'cat-keychain', 'Keychain', 9.99],
    ['Retired Dino', '', '', 0]
  ])
})

test('without any priced article the agreed price is spread by quantity', () => {
  const lines = commissionLines(commission([item('gone1', 'Old A', 1), item('gone2', 'Old B', 2)], 10), ARTICLES)
  assert.deepEqual(lines.map(line => [line.lineTotal, line.unitPrice]), [[3.33, 3.33], [6.67, 3.34]])
})

test('a legacy single-article commission is one line at the full price', () => {
  const legacy = { article: 'k1', quantity: 3, items: null, agreed_price: 20, customer_name: 'Ash' }
  assert.deepEqual(commissionLines(legacy, ARTICLES).map(line => [line.name, line.quantity, line.lineTotal]), [['Pikachu Keychain', 3, 20]])
  assert.deepEqual(commissionLines({ items: [], agreed_price: 5 }, ARTICLES), [])
})
