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
  incomeFor,
  validateCommission
} from '../../utils/commissions.js'

const NOW = new Date('2026-10-13T12:00:00.000Z')

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

test('the anonymised patch wipes name, email and address', () => {
  assert.deepEqual(anonymisedPatch(NOW), { customer_name: '—', customer_email: '', address: '—', anonymised_at: NOW.toISOString() })
})

test('delivery income names the article, quantity and customer', () => {
  assert.deepEqual(
    incomeFor({ quantity: 2, customer_name: 'Ash Ketchum', agreed_price: 7 }, 'Pikachu Keychain'),
    { description: 'Commission: Pikachu Keychain × 2 (Ash Ketchum)', amount: 7 }
  )
})

const VALID = { customerName: 'Misty', email: 'misty@example.com', article: 'k1', fulfilment: 'pickup', address: '', quantity: '2', price: '7,00' }

test('a complete commission is valid', () => {
  assert.equal(validateCommission(VALID), '')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: 'Krete 8, Eutin' }), '')
})

test('validation names the first problem in a fixed order', () => {
  assert.equal(validateCommission({ ...VALID, customerName: '  ' }), "Enter the customer's name")
  assert.equal(validateCommission({ ...VALID, email: 'nope' }), 'Enter a valid email address')
  assert.equal(validateCommission({ ...VALID, article: '' }), 'Choose an article')
  assert.equal(validateCommission({ ...VALID, fulfilment: 'shipping', address: ' ' }), 'Enter an address for shipping')
  assert.equal(validateCommission({ ...VALID, quantity: '0' }), 'Quantity must be a whole number of 1 or more')
  assert.equal(validateCommission({ ...VALID, quantity: '1.5' }), 'Quantity must be a whole number of 1 or more')
  assert.equal(validateCommission({ ...VALID, price: '0' }), 'Agreed price must be above 0')
  assert.equal(validateCommission({ ...VALID, price: '' }), 'Agreed price must be above 0')
})

test('an anonymised commission skips the customer data checks but keeps the rest', () => {
  const anonymised = { ...VALID, anonymised: true, customerName: '', email: '', fulfilment: 'shipping', address: '' }
  assert.equal(validateCommission(anonymised), '')
  assert.equal(validateCommission({ ...anonymised, quantity: '0' }), 'Quantity must be a whole number of 1 or more')
  assert.equal(validateCommission({ ...anonymised, article: '' }), 'Choose an article')
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
  const QUANTITY = 'Quantity must be a whole number of 1 or more'
  const PRICE = 'Agreed price must be above 0'
  assert.equal(validateCommission({ ...VALID, quantity: '1e0' }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, quantity: 'Infinity' }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, quantity: '0x10' }), QUANTITY)
  assert.equal(validateCommission({ ...VALID, quantity: ' 3 ' }), '')
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
