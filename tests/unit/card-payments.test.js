import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CARD_NOTIFIER_FIELDS,
  GIVE_UP_MS,
  chargeInput,
  statusFromTransaction,
  callbackUrl,
  hashToken,
  tokenMatches,
  normalisePairingCode,
  terminalStatus,
  pairTerminal,
  unpairTerminal,
  startCharge,
  checkPayment,
  callbackMatches,
  cancelCharge,
  createCardPoller,
  createOwnerStore,
  refreshPayment,
  markSandbox,
  createSandboxCheck,
  cardErrorFor,
  publicHost,
  DOUBLE_CHARGE_MS
} from '../../server/utils/cardPayments.js'
import { SumUpError } from '../../server/utils/sumup.js'
import { CARD_NOTIFIER_FIELDS as RULE_FIELDS } from '../../scripts/lib/pb-plan.mjs'

const READER = { id: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65', name: 'Akinai', status: 'paired', device: { identifier: 'S1', model: 'virtual-solo' } }
const START = Date.parse('2026-10-16T10:00:00.000Z')
const CART = { description: '3D Printing Products:\nPikachu Keychain (4,00 € × 2)', amount: 8, items: [], stockMovements: [], prizes: { count: 0, categories: [] } }
const silent = { info () {}, error () {} }

// A SumUp stand-in: readers, the transactions it knows by our record id, and every call made
function fakeSumUp ({ readers = [READER], transactions = {}, fail = {} } = {}) {
  const calls = []
  const step = async (name, value) => {
    calls.push(name)
    if (fail[name]) throw fail[name]
    return value
  }
  return {
    calls,
    transactions,
    listReaders: () => step('listReaders', structuredClone(readers)),
    readerStatus: () => step('readerStatus', { status: 'ONLINE' }),
    createReader: ({ pairingCode, name }) => step(`createReader ${pairingCode}`, { id: 'rdr_NEW', name, status: 'processing' }),
    deleteReader: id => step(`deleteReader ${id}`, null),
    checkout: (readerId, body) => step(`checkout ${readerId}`, { client_transaction_id: 'ctx-1', body }),
    terminate: readerId => step(`terminate ${readerId}`, null),
    findTransaction: ({ clientTransactionId, foreignTransactionId }) =>
      step(`findTransaction ${clientTransactionId || foreignTransactionId}`, transactions[foreignTransactionId] ?? null)
  }
}

// A card payment store (the owner's or the notifier's) on an in-memory collection; updates may only touch
// the notifier's fields. A create answers the record as pay000000000001 and keeps what was sent in `created`.
function fakeStore (payments = []) {
  const db = new Map(payments.map(payment => [payment.id, structuredClone(payment)]))
  return {
    db,
    updates: [],
    created: [],
    async createCardPayment (data) {
      this.created.push(data)
      return { id: 'pay000000000001', created: '2026-10-16 10:00:00.000Z', ...data }
    },
    async getCardPayment (id) {
      if (!db.has(id)) throw Object.assign(new Error('Not found'), { status: 404 })
      return structuredClone(db.get(id))
    },
    async listRecentPending (since) { return [...db.values()].filter(payment => payment.status === 'pending' && payment.created >= since) },
    async listPendingCardPayments () { return [...db.values()].filter(payment => payment.status === 'pending') },
    async updateCardPayment (id, patch) {
      assert.deepEqual(Object.keys(patch).filter(key => !CARD_NOTIFIER_FIELDS.includes(key)), [], 'the notifier writes only its fields')
      this.updates.push([id, patch])
      Object.assign(db.get(id), patch)
    }
  }
}
const payment = (id, extra = {}) => ({ id, status: 'pending', amount: 8, source: 'cart', cart: CART, sumup_checkout: '', sumup_transaction: '', booked_transaction: '', callback_token: hashToken('token-1'), created: '2026-10-16 10:00:00.000Z', ...extra })

test('the server writes the same three fields the notifier rule allows', () => {
  assert.deepEqual(CARD_NOTIFIER_FIELDS, RULE_FIELDS)
})

test('a charge needs a known source, an amount above 0 and the booking, and always says Akinai sale', () => {
  const cart = { ...CART, amount: 19.9 }
  assert.deepEqual(chargeInput({ source: 'cart', amount: 19.9, description: 'anything', cart }), { source: 'cart', amount: 19.9, cents: 1990, description: 'Akinai sale', cart })
  // Float noise is rounded to the cent
  assert.equal(chargeInput({ source: 'home', amount: 0.1 + 0.2, cart: { amount: 0.3 } }).cents, 30)
  const refused = (body, message) => assert.throws(() => chargeInput(body), error => error.statusCode === 400 && error.statusMessage === message)
  for (const amount of [0, -5, 0.004, '12', NaN, Infinity, null]) refused({ source: 'cart', amount, cart: { amount } }, 'Enter an amount above 0')
  // 10 000 € is the most one payment may be
  for (const amount of [10_000.01, 1_000_000.01]) refused({ source: 'cart', amount, cart: { amount } }, 'The amount is above 10 000 €')
  assert.equal(chargeInput({ source: 'cart', amount: 10_000, cart: { amount: 10_000 } }).cents, 1_000_000)
  refused({ source: 'till', amount: 5, cart: CART }, 'Unknown payment source')
  // The cart's own total must be the amount charged
  refused({ source: 'cart', amount: 5, cart: CART }, "The cart total doesn't match the amount")
  refused({ source: 'cart', amount: 5, cart: { items: [] } }, "The cart total doesn't match the amount")
  refused({ source: 'cart', amount: 5, cart: { amount: '5' } }, "The cart total doesn't match the amount")
  refused({ source: 'cart', amount: 5.01, cart: { amount: 5 } }, "The cart total doesn't match the amount")
  refused({ source: 'cart', amount: 5 }, 'Missing the sale to book')
  refused({ source: 'cart', amount: 5, cart: [CART] }, 'Missing the sale to book')
  refused({ source: 'cart', amount: 5, cart: { amount: 5, note: 'x'.repeat(200_001) } }, 'The cart is too large for one payment')
  refused(null, 'Unknown payment source')
})

test('SumUp\'s transaction status becomes the payment\'s status', () => {
  assert.deepEqual(['SUCCESSFUL', 'REFUNDED', 'CANCELLED', 'FAILED', 'PENDING', 'SOMETHING_NEW', undefined].map(status => statusFromTransaction(status ? { status } : null)),
    ['approved', 'approved', 'cancelled', 'declined', 'pending', 'pending', 'pending'])
})

test('the return URL is https on a public host, and none on localhost, IPs or bad hosts', () => {
  assert.equal(callbackUrl('akinai.lasseharm.space', 'pay000000000001', 'tok'), 'https://akinai.lasseharm.space/api/card/callback/pay000000000001/tok')
  for (const host of ['localhost:3000', 'localhost', '127.0.0.1:3668', '192.168.1.20', 'myphone', 'evil.example/x?', '', undefined, 'app.localhost']) {
    assert.equal(callbackUrl(host, 'pay000000000001', 'tok'), null, String(host))
  }
})

test('the callback token is stored as its hash and compared in constant time', () => {
  const stored = hashToken('token-1')
  assert.equal(stored.length, 64)
  assert.ok(!stored.includes('token-1'))
  assert.equal(tokenMatches('token-1', stored), true)
  assert.equal(tokenMatches('token-2', stored), false)
  assert.equal(tokenMatches('token-1', ''), false)
  assert.equal(tokenMatches('token-1', undefined), false)
})

test('the terminal is the first paired reader, with its online status, or unknown when SumUp cannot say', async () => {
  assert.deepEqual(await terminalStatus({ sumup: fakeSumUp() }), { paired: true, reader: { id: READER.id, name: 'Akinai', status: 'online' } })
  assert.deepEqual(await terminalStatus({ sumup: fakeSumUp({ readers: [{ ...READER, status: 'expired' }] }) }), { paired: false, reader: null })
  const old = fakeSumUp({ fail: { readerStatus: new SumUpError('not_found', 404) } })
  assert.equal((await terminalStatus({ sumup: old })).reader.status, 'unknown')
})

test('pairing checks the code first, refuses a second terminal and turns SumUp\'s refusal into a plain message', async () => {
  assert.equal(normalisePairingCode(' ab12-cd 34 '), 'AB12CD34')
  const none = fakeSumUp({ readers: [] })
  assert.equal((await pairTerminal({ sumup: none, code: 'ab12cd34' })).reader.id, 'rdr_NEW')
  assert.deepEqual(none.calls, ['listReaders', 'createReader AB12CD34'])

  for (const code of ['', 'ABC', 'AB12CD34567', 'AB12CD3!', null]) {
    const sumup = fakeSumUp({ readers: [] })
    await assert.rejects(pairTerminal({ sumup, code }), error => error.statusCode === 400 && error.statusMessage === 'Enter the code the Solo shows')
    assert.deepEqual(sumup.calls, [], 'a bad code never reaches SumUp')
  }
  await assert.rejects(pairTerminal({ sumup: fakeSumUp(), code: 'AB12CD34' }), error => error.statusCode === 409)
  for (const kind of ['not_found', 'invalid', 'conflict']) {
    await assert.rejects(pairTerminal({ sumup: fakeSumUp({ readers: [], fail: { 'createReader AB12CD34': new SumUpError(kind, 404) } }), code: 'AB12CD34' }),
      error => error.statusCode === 400 && /didn't work/.test(error.statusMessage))
  }
  await assert.rejects(pairTerminal({ sumup: fakeSumUp({ readers: [], fail: { 'createReader AB12CD34': new SumUpError('timeout') } }), code: 'AB12CD34' }), error => error.statusCode === 502)
})

test('unpairing deletes the paired reader, and a reader already gone is fine', async () => {
  const sumup = fakeSumUp()
  assert.deepEqual(await unpairTerminal({ sumup }), { paired: false, reader: null })
  assert.deepEqual(sumup.calls, ['listReaders', `deleteReader ${READER.id}`])
  await unpairTerminal({ sumup: fakeSumUp({ fail: { [`deleteReader ${READER.id}`]: new SumUpError('not_found', 404) } }) })
})

const INPUT = chargeInput({ source: 'cart', amount: 19.9, cart: { ...CART, amount: 19.9 } })

test('a charge creates the pending record as the owner, then sends the checkout with the return URL', async () => {
  const sumup = fakeSumUp()
  const store = fakeStore([payment('pay000000000001')])
  const result = await startCharge({ input: INPUT, sumup, store, host: 'akinai.lasseharm.space', newToken: () => 'token-1', log: silent })
  assert.deepEqual(result, { id: 'pay000000000001' })
  assert.deepEqual(store.created, [{ amount: 19.9, description: 'Akinai sale', source: 'cart', cart: INPUT.cart, status: 'pending', callback_token: hashToken('token-1') }])
  assert.deepEqual(sumup.calls, ['listReaders', `checkout ${READER.id}`])
  assert.deepEqual(store.updates, [['pay000000000001', { sumup_checkout: 'ctx-1' }]])
})

const CHECKOUT = `checkout ${READER.id}`
const TERMINATE = `terminate ${READER.id}`
const FOREIGN = 'findTransaction pay000000000001'
const charge = (store, sumup, now = START + 61_000) => startCharge({ input: INPUT, sumup, store, host: 'akinai.lasseharm.space', now, log: silent })

test('a terminal SumUp says is offline fails the payment at once with the terminal message', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ fail: { [CHECKOUT]: new SumUpError('offline', 422) } })
  await assert.rejects(charge(store, sumup), error => error.statusCode === 502 && error.statusMessage === "The terminal didn't answer. Check that it's on and online.")
  assert.equal(store.db.get('pay000000000001').status, 'failed')
  assert.deepEqual(sumup.calls, ['listReaders', CHECKOUT])
})

test('a checkout SumUp refuses (4xx) fails the payment at once', async () => {
  for (const kind of ['invalid', 'unauthorized', 'conflict']) {
    const store = fakeStore([payment('pay000000000001')])
    await assert.rejects(charge(store, fakeSumUp({ fail: { [CHECKOUT]: new SumUpError(kind, 400) } })),
      error => error.statusCode === 502 && error.statusMessage === "The payment didn't go through")
    assert.equal(store.db.get('pay000000000001').status, 'failed')
  }
})

test('a checkout that gets no answer is failed only when the stop worked, SumUp says it does not know the payment and a minute has passed', async () => {
  for (const kind of ['timeout', 'unreachable', 'failed']) {
    const store = fakeStore([payment('pay000000000001')])
    const sumup = fakeSumUp({ fail: { [CHECKOUT]: new SumUpError(kind, kind === 'failed' ? 503 : 0) } })
    await assert.rejects(charge(store, sumup), error => error.statusCode === 502 && error.statusMessage === "The terminal didn't answer. Check that it's on and online.")
    assert.equal(store.db.get('pay000000000001').status, 'failed')
    assert.deepEqual(sumup.calls, ['listReaders', CHECKOUT, TERMINATE, FOREIGN])
  }
})

test('right after the start SumUp not knowing the payment is weak evidence: it stays pending until a later check, and a later SUCCESSFUL wins', async () => {
  const id = 'pay000000000001'
  const store = fakeStore([payment(id)])
  const fail = { [CHECKOUT]: new SumUpError('timeout') }
  // The record stands for the payment being started here, so the double tap rule must not see it
  const first = Object.assign(Object.create(store), { listRecentPending: async () => [] })
  assert.deepEqual(await charge(first, fakeSumUp({ fail }), START + 5000), { id })
  assert.equal(store.db.get(id).status, 'pending')
  assert.deepEqual(store.updates, [])
  // Exactly 60 s is still not past the minute (the same payment, charged again)
  assert.deepEqual(await charge(first, fakeSumUp({ fail }), START + 60_000), { id })
  assert.equal(store.db.get(id).status, 'pending')
  // A later check that SumUp does not know it keeps it pending until the 10-minute rule
  assert.equal(await checkPayment({ store, sumup: fakeSumUp(), id, now: START + 90_000, log: silent }), 'pending')
  assert.equal(await checkPayment({ store, sumup: fakeSumUp(), id, now: START + GIVE_UP_MS, log: silent }), 'failed')
  const late = fakeStore([payment(id)])
  await charge(Object.assign(Object.create(late), { listRecentPending: async () => [] }), fakeSumUp({ fail }), START + 5000)
  const paid = fakeSumUp({ transactions: { [id]: { id: 'u', transaction_code: 'TX1', status: 'SUCCESSFUL' } } })
  assert.equal(await checkPayment({ store: late, sumup: paid, id, now: START + 20_000, log: silent }), 'approved')
})

test('a checkout that gets no answer stays pending when the stop or the lookup does not settle it, and the sheet still watches it', async () => {
  const stays = [
    { fail: { [CHECKOUT]: new SumUpError('timeout'), [TERMINATE]: new SumUpError('invalid', 400) } },
    { fail: { [CHECKOUT]: new SumUpError('timeout'), [FOREIGN]: new SumUpError('timeout') } },
    { fail: { [CHECKOUT]: new SumUpError('failed', 502) }, transactions: { pay000000000001: { id: 'u', status: 'PENDING' } } }
  ]
  for (const options of stays) {
    const store = fakeStore([payment('pay000000000001')])
    assert.deepEqual(await charge(store, fakeSumUp(options)), { id: 'pay000000000001' })
    assert.equal(store.db.get('pay000000000001').status, 'pending')
    assert.deepEqual(store.updates, [])
  }
})

test('no paired terminal, or SumUp unreachable before the start, creates no record', async () => {
  for (const sumup of [fakeSumUp({ readers: [] }), fakeSumUp({ fail: { listReaders: new SumUpError('timeout') } })]) {
    const store = fakeStore()
    await assert.rejects(startCharge({ input: INPUT, sumup, store, host: 'x.example', log: silent }), error => [409, 502].includes(error.statusCode))
    assert.deepEqual(store.created, [])
  }
})

test('a check records SumUp\'s result and transaction code once, and leaves a settled payment alone', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'uuid-1', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL' } } })
  assert.equal(await checkPayment({ store, sumup, id: 'pay000000000001', now: START + 5000, log: silent }), 'approved')
  assert.deepEqual(store.updates, [['pay000000000001', { status: 'approved', sumup_transaction: 'TEENSK4W2K' }]])
  assert.equal(await checkPayment({ store, sumup, id: 'pay000000000001', now: START + 9000, log: silent }), 'approved')
  assert.equal(store.updates.length, 1)
  // Looked up by SumUp's client transaction id once it is known
  const known = fakeStore([payment('pay000000000002', { sumup_checkout: 'ctx-2' })])
  const lookup = fakeSumUp()
  await checkPayment({ store: known, sumup: lookup, id: 'pay000000000002', now: START, log: silent })
  assert.deepEqual(lookup.calls, ['findTransaction ctx-2'])
})

test('a declined or cancelled card is recorded as such', async () => {
  for (const [status, expected] of [['FAILED', 'declined'], ['CANCELLED', 'cancelled']]) {
    const store = fakeStore([payment('pay000000000001')])
    const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'uuid-1', transaction_code: 'TX1', status } } })
    assert.equal(await checkPayment({ store, sumup, id: 'pay000000000001', now: START, log: silent }), expected)
  }
})

test('after 10 minutes a payment SumUp answers it does not know is failed, unless SumUp says it is still pending or does not answer', async () => {
  const unknown = fakeStore([payment('pay000000000001')])
  assert.equal(await checkPayment({ store: unknown, sumup: fakeSumUp(), id: 'pay000000000001', now: START + GIVE_UP_MS - 1, log: silent }), 'pending')
  assert.equal(await checkPayment({ store: unknown, sumup: fakeSumUp(), id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent }), 'failed')
  // SumUp not answering never gives a payment up
  const silentSumUp = fakeStore([payment('pay000000000001')])
  assert.equal(await checkPayment({ store: silentSumUp, sumup: fakeSumUp({ fail: { 'findTransaction pay000000000001': new SumUpError('timeout') } }), id: 'pay000000000001', now: START + 3 * GIVE_UP_MS, log: silent }), 'pending')
  assert.deepEqual(silentSumUp.updates, [])
  const pending = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'uuid-1', status: 'PENDING' } } })
  assert.equal(await checkPayment({ store: pending, sumup, id: 'pay000000000001', now: START + 60 * 60_000, log: silent }), 'pending')
  assert.deepEqual(pending.updates, [])
})

test('the callback needs the payment\'s own token; anything else is no match', async () => {
  const store = fakeStore([payment('pay000000000001')])
  assert.equal(await callbackMatches({ store, id: 'pay000000000001', token: 'token-1' }), true)
  assert.equal(await callbackMatches({ store, id: 'pay000000000001', token: 'token-2' }), false)
  assert.equal(await callbackMatches({ store, id: 'pay000000000009', token: 'token-1' }), false)
  assert.equal(await callbackMatches({ store, id: '../../users', token: 'token-1' }), false)
  assert.equal(await callbackMatches({ store, id: 'pay000000000001', token: '' }), false)
})

test('Cancel on terminal stops the checkout and records cancelled, or approved when the card went through', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp()
  assert.deepEqual(await cancelCharge({ store, sumup, id: 'pay000000000001', now: START + 61_000, log: silent }), { status: 'cancelled' })
  assert.deepEqual(sumup.calls, ['listReaders', `terminate ${READER.id}`, 'findTransaction pay000000000001'])
  assert.equal(store.db.get('pay000000000001').status, 'cancelled')

  const paid = fakeStore([payment('pay000000000001')])
  assert.deepEqual(await cancelCharge({ store: paid, sumup: fakeSumUp({ transactions: { pay000000000001: { id: 'u', transaction_code: 'TX9', status: 'SUCCESSFUL' } } }), id: 'pay000000000001', log: silent }), { status: 'approved' })
  assert.equal(paid.db.get('pay000000000001').sumup_transaction, 'TX9')

  // Nothing left to stop and no result yet: the poll settles it
  const racing = fakeStore([payment('pay000000000001')])
  assert.deepEqual(await cancelCharge({ store: racing, sumup: fakeSumUp({ fail: { [`terminate ${READER.id}`]: new SumUpError('invalid', 400) } }), id: 'pay000000000001', log: silent }), { status: 'pending' })
  assert.deepEqual(racing.updates, [])

  // A settled payment is not touched; an offline terminal keeps it pending with the terminal message
  const settled = fakeStore([payment('pay000000000001', { status: 'declined' })])
  assert.deepEqual(await cancelCharge({ store: settled, sumup: fakeSumUp(), id: 'pay000000000001', log: silent }), { status: 'declined' })
  const offline = fakeStore([payment('pay000000000001')])
  await assert.rejects(cancelCharge({ store: offline, sumup: fakeSumUp({ fail: { [`terminate ${READER.id}`]: new SumUpError('offline', 422) } }), id: 'pay000000000001', log: silent }), error => error.statusCode === 502)
  assert.equal(offline.db.get('pay000000000001').status, 'pending')
  await assert.rejects(cancelCharge({ store: offline, sumup: fakeSumUp(), id: 'nope', log: silent }), error => error.statusCode === 404)
})

test('Cancel on terminal writes cancelled only when SumUp confirms it; anything uncertain stays pending', async () => {
  const id = 'pay000000000001'
  // SumUp still has the payment as PENDING (the card may be going through): nothing is written, and a later SUCCESSFUL wins
  const store = fakeStore([payment(id)])
  const pending = fakeSumUp({ transactions: { [id]: { id: 'u', transaction_code: 'TX1', status: 'PENDING' } } })
  assert.deepEqual(await cancelCharge({ store, sumup: pending, id, now: START + 120_000, log: silent }), { status: 'pending' })
  assert.deepEqual(store.updates, [])
  const paid = fakeSumUp({ transactions: { [id]: { id: 'u', transaction_code: 'TX1', status: 'SUCCESSFUL' } } })
  assert.equal(await checkPayment({ store, sumup: paid, id, now: START + 130_000, log: silent }), 'approved')
  // SumUp's own CANCELLED and FAILED confirm it, whatever the age
  for (const status of ['CANCELLED', 'FAILED']) {
    const confirmed = fakeStore([payment(id)])
    assert.deepEqual(await cancelCharge({ store: confirmed, sumup: fakeSumUp({ transactions: { [id]: { id: 'u', status } } }), id, now: START + 1000, log: silent }), { status: 'cancelled' })
  }
  // SumUp not knowing the payment confirms it only after 60 s
  const young = fakeStore([payment(id)])
  assert.deepEqual(await cancelCharge({ store: young, sumup: fakeSumUp(), id, now: START + 60_000, log: silent }), { status: 'pending' })
  assert.deepEqual(young.updates, [])
  assert.deepEqual(await cancelCharge({ store: young, sumup: fakeSumUp(), id, now: START + 60_001, log: silent }), { status: 'cancelled' })
  // A lookup that gets no answer settles nothing
  const mute = fakeStore([payment(id)])
  assert.deepEqual(await cancelCharge({ store: mute, sumup: fakeSumUp({ fail: { [`findTransaction ${id}`]: new SumUpError('timeout') } }), id, now: START + 600_000, log: silent }), { status: 'pending' })
  assert.deepEqual(mute.updates, [])
})

test('Cancel with no paired terminal stopped nothing: SumUp not knowing the payment is not enough to cancel it', async () => {
  const id = 'pay000000000001'
  const store = fakeStore([payment(id)])
  const sumup = fakeSumUp({ readers: [] })
  assert.deepEqual(await cancelCharge({ store, sumup, id, now: START + 600_000, log: silent }), { status: 'pending' })
  assert.deepEqual(store.updates, [])
  assert.ok(!sumup.calls.some(call => call.startsWith('terminate')))
})

test('Cancel with the stop refused records a FAILED payment as declined, not cancelled', async () => {
  const id = 'pay000000000001'
  const store = fakeStore([payment(id)])
  const sumup = fakeSumUp({ fail: { [`terminate ${READER.id}`]: new SumUpError('invalid', 400) }, transactions: { [id]: { id: 'u', status: 'FAILED' } } })
  assert.deepEqual(await cancelCharge({ store, sumup, id, now: START + 1000, log: silent }), { status: 'declined' })
})

test('a payment the owner settled meanwhile is not written over by a cancel or a refresh', async () => {
  const id = 'pay000000000001'
  for (const run of [
    (store, sumup) => cancelCharge({ store, sumup, id, now: START + 120_000, log: silent }),
    (store, sumup) => refreshPayment({ store, sumup, id, now: START + 120_000, log: silent })
  ]) {
    const store = fakeStore([payment(id)])
    // The record is pending when read first and settled by the time the write comes
    const get = store.getCardPayment.bind(store)
    let reads = 0
    store.getCardPayment = async (key) => {
      const record = await get(key)
      if (++reads >= 2) record.status = 'approved'
      return record
    }
    const sumup = fakeSumUp({ transactions: { [id]: { id: 'u', transaction_code: 'TX1', status: 'CANCELLED' } } })
    await run(store, sumup)
    assert.deepEqual(store.updates, [])
  }
})

test('a refresh reads the record once when it has nothing to write', async () => {
  const store = fakeStore([payment('pay000000000001')])
  let reads = 0
  const get = store.getCardPayment.bind(store)
  store.getCardPayment = (id) => { reads++; return get(id) }
  await refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000001', now: START + 2000, log: silent })
  assert.equal(reads, 1)
})

test('the poll is single-flight, checks at most 10 a run, and forgets settled payments', async () => {
  const payments = Array.from({ length: 12 }, (_, index) => payment(`pay${String(index).padStart(12, '0')}`))
  const store = fakeStore(payments)
  const transactions = Object.fromEntries(payments.map(item => [item.id, { id: item.id, transaction_code: `TX${item.id.slice(-2)}`, status: 'SUCCESSFUL' }]))
  const sumup = fakeSumUp({ transactions })
  const poller = createCardPoller({ store, sumup, log: silent, now: () => START })
  await poller.loadPending()
  assert.equal(poller.tracked.size, 12)
  const first = poller.run()
  assert.equal(poller.run(), first, 'a second run during a run joins it')
  await first
  // The asked-for second run picked up the last two
  assert.equal(poller.tracked.size, 0)
  assert.equal(sumup.calls.filter(call => call.startsWith('findTransaction')).length, 12)
  assert.ok([...store.db.values()].every(item => item.status === 'approved'))
  // Nothing tracked: a run asks nobody
  await poller.run()
  assert.equal(sumup.calls.length, 12)
})

test('a poll run asks about 10 payments at most, and the ones it asked wait behind the others next time', async () => {
  const payments = Array.from({ length: 12 }, (_, index) => payment(`pay${String(index).padStart(12, '0')}`))
  const sumup = fakeSumUp()
  const poller = createCardPoller({ store: fakeStore(payments), sumup, log: silent, now: () => START })
  await poller.loadPending()
  await poller.run()
  assert.equal(sumup.calls.filter(call => call.startsWith('findTransaction')).length, 10)
  sumup.calls.length = 0
  await poller.run()
  const second = sumup.calls.filter(call => call.startsWith('findTransaction'))
  assert.equal(second.length, 10)
  assert.ok(second.includes('findTransaction pay000000000010') && second.includes('findTransaction pay000000000011'))
})

test('a payment that could not be checked waits behind the others next run', async () => {
  const payments = Array.from({ length: 12 }, (_, index) => payment(`pay${String(index).padStart(12, '0')}`))
  const store = fakeStore(payments)
  const asked = []
  store.getCardPayment = async (id) => { asked.push(id); throw Object.assign(new Error('PocketBase down'), { status: 0 }) }
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: silent, now: () => START })
  await poller.loadPending()
  await poller.run()
  asked.length = 0
  await poller.run()
  assert.ok(asked.includes('pay000000000010') && asked.includes('pay000000000011'))
})

test('while a check is stuck the poll starts no second check of the same payment', async () => {
  const store = fakeStore([payment('pay000000000001')])
  let release
  let reads = 0
  const get = store.getCardPayment.bind(store)
  store.getCardPayment = (id) => { reads++; return reads === 1 ? new Promise((resolve) => { release = resolve }) : get(id) }
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: silent, capMs: 10, now: () => START })
  poller.track('pay000000000001')
  await poller.run()
  await poller.run()
  await poller.run()
  assert.equal(reads, 1)
  release(payment('pay000000000001'))
  await new Promise(resolve => setTimeout(resolve, 20))
  await poller.run()
  assert.ok(reads >= 2, 'checks resume once the stuck one has settled')
})

test('the poll keeps a payment SumUp cannot be asked about, and drops one whose record is gone', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const errors = []
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: { info () {}, error: line => errors.push(line) }, now: () => START })
  poller.track('pay000000000001')
  poller.track('pay000000000009')
  store.getCardPayment = async (id) => {
    if (id === 'pay000000000009') throw Object.assign(new Error('Not found'), { status: 404 })
    throw Object.assign(new Error('PocketBase down'), { status: 0 })
  }
  await poller.run()
  assert.deepEqual([...poller.tracked], ['pay000000000001'])
  assert.deepEqual(errors, ['[card] Could not check pay000000000001: error'])
})

test('no new check starts once a run has used its time', async () => {
  const store = fakeStore(['pay000000000001', 'pay000000000002', 'pay000000000003'].map(id => payment(id)))
  let reads = 0
  const get = store.getCardPayment.bind(store)
  store.getCardPayment = async (id) => { reads++; await new Promise(resolve => setTimeout(resolve, 25)); return get(id) }
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: silent, capMs: 10, now: () => START })
  await poller.loadPending()
  await poller.run()
  await new Promise(resolve => setTimeout(resolve, 150))
  assert.equal(reads, 1)
})

test('a poll run returns after its time limit while a stuck check goes on', async () => {
  const store = fakeStore([payment('pay000000000001')])
  let release
  store.getCardPayment = () => new Promise((resolve) => { release = resolve })
  const poller = createCardPoller({ store, sumup: fakeSumUp(), log: silent, capMs: 20, now: () => START })
  poller.track('pay000000000001')
  await poller.run()
  release(payment('pay000000000001'))
  assert.equal(poller.tracked.size, 1)
})

test('the owner\'s store talks to PocketBase with the caller\'s token and sends only SumUp\'s fields on update', async () => {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, method: options.method, authorization: options.headers.Authorization, body: options.body ? JSON.parse(options.body) : undefined })
    return { ok: true, json: async () => ({ id: 'pay000000000001' }) }
  }
  const store = createOwnerStore({ pocketbaseUrl: 'https://pb.example', authorization: 'a.b.c', fetch })
  assert.equal((await store.createCardPayment({ amount: 8 })).id, 'pay000000000001')
  await store.getCardPayment('pay000000000001')
  await store.updateCardPayment('pay000000000001', { status: 'approved', sumup_transaction: 'TX1', booked_transaction: 'x' })
  const records = 'https://pb.example/api/collections/card_payments/records'
  assert.deepEqual(requests, [
    { url: records, method: 'POST', authorization: 'a.b.c', body: { amount: 8 } },
    { url: `${records}/pay000000000001`, method: 'GET', authorization: 'a.b.c', body: undefined },
    { url: `${records}/pay000000000001`, method: 'PATCH', authorization: 'a.b.c', body: { status: 'approved', sumup_transaction: 'TX1' } }
  ])
  const refusing = createOwnerStore({ pocketbaseUrl: 'https://pb.example', authorization: 'a.b.c', fetch: async () => ({ ok: false, status: 400 }) })
  await assert.rejects(refusing.createCardPayment({}), error => error.status === 400)
})

test('refresh records SumUp\'s result for the open sheet and answers the payment without its token', async () => {
  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp({ transactions: { pay000000000001: { id: 'u', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL' } } })
  const { payment: changed } = await refreshPayment({ store, sumup, id: 'pay000000000001', now: START + 4000, log: silent })
  assert.deepEqual([changed.status, changed.sumup_transaction, changed.cart], ['approved', 'TEENSK4W2K', CART])
  assert.ok(!('callback_token' in changed))
  assert.deepEqual(store.updates, [['pay000000000001', { status: 'approved', sumup_transaction: 'TEENSK4W2K' }]])
  // Settled: asked again, nothing is written and SumUp is not asked
  const again = await refreshPayment({ store, sumup, id: 'pay000000000001', now: START + 6000, log: silent })
  assert.equal(again.payment.status, 'approved')
  assert.equal(store.updates.length, 1)
  assert.equal(sumup.calls.length, 1)
})

test('refresh leaves an unchanged payment alone and keeps the 10-minute rule', async () => {
  const store = fakeStore([payment('pay000000000001')])
  assert.equal((await refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000001', now: START + 2000, log: silent })).payment.status, 'pending')
  assert.deepEqual(store.updates, [])
  assert.equal((await refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent })).payment.status, 'failed')
})

test('refresh: an unknown id or one the caller may not see is 404; SumUp not answering is a safe 502 and changes nothing', async () => {
  const store = fakeStore([payment('pay000000000001')])
  await assert.rejects(refreshPayment({ store, sumup: fakeSumUp(), id: 'pay000000000009', log: silent }), error => error.statusCode === 404)
  await assert.rejects(refreshPayment({ store, sumup: fakeSumUp(), id: '../users', log: silent }), error => error.statusCode === 404)
  // Not the owner: PocketBase 0.22 answers the owner-only record as 404 (or 403)
  const notOwner = { ...fakeStore(), getCardPayment: async () => { throw Object.assign(new Error('Forbidden'), { status: 403 }) } }
  await assert.rejects(refreshPayment({ store: notOwner, sumup: fakeSumUp(), id: 'pay000000000001', log: silent }), error => error.statusCode === 404)
  const failing = fakeSumUp({ fail: { 'findTransaction pay000000000001': new SumUpError('timeout') } })
  await assert.rejects(refreshPayment({ store, sumup: failing, id: 'pay000000000001', now: START + GIVE_UP_MS, log: silent }),
    error => error.statusCode === 502 && error.statusMessage === "SumUp didn't answer. Try again." && !/timeout/.test(error.statusMessage))
  assert.deepEqual(store.updates, [])
  assert.equal(store.db.get('pay000000000001').status, 'pending')
})

test('a sandbox merchant\'s payment is marked [Sandbox] in SumUp and on the booked sale, once', async () => {
  const marked = markSandbox(INPUT)
  assert.equal(marked.description, '[Sandbox] Akinai sale')
  assert.equal(marked.cart.description, `[Sandbox] ${CART.description}`)
  assert.deepEqual(markSandbox(marked), marked)
  assert.equal(INPUT.cart.description, CART.description, 'the input is not changed')

  const store = fakeStore([payment('pay000000000001')])
  const sumup = fakeSumUp()
  await startCharge({ input: INPUT, sumup, store, host: 'x.example', isSandbox: async () => true, log: silent })
  assert.equal(store.created[0].description, '[Sandbox] Akinai sale')
  assert.equal(store.created[0].cart.description, `[Sandbox] ${CART.description}`)
})

test('whether the merchant is a sandbox is asked once; a failed question is asked again', async () => {
  let asked = 0
  let answer = () => { throw new SumUpError('timeout') }
  const check = createSandboxCheck({ getMerchant: async () => { asked++; return answer() } })
  assert.equal(await check(), false)
  answer = () => ({ sandbox: true })
  assert.equal(await check(), true)
  assert.equal(await check(), true)
  assert.equal(asked, 2)
  assert.equal(await createSandboxCheck({ getMerchant: async () => ({ sandbox: false }) })(), false)
})

test('a second charge within a minute of a pending one is refused before anything is created or sent', async () => {
  const sumup = fakeSumUp()
  const store = fakeStore([payment('pay000000000002', { created: '2026-10-16 10:00:30.000Z' })])
  await assert.rejects(startCharge({ input: INPUT, sumup, store, host: null, now: START + 59_000, log: silent }),
    error => error.statusCode === 409 && error.statusMessage === 'A card payment is already waiting on the terminal')
  assert.deepEqual([store.created.length, sumup.calls], [0, ['listReaders']])
  // Older than a minute (or no longer pending): another may start
  assert.equal(DOUBLE_CHARGE_MS, 60_000)
  await startCharge({ input: INPUT, sumup: fakeSumUp(), store, host: null, now: START + 30_000 + DOUBLE_CHARGE_MS + 1, log: silent })
  const settled = fakeStore([payment('pay000000000002', { status: 'approved', created: '2026-10-16 10:00:30.000Z' })])
  await startCharge({ input: INPUT, sumup: fakeSumUp(), store: settled, host: null, now: START + 31_000, log: silent })
  // A store that cannot say is a refusal too, never a second charge
  const broken = { ...fakeStore(), listRecentPending: async () => { throw new Error('boom https://pb.example/x') } }
  await assert.rejects(startCharge({ input: INPUT, sumup: fakeSumUp(), store: broken, host: null, log: silent }), error => error.statusCode === 502)
})

test('the owner store lists the recent pending payments with the owner token', async () => {
  const requests = []
  const fetch = async (url, options) => { requests.push({ url, authorization: options.headers.Authorization }); return { ok: true, json: async () => ({ items: [{ id: 'pay000000000001' }] }) } }
  const store = createOwnerStore({ pocketbaseUrl: 'https://pb.example', authorization: 'a.b.c', fetch })
  assert.deepEqual(await store.listRecentPending('2026-10-16 10:00:00.000Z'), [{ id: 'pay000000000001' }])
  const url = new URL(requests[0].url)
  assert.equal(requests[0].authorization, 'a.b.c')
  assert.equal(url.searchParams.get('filter'), 'status = "pending" && created >= "2026-10-16 10:00:00.000Z"')
})

test('the return URL host is the app\'s public one: APP_URL in production, CARD_PUBLIC_URL when set, none in dev', () => {
  const APP = 'https://akinai.lasseharm.space'
  assert.equal(publicHost({ env: {}, appUrl: APP, production: true }), 'akinai.lasseharm.space')
  assert.equal(publicHost({ env: { CARD_PUBLIC_URL: 'https://pay.example.org/' }, appUrl: APP, production: true }), 'pay.example.org')
  assert.equal(publicHost({ env: { CARD_PUBLIC_URL: 'https://tunnel.example.org' }, appUrl: APP, production: false }), 'tunnel.example.org')
  // nuxt dev on localhost: nothing is sent, the 2 s refresh covers it
  assert.equal(publicHost({ env: {}, appUrl: APP, production: false }), null)
  for (const bad of ['http://pay.example.org', 'https://localhost:3000', 'https://127.0.0.1', 'https://u:p@pay.example.org', 'https://pay.example.org/x', 'pay.example.org', 'https://myphone', 'ftp://x.example']) {
    assert.equal(publicHost({ env: { CARD_PUBLIC_URL: bad }, appUrl: APP, production: true }), null, bad)
  }
})

test('route errors: rule errors pass, SumUp errors are 502, PocketBase 401 is 401, a race is 409, anything else is 502 without upstream text', () => {
  const secret = 'https://pb.example/api/token=abc123 Bearer sk_live_x'
  const rule = Object.assign(new Error('x'), { statusCode: 409, statusMessage: 'Pair the terminal in Settings first' })
  assert.deepEqual(cardErrorFor(rule), { statusCode: 409, statusMessage: 'Pair the terminal in Settings first', message: 'Pair the terminal in Settings first' })
  const unreachable = { statusCode: 502, statusMessage: "SumUp didn't answer. Try again.", message: "SumUp didn't answer. Try again." }
  for (const kind of ['not_found', 'invalid', 'conflict', 'unauthorized', 'failed', 'timeout']) {
    for (const status of [400, 403, 404, 409]) assert.deepEqual(cardErrorFor(new SumUpError(kind, status)), unreachable, `${kind} ${status}`)
  }
  assert.deepEqual(cardErrorFor(Object.assign(new Error(secret), { status: 401 })), { statusCode: 401, statusMessage: 'Log in again', message: 'Log in again' })
  const raced = { statusCode: 409, statusMessage: 'The payment changed meanwhile. Try again.', message: 'The payment changed meanwhile. Try again.' }
  for (const status of [400, 403, 404]) assert.deepEqual(cardErrorFor(Object.assign(new Error(secret), { status })), raced)
  for (const error of [new Error(secret), Object.assign(new Error(secret), { status: 500 }), null, undefined, 'x']) {
    const mapped = cardErrorFor(error)
    assert.deepEqual(mapped, unreachable)
    assert.ok(!JSON.stringify(mapped).includes('pb.example') && !JSON.stringify(mapped).includes('abc123'))
  }
})
