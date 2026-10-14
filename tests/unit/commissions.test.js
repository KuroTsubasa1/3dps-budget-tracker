import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  NEXT,
  PREVIOUS,
  NEXT_ACTION,
  isFinal,
  canCancel,
  transitionPatch,
  dueForAnonymising,
  anonymisedPatch,
  UNKNOWN_ARTICLE,
  itemsOf,
  summaryOf,
  incomeFor,
  validateCommission,
  setLineQuantity,
  removeLine,
  suggestedPriceFor,
  isPaid,
  bookedOnDelivery,
  paymentStep,
  paidPatch,
  unpaidPatch,
  PRICE_LOCKED
} from '../../utils/commissions.js'

const NOW = new Date('2026-10-13T12:00:00.000Z')

const ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, expand: { category: { base_price: 4 } } },
  { id: 't1', name: 'Totoro', category: 'cat-mini', price: 0, expand: { category: { base_price: 8 } } }
]
const DEALS = [{ id: 'd1', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }]
const TWO_LINES = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }]
const QUANTITY = 'Quantity must be a whole number of 1 or more'
const PRICE = 'Agreed price must be above 0'

test('forward, back and cancel moves follow the lifecycle', () => {
  assert.deepEqual(NEXT, { open: 'printing', printing: 'ready', ready: 'delivered' })
  assert.deepEqual(PREVIOUS, { printing: 'open', ready: 'printing' })
  assert.deepEqual(NEXT_ACTION, { open: 'Start printing', printing: 'Mark ready', ready: 'Mark delivered' })
  assert.deepEqual(transitionPatch({ status: 'open' }, 'printing', NOW), { status: 'printing' })
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'printing', NOW), { status: 'printing', ready_at: '' })
  assert.deepEqual(transitionPatch({ status: 'printing' }, 'cancelled', NOW), { status: 'cancelled', cancelled_at: NOW.toISOString() })
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'delivered', NOW), { status: 'delivered', delivered_at: NOW.toISOString() })
})

test('disallowed moves throw', () => {
  assert.throws(() => transitionPatch({ status: 'open' }, 'ready', NOW), /Cannot move a commission from open to ready/)
  assert.throws(() => transitionPatch({ status: 'open' }, 'delivered', NOW), /Cannot move/)
  assert.throws(() => transitionPatch({ status: 'delivered' }, 'ready', NOW), /Cannot move/)
  assert.throws(() => transitionPatch({ status: 'cancelled' }, 'open', NOW), /Cannot move/)
  assert.throws(() => transitionPatch({ status: 'delivered' }, 'cancelled', NOW), /Cannot move/)
})

test('final and cancellable statuses', () => {
  assert.deepEqual(['open', 'printing', 'ready', 'delivered', 'cancelled'].map(isFinal), [false, false, false, true, true])
  assert.deepEqual(['open', 'printing', 'ready', 'delivered', 'cancelled'].map(canCancel), [true, true, true, false, false])
})

test('anonymising is due only after six calendar months', () => {
  const delivered = at => ({ status: 'delivered', delivered_at: at, anonymised_at: '', customer_name: 'Ash' })
  assert.equal(dueForAnonymising(delivered('2026-04-14 12:00:00.000Z'), NOW), false)
  assert.equal(dueForAnonymising(delivered('2026-04-12 12:00:00.000Z'), NOW), true)
  assert.equal(dueForAnonymising({ status: 'cancelled', cancelled_at: '2026-01-01T00:00:00.000Z', anonymised_at: '', customer_name: 'Ash' }, NOW), true)
})

test('open or already anonymised commissions are never due', () => {
  assert.equal(dueForAnonymising({ status: 'ready', delivered_at: '2020-01-01 00:00:00.000Z', anonymised_at: '', customer_name: 'Ash' }, NOW), false)
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: '2020-01-01 00:00:00.000Z', anonymised_at: '2020-08-01 00:00:00.000Z', customer_name: '—', customer_email: '', address: '—' }, NOW), false)
})

test('re-entered customer data is anonymised again after six months', () => {
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: '2026-01-01 00:00:00.000Z', anonymised_at: '2025-12-01 00:00:00.000Z', customer_name: 'Misty', customer_email: 'm@x.de', address: '' }, NOW), true)
})

test('already wiped commissions are not due again', () => {
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: '2020-01-01 00:00:00.000Z', anonymised_at: '2020-08-01 00:00:00.000Z', customer_name: '—', customer_email: '', address: '—' }, NOW), false)
})

test('a finished commission without a valid finish date is due (fail safe)', () => {
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: '', customer_name: 'Misty', customer_email: '', address: '' }, NOW), true)
  assert.equal(dueForAnonymising({ status: 'delivered', delivered_at: 'not a date', customer_name: 'Misty', customer_email: '', address: '' }, NOW), true)
})

test('the six-month cutoff clamps month ends and uses UTC', () => {
  const august = new Date('2026-08-31T12:00:00.000Z')
  const delivered = at => ({ status: 'delivered', delivered_at: at, anonymised_at: '', customer_name: 'Ash' })
  assert.equal(dueForAnonymising(delivered('2026-02-28 12:00:01.000Z'), august), false)
  assert.equal(dueForAnonymising(delivered('2026-02-28 11:59:59.000Z'), august), true)
  assert.equal(dueForAnonymising(delivered('2026-03-01 00:00:00.000Z'), august), false)
})

test('the anonymised patch wipes name, email, phone and address', () => {
  assert.deepEqual(anonymisedPatch(NOW), { customer_name: '—', customer_email: '', customer_phone: '', address: '—', anonymised_at: NOW.toISOString() })
})

test('a finished commission that still holds only a phone number is due for anonymising', () => {
  const old = { status: 'delivered', delivered_at: '2020-01-01 00:00:00.000Z', customer_name: '—', customer_email: '', address: '—' }
  assert.equal(dueForAnonymising({ ...old, customer_phone: '+49 151 1234567' }, NOW), true)
  assert.equal(dueForAnonymising({ ...old, customer_phone: '' }, NOW), false)
})

test('delivery income names every line with its quantity, and the customer', () => {
  assert.deepEqual(
    incomeFor({ items: TWO_LINES, customer_name: 'Ash Ketchum', agreed_price: 15 }),
    { description: 'Commission: Pikachu Keychain × 2, Totoro × 1 (Ash Ketchum)', amount: 15 }
  )
  assert.deepEqual(
    incomeFor({ article: 'f1', quantity: 1, expand: { article: { name: 'Glurak Figure' } }, customer_name: 'Ash Ketchum', agreed_price: 30 }),
    { description: 'Commission: Glurak Figure × 1 (Ash Ketchum)', amount: 30 }
  )
})

const LINE = { article: 'k1', name: 'Pikachu Keychain', quantity: 2 }
const VALID = { customerName: 'Misty', email: 'misty@example.com', items: [LINE], fulfilment: 'pickup', address: '', price: '7,00' }
const withQuantity = quantity => ({ ...VALID, items: [{ ...LINE, quantity }] })

test('a complete commission is valid', () => {
  assert.equal(validateCommission(VALID), '')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: 'Krete 8, Eutin' }), '')
})

test('the email is optional, but a given one must be valid', () => {
  assert.equal(validateCommission({ ...VALID, email: '' }), '')
  assert.equal(validateCommission({ ...VALID, email: '   ' }), '')
  assert.equal(validateCommission({ ...VALID, email: undefined }), '')
  assert.equal(validateCommission({ ...VALID, email: 'not-an-email' }), 'Enter a valid email address')
})

test('validation names the first problem in a fixed order', () => {
  assert.equal(validateCommission({ ...VALID, customerName: '  ' }), "Enter the customer's name")
  assert.equal(validateCommission({ ...VALID, email: 'nope' }), 'Enter a valid email address')
  assert.equal(validateCommission({ ...VALID, items: [] }), 'Add at least one article')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: ' ' }), 'Enter an address for shipping')
  assert.equal(validateCommission(withQuantity(0)), QUANTITY)
  assert.equal(validateCommission(withQuantity('1.5')), QUANTITY)
  assert.equal(validateCommission({ ...VALID, price: '0' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '' }), PRICE)
  // The order holds: an empty list comes after the email and before the address, quantity and price
  assert.equal(validateCommission({ ...VALID, email: 'nope', items: [] }), 'Enter a valid email address')
  assert.equal(validateCommission({ ...VALID, items: [], fulfilment: 'shipping', address: '', price: '' }), 'Add at least one article')
})

test('an anonymised commission skips the customer data checks but keeps the rest', () => {
  const anonymised = { ...VALID, anonymised: true, customerName: '', email: '', fulfilment: 'shipping', address: '' }
  assert.equal(validateCommission(anonymised), '')
  assert.equal(validateCommission({ ...anonymised, items: [{ ...LINE, quantity: 0 }] }), QUANTITY)
  assert.equal(validateCommission({ ...anonymised, items: [] }), 'Add at least one article')
})

test('moving to ready stamps ready_at and moving back clears it', () => {
  assert.deepEqual(transitionPatch({ status: 'printing' }, 'ready', NOW), { status: 'ready', ready_at: NOW.toISOString() })
  assert.deepEqual(transitionPatch({ status: 'ready' }, 'printing', NOW), { status: 'printing', ready_at: '' })
  assert.deepEqual(transitionPatch({ status: 'printing' }, 'open', NOW), { status: 'open' })
  assert.deepEqual(transitionPatch({ status: 'open' }, 'printing', NOW), { status: 'printing' })
})

test('a missing or unknown target is a disallowed move', () => {
  assert.throws(() => transitionPatch({}, undefined, NOW), /Cannot move a commission from undefined to undefined/)
  assert.throws(() => transitionPatch({ status: 'open' }, undefined, NOW), /Cannot move a commission from open to undefined/)
  assert.throws(() => transitionPatch({ status: 'open' }, 'bogus', NOW), /Cannot move/)
})

test('quantity and price accept plain numbers only', () => {
  assert.equal(validateCommission(withQuantity('1e0')), QUANTITY)
  assert.equal(validateCommission(withQuantity('Infinity')), QUANTITY)
  assert.equal(validateCommission(withQuantity('0x10')), QUANTITY)
  assert.equal(validateCommission(withQuantity(' 3 ')), '')
  assert.equal(validateCommission({ ...VALID, price: '1e1' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: 'Infinity' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '1,234' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '-5' }), PRICE)
  assert.equal(validateCommission({ ...VALID, price: '7.5' }), '')
  assert.equal(validateCommission({ ...VALID, price: ' 12 ' }), '')
})

test('a record holding only an email still holds customer data', () => {
  const wiped = { status: 'delivered', delivered_at: '2020-01-01 00:00:00.000Z', customer_name: '—', address: '—' }
  assert.equal(dueForAnonymising({ ...wiped, customer_email: 'a@b.de' }, NOW), true)
  assert.equal(dueForAnonymising({ ...wiped, customer_email: '' }, NOW), false)
  assert.equal(dueForAnonymising(wiped, NOW), false)
})

test('itemsOf uses the saved lines, with the current name of an active article', () => {
  const items = [{ article: 'k1', name: 'Old Pikachu', quantity: 2 }, { article: 'gone', name: 'Retired Dino', quantity: 1 }]
  assert.deepEqual(itemsOf({ items, article: 'f1', quantity: 9 }, ARTICLES), [
    { article: 'k1', name: 'Pikachu Keychain', quantity: 2 },
    { article: 'gone', name: 'Retired Dino', quantity: 1 }
  ])
  assert.deepEqual(itemsOf({ items }), items)
})

test('itemsOf reads a legacy commission as one line', () => {
  const legacy = { article: 'k1', quantity: 3 }
  assert.equal(UNKNOWN_ARTICLE, 'Unknown article')
  assert.deepEqual(itemsOf({ ...legacy, expand: { article: { name: 'From expand' } } }, ARTICLES), [{ article: 'k1', name: 'From expand', quantity: 3 }])
  assert.deepEqual(itemsOf(legacy, ARTICLES), [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }])
  assert.deepEqual(itemsOf({ ...legacy, article: 'gone' }, ARTICLES), [{ article: 'gone', name: 'Unknown article', quantity: 3 }])
  // PocketBase returns an empty json field as null; an empty list counts as no items too
  assert.deepEqual(itemsOf({ ...legacy, items: null }, ARTICLES), [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }])
  assert.deepEqual(itemsOf({ ...legacy, items: [] }, ARTICLES), [{ article: 'k1', name: 'Pikachu Keychain', quantity: 3 }])
})

test('itemsOf returns no lines without items or an article', () => {
  assert.deepEqual(itemsOf({ items: [], article: '' }), [])
  assert.deepEqual(itemsOf({ items: null }), [])
  assert.deepEqual(itemsOf({}), [])
})

test('summaryOf writes × only above 1 and folds more than two lines', () => {
  const line = (name, quantity) => ({ article: name, name, quantity })
  assert.equal(summaryOf({ items: TWO_LINES }), 'Pikachu Keychain × 2, Totoro')
  assert.equal(summaryOf({ items: [line('Totoro', 1)] }), 'Totoro')
  assert.equal(summaryOf({ items: [line('A', 1), line('B', 3), line('C', 1)] }), 'A, B × 3 +1 more')
  assert.equal(summaryOf({ items: [line('A', 1), line('B', 3), line('C', 1), line('D', 2)] }), 'A, B × 3 +2 more')
  assert.equal(summaryOf({ article: 'f1', quantity: 1, expand: { article: { name: 'Glurak Figure' } } }), 'Glurak Figure')
  assert.equal(summaryOf({}), '')
})

test('setLineQuantity stays at 1 or more and removeLine drops one line', () => {
  assert.deepEqual(setLineQuantity(TWO_LINES, 0, 3).map(line => line.quantity), [3, 1])
  assert.deepEqual(setLineQuantity(TWO_LINES, 1, 0).map(line => line.quantity), [2, 1])
  assert.deepEqual(setLineQuantity(TWO_LINES, 5, 4), TWO_LINES)
  assert.deepEqual(removeLine(TWO_LINES, 0), [TWO_LINES[1]])
  assert.deepEqual(removeLine(removeLine(TWO_LINES, 0), 0), [])
  assert.equal(TWO_LINES.length, 2, 'the input is not changed')
})

test('the suggested price runs every line through the deals', () => {
  assert.equal(suggestedPriceFor(TWO_LINES, ARTICLES, DEALS), 15)
  assert.equal(suggestedPriceFor(TWO_LINES, ARTICLES, []), 16)
  // A line whose article is no longer active has no price to suggest
  assert.equal(suggestedPriceFor([...TWO_LINES, { article: 'gone', name: 'Retired Dino', quantity: 1 }], ARTICLES, DEALS), 15)
  assert.equal(suggestedPriceFor([], ARTICLES, DEALS), 0)
})

test('a bad quantity on any line is refused', () => {
  assert.equal(validateCommission({ ...VALID, items: [LINE, { article: 't1', name: 'Totoro', quantity: 0 }] }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, items: [LINE, { article: 't1', name: 'Totoro', quantity: 2.5 }] }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, items: [LINE, { article: 't1', name: 'Totoro', quantity: 1 }] }), '')
})

const paid = overrides => ({ status: 'open', delivered_at: '', paid_at: '', payment_transaction: '', ...overrides })

test('a commission is paid while paid_at is set', () => {
  assert.equal(isPaid(paid({ paid_at: '2026-10-14 10:00:00.000Z' })), true)
  assert.equal(isPaid(paid()), false)
  assert.equal(isPaid({}), false)
})

test('only a delivered commission without a payment transaction had its income booked on delivery', () => {
  assert.equal(bookedOnDelivery(paid({ status: 'delivered', delivered_at: '2026-10-01 10:00:00.000Z' })), true)
  assert.equal(bookedOnDelivery(paid({ status: 'delivered', delivered_at: '2026-10-01 10:00:00.000Z', payment_transaction: 'tx1' })), false)
  assert.equal(bookedOnDelivery(paid({ status: 'delivered', delivered_at: '' })), false)
  assert.equal(bookedOnDelivery(paid({ status: 'ready' })), false)
  assert.equal(bookedOnDelivery(paid({ status: 'cancelled', delivered_at: '' })), false)
})

test('the payment step follows the re-read commission', () => {
  const at = '2026-10-14 10:00:00.000Z'
  // Paid elsewhere with an income: check that income exists before booking it again
  assert.deepEqual(paymentStep(paid({ paid_at: at, payment_transaction: 'tx1' })), { step: 'verify', recordId: 'tx1' })
  // Paid without an income ("Only mark paid"): nothing to book
  assert.deepEqual(paymentStep(paid({ paid_at: at })), { step: 'done' })
  assert.deepEqual(paymentStep(paid({ paid_at: at, status: 'delivered', delivered_at: at })), { step: 'done' })
  // An old delivered commission asks first; the owner's choice decides
  const old = paid({ status: 'delivered', delivered_at: at })
  assert.deepEqual(paymentStep(old), { step: 'ask' })
  assert.deepEqual(paymentStep(old, 'only'), { step: 'mark' })
  assert.deepEqual(paymentStep(old, 'book'), { step: 'book' })
  // Not paid: book
  assert.deepEqual(paymentStep(paid()), { step: 'book' })
  assert.deepEqual(paymentStep(paid({ status: 'cancelled' })), { step: 'book' })
})

test('the paid patch names the income, the unpaid patch clears both fields', () => {
  assert.deepEqual(paidPatch('tx0000000000001', NOW), { paid_at: NOW.toISOString(), payment_transaction: 'tx0000000000001' })
  assert.deepEqual(paidPatch('', NOW), { paid_at: NOW.toISOString() })
  assert.deepEqual(unpaidPatch(), { paid_at: '', payment_transaction: '' })
})

test('a paid commission refuses a changed price and allows everything else', () => {
  assert.equal(PRICE_LOCKED, 'Switch to Unpaid to change the price')
  assert.equal(validateCommission({ ...VALID, price: '7,00', lockedPrice: 7 }), '')
  assert.equal(validateCommission({ ...VALID, price: '7', lockedPrice: 7 }), '')
  assert.equal(validateCommission({ ...VALID, price: '8,00', lockedPrice: 7 }), PRICE_LOCKED)
  assert.equal(validateCommission({ ...VALID, price: '8,00', lockedPrice: null }), '')
  assert.equal(validateCommission({ ...VALID, price: '8,00' }), '')
})
