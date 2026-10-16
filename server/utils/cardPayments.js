// Card payments on the SumUp Solo: what the card routes and the backup poll do, with SumUp (`sumup`, see
// sumup.js) and a card payment store passed in: the owner's own (createOwnerStore, for the owner's routes)
// or the notifier's (for the return URL and the poll). The unit tests run against fakes and never reach SumUp.
import { createHash, randomBytes } from 'node:crypto'
import { sameText } from './access.js'
import { SumUpError, isSandboxMerchant, isUnreachable } from './sumup.js'

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
// Cancel on terminal: SumUp not knowing the payment confirms the stop only this long after the start
export const CANCEL_CONFIRM_MS = 60_000
// A second charge is refused while another payment started this recently is still pending (a double tap)
export const DOUBLE_CHARGE_MS = 60_000
const MAX_CART_BYTES = 200_000
const MAX_AMOUNT_CENTS = 10_000_00
const RECORD_ID = /^[a-z0-9]{15}$/
// The code the Solo shows under Connections → API → Connect: 8 or 9 letters and digits
export const PAIRING_CODE = /^[A-Z0-9]{8,9}$/

export const NOT_CONFIGURED = "Card payments aren't configured on the server"
export const TERMINAL_UNREACHABLE = "The terminal didn't answer. Check that it's on and online."
export const AMOUNT_TOO_HIGH = 'The amount is above 10 000 €'
export const PAYMENT_FAILED = "The payment didn't go through"
export const SUMUP_UNREACHABLE = "SumUp didn't answer. Try again."
export const NOT_PAIRED = 'Pair the terminal in Settings first'
export const PAIRING_CODE_INVALID = 'Enter the code the Solo shows'
export const PAIRING_CODE_REFUSED = "That code didn't work. Start pairing on the Solo again and enter the new code."
export const CART_MISMATCH = "The cart total doesn't match the amount"
export const CHARGE_WAITING = 'A card payment is already waiting on the terminal'
export const PAYMENT_CHANGED = 'The payment changed meanwhile. Try again.'
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
  if (typeof amount !== 'number' || !Number.isFinite(amount) || cents < 1) throw refuse(400, 'Enter an amount above 0')
  if (cents > MAX_AMOUNT_CENTS) throw refuse(400, AMOUNT_TOO_HIGH)
  if (!isPlainObject(cart)) throw refuse(400, 'Missing the sale to book')
  if (Buffer.byteLength(JSON.stringify(cart)) > MAX_CART_BYTES) throw refuse(400, 'The cart is too large for one payment')
  // The booking's own total is what is charged: a cart that says otherwise is a mix-up, not a payment
  if (typeof cart.amount !== 'number' || toCents(cart.amount) !== cents) throw refuse(400, CART_MISMATCH)
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
      known = isSandboxMerchant(await sumup.getMerchant())
      return known
    } catch {
      return false
    }
  }
}

// The host of the app's public https address, which SumUp's return URL points at: CARD_PUBLIC_URL when set,
// else the app's own APP_URL, the latter in production only (nuxt dev sends none: the 2 s refresh covers it).
// Never the request's own host. Null unless it is a plain https origin on a real public host.
export function publicHost ({ env = {}, appUrl, production = false }) {
  const configured = typeof env.CARD_PUBLIC_URL === 'string' ? env.CARD_PUBLIC_URL.trim() : ''
  const address = configured || (production ? appUrl : '')
  let url
  try {
    url = new URL(address)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') return null
  return callbackUrl(url.host, 'x', 'x') ? url.host : null
}

// The return URL SumUp calls when the payment ends: https on the given host. A host SumUp cannot reach
// (localhost, an IP address, a name without a dot) gets none, and the backup poll finds the result.
export function callbackUrl (host, id, token) {
  const name = String(host ?? '').toLowerCase()
  if (!/^[a-z0-9.-]+(:\d{1,5})?$/.test(name)) return null
  const bare = name.replace(/:\d+$/, '')
  if (!bare.includes('.') || bare === 'localhost' || bare.endsWith('.localhost') || /^[\d.]+$/.test(bare)) return null
  return `https://${name}/api/card/callback/${id}/${token}`
}

// What a route lets out for an error, as h3's createError input. The card rules' own errors (they carry a
// statusCode and a safe message) pass; a SumUpError is 502; PocketBase's 401 is a login, its 400/403/404 on the
// payment a race (it changed meanwhile); anything else a fixed 502. Never upstream text, URLs or tokens.
export function cardErrorFor (error) {
  const out = (statusCode, statusMessage) => ({ statusCode, statusMessage, message: statusMessage })
  if (error?.statusCode && typeof error.statusMessage === 'string') return out(error.statusCode, error.statusMessage)
  if (error instanceof SumUpError || typeof error?.kind === 'string') return out(502, SUMUP_UNREACHABLE)
  if (error?.status === 401) return out(401, 'Log in again')
  if ([400, 403, 404].includes(error?.status)) return out(409, PAYMENT_CHANGED)
  return out(502, SUMUP_UNREACHABLE)
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
// that refuses the checkout, or a terminal known to be offline, leaves the record `failed`; no answer leaves it
// pending unless SumUp confirms it does not know it (see below). Nothing is booked before approval. A sandbox
// merchant's payment is marked.
export async function startCharge ({ input: plain, sumup, store, host, isSandbox = async () => false, newToken = randomToken, now = Date.now(), log = console }) {
  const input = (await isSandbox()) ? markSandbox(plain) : plain
  let reader
  try {
    reader = await pairedReader(sumup)
  } catch {
    throw refuse(502, SUMUP_UNREACHABLE)
  }
  if (!reader) throw refuse(409, NOT_PAIRED)
  // A double tap: another payment started a minute ago or less is still waiting on the terminal
  let waiting
  try {
    waiting = await store.listRecentPending(new Date(now - DOUBLE_CHARGE_MS).toISOString().replace('T', ' '))
  } catch {
    throw refuse(502, 'Could not save the payment. Try again.')
  }
  if (waiting.length) throw refuse(409, CHARGE_WAITING)
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
    // SumUp said no (the reader is offline, or it refused the request): the payment never started
    if (!['timeout', 'unreachable', 'failed'].includes(error?.kind)) {
      log.info(`[card] ${record.id} failed: ${error?.message || 'SumUp error'}`)
      await store.updateCardPayment(record.id, { status: 'failed' }).catch(() => {})
      throw refuse(502, isUnreachable(error) ? TERMINAL_UNREACHABLE : PAYMENT_FAILED)
    }
    // No answer (or a 5xx): the checkout may have reached the Solo. Stop it, then ask SumUp. Only SumUp's
    // "I do not know this payment" after a successful stop, more than a minute after the start, fails it;
    // anything else stays pending for the refresh, the poll and the 10-minute rule, and the sheet watches it.
    let stopped = true
    try {
      await sumup.terminate(reader.id)
    } catch {
      stopped = false
    }
    let known = true
    try {
      known = !!(await sumup.findTransaction({ foreignTransactionId: record.id }))
    } catch {}
    if (stopped && !known && now - createdAt(record) > CANCEL_CONFIRM_MS) {
      log.info(`[card] ${record.id} failed: ${error?.message || 'SumUp error'}`)
      await store.updateCardPayment(record.id, { status: 'failed' }).catch(() => {})
      throw refuse(502, TERMINAL_UNREACHABLE)
    }
    log.info(`[card] ${record.id} sent, SumUp did not confirm`)
    return { id: record.id }
  }
  // Without it the result is looked up by our record id (the affiliate's foreign_transaction_id)
  if (checkout?.client_transaction_id) await store.updateCardPayment(record.id, { sumup_checkout: String(checkout.client_transaction_id) }).catch(() => {})
  log.info(`[card] ${record.id} sent to the terminal`)
  return { id: record.id }
}

// The payment as stored right now, when it is still pending; else null. Every write of a result is
// preceded by this, so a payment settled meanwhile (the owner booked it, the poll got there first) is
// never written over.
const pendingNow = async (store, id) => {
  const fresh = await store.getCardPayment(id)
  return fresh.status === 'pending' ? fresh : null
}

// Asks SumUp for one pending payment's result and records it. Resolves { status, payment } afterwards
// (the payment as stored now). Ten minutes after the start a payment is given up as failed only when SumUp
// answered that it does not know it; no answer never gives up. `strict`: SumUp not answering throws a safe
// 502 and changes nothing (the app's refresh). `payment`: the record as the caller has just read it.
async function settlePayment ({ store, sumup, id, now, log, strict, payment: read }) {
  const payment = read ?? await store.getCardPayment(id)
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
    const unknownToSumUp = asked && !transaction
    if (!unknownToSumUp || !(now - createdAt(payment) >= GIVE_UP_MS)) return { status: 'pending', payment }
  }
  const settled = await pendingNow(store, id)
  if (!settled) return settledMeanwhile(store, id)
  if (status === 'pending') {
    await store.updateCardPayment(id, { status: 'failed' })
    log.info(`[card] ${id} failed: SumUp does not know it after 10 minutes`)
    return { status: 'failed', payment: { ...settled, status: 'failed' } }
  }
  const patch = { status, sumup_transaction: sumupTransactionOf(transaction) }
  await store.updateCardPayment(id, patch)
  log.info(`[card] ${id} ${status}${patch.sumup_transaction ? ` (${patch.sumup_transaction})` : ''}`)
  return { status, payment: { ...settled, ...patch } }
}

const settledMeanwhile = async (store, id) => {
  const payment = await store.getCardPayment(id)
  return { status: payment.status, payment }
}

export async function checkPayment ({ store, sumup, id, now = Date.now(), log = console }) {
  return (await settlePayment({ store, sumup, id, now, log, strict: false })).status
}

// POST /api/card/refresh: the open sheet asks every 2 s, with the owner's own store, so a result arrives
// even without the return URL and the poll (nuxt dev, or no notifier login). Same lookup, mapping and
// 10-minute rule as the poll. Answers the payment without its callback token.
export async function refreshPayment ({ store, sumup, id, now = Date.now(), log = console }) {
  if (!RECORD_ID.test(String(id ?? ''))) throw refuse(404, 'Unknown payment')
  let read
  try {
    read = await store.getCardPayment(id)
  } catch (error) {
    // PocketBase 0.22 answers a record the caller may not see as 404
    if (error?.status === 404 || error?.status === 403) throw refuse(404, 'Unknown payment')
    throw refuse(502, 'Could not read the payment. Try again.')
  }
  const { payment } = await settlePayment({ store, sumup, id, now, log, strict: true, payment: read })
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

// POST /api/card/cancel: stops the checkout on the Solo, then asks SumUp. Only SumUp's word settles the
// payment: `approved` (the card went through), `cancelled` (SumUp has it as cancelled or failed, or does not
// know it a minute after the start and the stop was accepted). Otherwise it stays pending for the poll.
export async function cancelCharge ({ store, sumup, id, now = Date.now(), log = console }) {
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
    else stopped = false
  } catch (error) {
    if (isUnreachable(error)) throw refuse(502, TERMINAL_UNREACHABLE)
    if (!['not_found', 'invalid', 'conflict'].includes(error?.kind)) throw refuse(502, SUMUP_UNREACHABLE)
    stopped = false
  }
  let transaction = null
  let asked = true
  try {
    transaction = await sumup.findTransaction({ clientTransactionId: payment.sumup_checkout || '', foreignTransactionId: payment.id })
  } catch {
    asked = false
  }
  // Only SumUp's word settles it: approved when the card went through, cancelled when SumUp has it as
  // CANCELLED or FAILED, or does not know it a minute after the start (and the stop was accepted). A payment
  // SumUp still has as PENDING, or does not answer about, stays pending for the refresh and the poll.
  const found = statusFromTransaction(transaction)
  let status = 'pending'
  if (found === 'approved') status = 'approved'
  else if (found === 'cancelled') status = 'cancelled'
  else if (found === 'declined') status = stopped ? 'cancelled' : 'declined'
  else if (asked && !transaction && stopped && now - createdAt(payment) > CANCEL_CONFIRM_MS) status = 'cancelled'
  if (status === 'pending') return { status }
  if (!(await pendingNow(store, id))) return { status: (await store.getCardPayment(id)).status }
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
  let limited = null
  let again = false

  // One pass over the payments, oldest first: stops starting checks once the deadline has passed. A payment
  // checked moves to the back, so the ones left over come first next time.
  const runOnce = async () => {
    const deadline = Date.now() + capMs
    for (const id of [...tracked].slice(0, maxPerRun)) {
      if (Date.now() >= deadline) break
      try {
        const status = await checkPayment({ store, sumup, id, now: now(), log })
        tracked.delete(id)
        if (status === 'pending') tracked.add(id)
      } catch (error) {
        // A record that is gone is dropped; anything else is tried again next run
        if (error?.status === 404) tracked.delete(id)
        else {
          tracked.delete(id)
          tracked.add(id)
          log.error(`[card] Could not check ${id}: ${error?.kind || error?.status || 'error'}`)
        }
      }
    }
  }

  // `running` stays set until the checks really have settled, so a stuck check is never joined by a second
  // check of the same payment; the caller gets its answer after at most capMs.
  const run = () => {
    if (running) {
      again = true
      return limited
    }
    if (!tracked.size) return Promise.resolve()
    running = (async () => {
      do {
        again = false
        await runOnce()
      } while (again && tracked.size)
    })().finally(() => { running = null })
    let timer
    limited = Promise.race([running, new Promise((resolve) => { timer = setTimeout(resolve, capMs) })]).finally(() => clearTimeout(timer))
    return limited
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
    listRecentPending: async since => (await request('GET', `${records}?${new URLSearchParams({ filter: `status = "pending" && created >= "${since}"`, perPage: '1' })}`)).items ?? [],
    updateCardPayment: (id, patch) => request('PATCH', `${records}/${encodeURIComponent(id)}`, only(patch))
  }
}
