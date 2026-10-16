// Card payments on the SumUp Solo: what the card routes and the backup poll do, with SumUp (`sumup`, see
// sumup.js) and a card payment store passed in: the owner's own (createOwnerStore, for the owner's routes)
// or the notifier's (for the return URL and the poll). The unit tests run against fakes and never reach SumUp.
import { createHash, randomBytes } from 'node:crypto'
import { sameText } from './access.js'
import { isUnreachable } from './sumup.js'

export const CARD_PAYMENTS = 'card_payments'
// The only fields the notifier may write (the collection's update rule refuses the rest; pb-plan.mjs)
export const CARD_NOTIFIER_FIELDS = ['status', 'sumup_checkout', 'sumup_transaction']
// What SumUp shows for the sale, also in the SumUp app
export const SALE_DESCRIPTION = 'Akinai sale'
// Payments with a SumUp sandbox merchant are marked, in SumUp and on the booked sale, so test sales are easy to find and delete
export const SANDBOX_PREFIX = '[Sandbox] '
export const READER_NAME = 'Akinai'
export const CARD_POLL_MS = 15_000
// A payment SumUp knows nothing about this long after it started is given up as failed
export const GIVE_UP_MS = 10 * 60_000
// One poll run may take this long and check this many payments at most
export const POLL_RUN_CAP_MS = 12_000
export const POLL_MAX_PER_RUN = 10
const MAX_CART_BYTES = 200_000
const MAX_AMOUNT_CENTS = 10_000_00
const RECORD_ID = /^[a-z0-9]{15}$/
// The code the Solo shows under Connections → API → Connect: 8 or 9 letters and digits
export const PAIRING_CODE = /^[A-Z0-9]{8,9}$/

export const NOT_CONFIGURED = "Card payments aren't configured on the server"
export const TERMINAL_UNREACHABLE = "The terminal didn't answer. Check that it's on and online."
export const PAYMENT_FAILED = "The payment didn't go through"
export const SUMUP_UNREACHABLE = "SumUp didn't answer. Try again."
export const NOT_PAIRED = 'Pair the terminal in Settings first'
export const PAIRING_CODE_INVALID = 'Enter the code the Solo shows'
export const PAIRING_CODE_REFUSED = "That code didn't work. Start pairing on the Solo again and enter the new code."
export const ALREADY_PAIRED = 'A terminal is already paired. Unpair it first.'

// h3's createError shape, so the routes can throw these as they are
const refuse = (statusCode, statusMessage) => Object.assign(new Error(statusMessage), { statusCode, statusMessage })

export const toCents = amount => Math.round(Number(amount) * 100)
export const normalisePairingCode = code => String(code ?? '').replace(/[\s-]/g, '').toUpperCase()
export const randomToken = () => randomBytes(24).toString('base64url')
// The record keeps only the token's SHA-256, so reading the record never gives the return URL away
export const hashToken = token => createHash('sha256').update(String(token)).digest('hex')
export const tokenMatches = (token, stored) => typeof stored === 'string' && stored.length === 64 && sameText(hashToken(token), stored)

const isPlainObject = value => !!value && typeof value === 'object' && !Array.isArray(value)

// POST /api/card/charge's body: { source: 'cart' | 'home', amount (euros, > 0), description, cart (the booking) }
export function chargeInput (body) {
  const { source, amount, cart } = isPlainObject(body) ? body : {}
  if (!['cart', 'home'].includes(source)) throw refuse(400, 'Unknown payment source')
  const cents = toCents(amount)
  if (typeof amount !== 'number' || !Number.isFinite(amount) || cents < 1 || cents > MAX_AMOUNT_CENTS) throw refuse(400, 'Enter an amount above 0')
  if (!isPlainObject(cart)) throw refuse(400, 'Missing the sale to book')
  if (Buffer.byteLength(JSON.stringify(cart)) > MAX_CART_BYTES) throw refuse(400, 'The cart is too large for one payment')
  return { source, amount: cents / 100, cents, description: SALE_DESCRIPTION, cart }
}

// SumUp's transaction status as the payment's status. REFUNDED was paid (the refund is the SumUp app's).
// FAILED is a card the terminal refused: declined. Anything else is still pending.
export function statusFromTransaction (transaction) {
  switch (transaction?.status) {
    case 'SUCCESSFUL':
    case 'REFUNDED':
      return 'approved'
    case 'CANCELLED':
      return 'cancelled'
    case 'FAILED':
      return 'declined'
    default:
      return 'pending'
  }
}

// The id the SumUp app and the receipt show (transaction_code), else SumUp's internal id
export const sumupTransactionOf = transaction => String(transaction?.transaction_code || transaction?.id || '')

// A sandbox payment: `[Sandbox] ` before the description SumUp shows and before the booked sale's
// description (the stored booking's). Marking twice changes nothing.
export function markSandbox (input) {
  const mark = text => (String(text ?? '').startsWith(SANDBOX_PREFIX) ? String(text ?? '') : `${SANDBOX_PREFIX}${text ?? ''}`)
  return { ...input, description: mark(input.description), cart: { ...input.cart, description: mark(input.cart.description) } }
}

// Whether the merchant is a SumUp sandbox (Merchant.sandbox), asked once per process. A failed question is
// asked again next time and counts as "not a sandbox" meanwhile.
export function createSandboxCheck (sumup) {
  let known = null
  return async () => {
    if (known !== null) return known
    try {
      known = (await sumup.getMerchant())?.sandbox === true
      return known
    } catch {
      return false
    }
  }
}

// The return URL SumUp calls when the payment ends: https on the host the app was opened on. A host SumUp
// cannot reach (localhost, an IP address, a name without a dot) gets none, and the backup poll finds the result.
export function callbackUrl (host, id, token) {
  const name = String(host ?? '').toLowerCase()
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(name)) return null
  const bare = name.replace(/:\d+$/, '')
  if (!bare.includes('.') || bare === 'localhost' || bare.endsWith('.localhost') || /^[\d.]+$/.test(bare)) return null
  return `https://${name}/api/card/callback/${id}/${token}`
}

// The created stamp of a PocketBase record ('YYYY-MM-DD HH:MM:SS.sssZ') in ms
const createdAt = record => Date.parse(String(record?.created ?? '').replace(' ', 'T'))

// SumUp's paired reader: the first reader whose status is `paired` (one terminal only)
export async function pairedReader (sumup) {
  const readers = await sumup.listReaders()
  return readers.find(reader => reader?.status === 'paired') ?? null
}

const READER_STATUS = { ONLINE: 'online', OFFLINE: 'offline' }

// GET /api/card/terminal: { paired, reader: { id, name, status: 'online' | 'offline' | 'unknown' } | null }.
// A reader whose status SumUp cannot give (an old firmware) is 'unknown'.
export async function terminalStatus ({ sumup }) {
  const reader = await pairedReader(sumup)
  if (!reader) return { paired: false, reader: null }
  let status = 'unknown'
  try {
    status = READER_STATUS[(await sumup.readerStatus(reader.id))?.status] ?? 'unknown'
  } catch {}
  return { paired: true, reader: { id: reader.id, name: reader.name || READER_NAME, status } }
}

export async function pairTerminal ({ sumup, code }) {
  const pairingCode = normalisePairingCode(code)
  if (!PAIRING_CODE.test(pairingCode)) throw refuse(400, PAIRING_CODE_INVALID)
  if (await pairedReader(sumup)) throw refuse(409, ALREADY_PAIRED)
  try {
    const reader = await sumup.createReader({ pairingCode, name: READER_NAME })
    return { paired: true, reader: { id: reader.id, name: reader.name || READER_NAME, status: 'unknown' } }
  } catch (error) {
    if (['not_found', 'invalid', 'conflict'].includes(error?.kind)) throw refuse(400, PAIRING_CODE_REFUSED)
    throw refuse(502, SUMUP_UNREACHABLE)
  }
}

export async function unpairTerminal ({ sumup }) {
  const reader = await pairedReader(sumup)
  if (reader) {
    try {
      await sumup.deleteReader(reader.id)
    } catch (error) {
      if (error?.kind !== 'not_found') throw error
    }
  }
  return { paired: false, reader: null }
}

// POST /api/card/charge: the record (as the owner, `pending`), then the checkout on the Solo. A SumUp error
// or no answer leaves the record `failed`; nothing is booked then. A sandbox merchant's payment is marked.
export async function startCharge ({ input: plain, sumup, store, host, isSandbox = async () => false, newToken = randomToken, log = console }) {
  const input = (await isSandbox()) ? markSandbox(plain) : plain
  let reader
  try {
    reader = await pairedReader(sumup)
  } catch {
    throw refuse(502, SUMUP_UNREACHABLE)
  }
  if (!reader) throw refuse(409, NOT_PAIRED)
  const token = newToken()
  let record
  try {
    record = await store.createCardPayment({ amount: input.amount, description: input.description, source: input.source, cart: input.cart, status: 'pending', callback_token: hashToken(token) })
  } catch {
    throw refuse(502, 'Could not save the payment. Try again.')
  }
  let checkout
  try {
    checkout = await sumup.checkout(reader.id, { cents: input.cents, description: input.description, returnUrl: callbackUrl(host, record.id, token), foreignId: record.id })
  } catch (error) {
    log.info(`[card] ${record.id} failed: ${error?.message || 'SumUp error'}`)
    await store.updateCardPayment(record.id, { status: 'failed' }).catch(() => {})
    throw refuse(502, isUnreachable(error) ? TERMINAL_UNREACHABLE : PAYMENT_FAILED)
  }
  // Without it the result is looked up by our record id (the affiliate's foreign_transaction_id)
  if (checkout?.client_transaction_id) await store.updateCardPayment(record.id, { sumup_checkout: String(checkout.client_transaction_id) }).catch(() => {})
  log.info(`[card] ${record.id} sent to the terminal`)
  return { id: record.id }
}

// Asks SumUp for one pending payment's result and records it. Resolves { status, payment } afterwards
// (the payment as stored now). Ten minutes after the start a payment SumUp does not report as pending
// (unknown to SumUp, or no answer) is given up as failed. `strict`: SumUp not answering throws a safe 502
// and changes nothing (the app's refresh; the poll keeps the 10-minute rule).
async function settlePayment ({ store, sumup, id, now, log, strict }) {
  const payment = await store.getCardPayment(id)
  if (payment.status !== 'pending') return { status: payment.status, payment }
  let transaction
  let asked = true
  try {
    transaction = await sumup.findTransaction({ clientTransactionId: payment.sumup_checkout || '', foreignTransactionId: payment.id })
  } catch {
    if (strict) throw refuse(502, SUMUP_UNREACHABLE)
    asked = false
  }
  const status = statusFromTransaction(transaction)
  if (status === 'pending') {
    const sumupSaysPending = asked && !!transaction
    if (sumupSaysPending || !(now - createdAt(payment) >= GIVE_UP_MS)) return { status: 'pending', payment }
    await store.updateCardPayment(id, { status: 'failed' })
    log.info(`[card] ${id} failed: no result from SumUp after 10 minutes`)
    return { status: 'failed', payment: { ...payment, status: 'failed' } }
  }
  const patch = { status, sumup_transaction: sumupTransactionOf(transaction) }
  await store.updateCardPayment(id, patch)
  log.info(`[card] ${id} ${status}${patch.sumup_transaction ? ` (${patch.sumup_transaction})` : ''}`)
  return { status, payment: { ...payment, ...patch } }
}

export async function checkPayment ({ store, sumup, id, now = Date.now(), log = console }) {
  return (await settlePayment({ store, sumup, id, now, log, strict: false })).status
}

// POST /api/card/refresh: the open sheet asks every 2 s, with the owner's own store, so a result arrives
// even without the return URL and the poll (nuxt dev, or no notifier login). Same lookup, mapping and
// 10-minute rule as the poll. Answers the payment without its callback token.
export async function refreshPayment ({ store, sumup, id, now = Date.now(), log = console }) {
  if (!RECORD_ID.test(String(id ?? ''))) throw refuse(404, 'Unknown payment')
  try {
    await store.getCardPayment(id)
  } catch (error) {
    // PocketBase 0.22 answers a record the caller may not see as 404
    if (error?.status === 404 || error?.status === 403) throw refuse(404, 'Unknown payment')
    throw refuse(502, 'Could not read the payment. Try again.')
  }
  const { payment } = await settlePayment({ store, sumup, id, now, log, strict: true })
  const { callback_token: secret, ...visible } = payment
  return { payment: visible }
}

// POST /api/card/callback/:id/:token: true when the token is the payment's. The body is never read.
export async function callbackMatches ({ store, id, token }) {
  if (!RECORD_ID.test(String(id ?? '')) || typeof token !== 'string' || !token) return false
  let payment
  try {
    payment = await store.getCardPayment(id)
  } catch {
    return false
  }
  return tokenMatches(token, payment.callback_token)
}

// POST /api/card/cancel: stops the checkout on the Solo. Once SumUp has taken the stop, the payment is
// `cancelled` (or `approved`, should the card have gone through after all). When there was nothing left to
// stop (the customer already paid or cancelled), the status stays for the poll to settle.
export async function cancelCharge ({ store, sumup, id, log = console }) {
  if (!RECORD_ID.test(String(id ?? ''))) throw refuse(404, 'Unknown payment')
  let payment
  try {
    payment = await store.getCardPayment(id)
  } catch {
    throw refuse(404, 'Unknown payment')
  }
  if (payment.status !== 'pending') return { status: payment.status }
  let stopped = true
  try {
    const reader = await pairedReader(sumup)
    if (reader) await sumup.terminate(reader.id)
  } catch (error) {
    if (isUnreachable(error)) throw refuse(502, TERMINAL_UNREACHABLE)
    if (!['not_found', 'invalid', 'conflict'].includes(error?.kind)) throw refuse(502, SUMUP_UNREACHABLE)
    stopped = false
  }
  let transaction = null
  try {
    transaction = await sumup.findTransaction({ clientTransactionId: payment.sumup_checkout || '', foreignTransactionId: payment.id })
  } catch {}
  const found = statusFromTransaction(transaction)
  const status = found === 'approved' ? 'approved' : stopped ? 'cancelled' : found
  if (status === 'pending') return { status }
  await store.updateCardPayment(id, { status, sumup_transaction: sumupTransactionOf(transaction) })
  log.info(`[card] ${id} ${status}`)
  return { status }
}

// The backup poll: every 15 s while a payment is pending it asks SumUp (checkPayment). Single-flight (a run
// asked for during a run follows it), at most 10 payments and 12 s per run. It follows the payments this
// server started, and after a restart the pending ones PocketBase lists (loadPending).
export function createCardPoller ({ store, sumup, log = console, capMs = POLL_RUN_CAP_MS, maxPerRun = POLL_MAX_PER_RUN, now = () => Date.now() }) {
  const tracked = new Set()
  let running = null
  let again = false

  const runOnce = async () => {
    for (const id of [...tracked].slice(0, maxPerRun)) {
      try {
        const status = await checkPayment({ store, sumup, id, now: now(), log })
        if (status !== 'pending') tracked.delete(id)
      } catch (error) {
        // A record that is gone is dropped; anything else is tried again next run
        if (error?.status === 404) tracked.delete(id)
        else log.error(`[card] Could not check ${id}: ${error?.kind || error?.status || 'error'}`)
      }
    }
  }

  const run = () => {
    if (running) {
      again = true
      return running
    }
    if (!tracked.size) return Promise.resolve()
    running = (async () => {
      do {
        again = false
        let timer
        const cap = new Promise((resolve) => { timer = setTimeout(resolve, capMs) })
        await Promise.race([runOnce(), cap])
        clearTimeout(timer)
      } while (again && tracked.size)
    })().finally(() => { running = null })
    return running
  }

  const track = (id) => { tracked.add(id) }

  const loadPending = async () => {
    try {
      for (const payment of await store.listPendingCardPayments()) tracked.add(payment.id)
    } catch (error) {
      log.error(`[card] Could not list pending payments: ${error?.status || 'error'}`)
    }
  }

  return { track, run, loadPending, tracked }
}

// The owner's own card payment store: PocketBase's REST API with the caller's token, so the collection's
// rules for the owner apply (create, read, update). Updates send only status and SumUp's ids, like the
// notifier's. The token goes to PocketBase only.
export function createOwnerStore ({ pocketbaseUrl, authorization, fetch = globalThis.fetch }) {
  const records = `${pocketbaseUrl}/api/collections/${CARD_PAYMENTS}/records`
  const request = async (method, url, data) => {
    const response = await fetch(url, {
      method,
      headers: { Authorization: authorization, ...(data ? { 'Content-Type': 'application/json' } : {}) },
      body: data ? JSON.stringify(data) : undefined,
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) throw Object.assign(new Error(`PocketBase answered ${response.status}`), { status: response.status })
    return response.json()
  }
  const only = patch => Object.fromEntries(Object.entries(patch).filter(([key]) => CARD_NOTIFIER_FIELDS.includes(key)))
  return {
    createCardPayment: data => request('POST', records, data),
    getCardPayment: id => request('GET', `${records}/${encodeURIComponent(id)}`),
    updateCardPayment: (id, patch) => request('PATCH', `${records}/${encodeURIComponent(id)}`, only(patch))
  }
}
