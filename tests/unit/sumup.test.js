import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createSumUpClient, SumUpError, isUnreachable, isSandboxMerchant } from '../../server/utils/sumup.js'
import { cardSettings } from '../../server/utils/cardSettings.js'

// Made-up values for the fakes: never a real key, never a real merchant
const KEY = 'test-api-key'
const AFFILIATE = { appId: 'com.example.akinai', key: 'test-affiliate-key' }
const READER = 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65'

// A fetch that answers from a list of [status, body] replies (or throws an Error) and records every request
function fakeFetch (...replies) {
  const requests = []
  const fetch = async (url, options) => {
    requests.push({ url, method: options.method, headers: options.headers, body: options.body ? JSON.parse(options.body) : undefined, signal: options.signal })
    const reply = replies.shift() ?? [200, null]
    if (reply instanceof Error) throw reply
    const [status, body] = reply
    return { ok: status >= 200 && status < 300, status, text: async () => (body === null ? '' : JSON.stringify(body)) }
  }
  return { fetch, requests }
}
const client = fetch => createSumUpClient({ apiKey: KEY, merchantCode: 'MH4H92C7', apiUrl: 'https://api.sumup.test', affiliate: AFFILIATE, fetch })
const problem = (status, title, type = 'https://developer.sumup.com/problem/x') => ({ type, title, status, detail: title })

test('every request carries the API key as a Bearer token, a time limit and the merchant in the path', async () => {
  const { fetch, requests } = fakeFetch([200, { items: [{ id: READER, name: 'Akinai', status: 'paired', device: { identifier: 'S1', model: 'solo' } }] }])
  const readers = await client(fetch).listReaders()
  assert.deepEqual(readers.map(reader => reader.status), ['paired'])
  assert.equal(requests[0].url, 'https://api.sumup.test/v0.1/merchants/MH4H92C7/readers')
  assert.equal(requests[0].method, 'GET')
  assert.equal(requests[0].headers.Authorization, `Bearer ${KEY}`)
  assert.ok(requests[0].signal instanceof AbortSignal)
})

test('pairing posts the code and a name; unpairing deletes the reader; status reads data', async () => {
  const { fetch, requests } = fakeFetch([200, { id: READER, name: 'Akinai', status: 'processing' }], [200, null], [200, { data: { status: 'ONLINE', state: 'IDLE' } }])
  const sumup = client(fetch)
  assert.equal((await sumup.createReader({ pairingCode: 'AB12CD34', name: 'Akinai' })).id, READER)
  await sumup.deleteReader(READER)
  assert.deepEqual(await sumup.readerStatus(READER), { status: 'ONLINE', state: 'IDLE' })
  assert.deepEqual(requests.map(r => [r.method, r.url.replace('https://api.sumup.test/v0.1/merchants/MH4H92C7', '…')]), [
    ['POST', '…/readers'],
    ['DELETE', `…/readers/${READER}`],
    ['GET', `…/readers/${READER}/status`]
  ])
  assert.deepEqual(requests[0].body, { pairing_code: 'AB12CD34', name: 'Akinai' })
})

test('a checkout sends the amount in cents, the description, the return URL and the affiliate with our id', async () => {
  const { fetch, requests } = fakeFetch([201, { data: { client_transaction_id: 'b9f0e2a4-0000-4000-8000-000000000001' } }])
  const data = await client(fetch).checkout(READER, { cents: 1990, description: 'Akinai sale', returnUrl: 'https://akinai.example/api/card/callback/pay000000000001/t', foreignId: 'pay000000000001' })
  assert.equal(data.client_transaction_id, 'b9f0e2a4-0000-4000-8000-000000000001')
  assert.equal(requests[0].url, `https://api.sumup.test/v0.1/merchants/MH4H92C7/readers/${READER}/checkout`)
  assert.deepEqual(requests[0].body, {
    total_amount: { value: 1990, currency: 'EUR', minor_unit: 2 },
    description: 'Akinai sale',
    return_url: 'https://akinai.example/api/card/callback/pay000000000001/t',
    affiliate: { app_id: 'com.example.akinai', key: 'test-affiliate-key', foreign_transaction_id: 'pay000000000001' }
  })
  // No return URL (nuxt dev on localhost): the field is left out
  const second = fakeFetch([201, { data: {} }])
  await client(second.fetch).checkout(READER, { cents: 100, description: 'Akinai sale', returnUrl: null, foreignId: 'pay000000000002' })
  assert.ok(!('return_url' in second.requests[0].body))
})

test('terminate posts to the reader without a body', async () => {
  const { fetch, requests } = fakeFetch([204, null])
  await client(fetch).terminate(READER)
  assert.deepEqual([requests[0].method, requests[0].url, requests[0].body], ['POST', `https://api.sumup.test/v0.1/merchants/MH4H92C7/readers/${READER}/terminate`, undefined])
})

test('a transaction is looked up by client transaction id, else by our id; not found is null', async () => {
  const { fetch, requests } = fakeFetch([200, { id: 'tx-uuid', transaction_code: 'TEENSK4W2K', status: 'SUCCESSFUL' }], [404, { error_code: 'NOT_FOUND', message: 'Resource not found' }])
  const sumup = client(fetch)
  assert.equal((await sumup.findTransaction({ clientTransactionId: 'b9f0 e2', foreignTransactionId: 'pay000000000001' })).transaction_code, 'TEENSK4W2K')
  assert.equal(await sumup.findTransaction({ foreignTransactionId: 'pay000000000001' }), null)
  assert.deepEqual(requests.map(r => r.url), [
    'https://api.sumup.test/v2.1/merchants/MH4H92C7/transactions?client_transaction_id=b9f0%20e2',
    'https://api.sumup.test/v2.1/merchants/MH4H92C7/transactions?foreign_transaction_id=pay000000000001'
  ])
})

test('errors become a kind and a status, and never carry the key or SumUp\'s text', async () => {
  const cases = [
    [[422, problem(422, 'Reader Offline', 'https://developer.sumup.com/problem/reader-offline')], 'offline', 422],
    [[401, problem(401, 'Unauthorized')], 'unauthorized', 401],
    [[404, problem(404, 'Not found')], 'not_found', 404],
    [[409, problem(409, 'Conflict')], 'conflict', 409],
    [[400, problem(400, 'Bad Request')], 'invalid', 400],
    [[422, problem(422, 'Validation failed')], 'invalid', 422],
    [[500, null], 'failed', 500],
    [Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }), 'timeout', 0],
    [new TypeError(`fetch failed for Bearer ${KEY}`), 'unreachable', 0]
  ]
  for (const [reply, kind, status] of cases) {
    const { fetch } = fakeFetch(reply)
    await assert.rejects(client(fetch).listReaders(), (error) => {
      assert.ok(error instanceof SumUpError)
      assert.deepEqual([error.kind, error.status], [kind, status])
      assert.ok(!error.message.includes(KEY) && !error.message.includes('Reader Offline'))
      return true
    })
  }
  assert.ok(isUnreachable(new SumUpError('offline')) && isUnreachable(new SumUpError('timeout')) && isUnreachable(new SumUpError('unreachable')))
  assert.ok(!isUnreachable(new SumUpError('invalid')))
})

test('the sandbox check reads the merchant, and only sandbox: true counts as a sandbox', async () => {
  const { fetch, requests } = fakeFetch([200, { merchant_code: 'MH4H92C7', sandbox: true }])
  assert.equal(isSandboxMerchant(await client(fetch).getMerchant()), true)
  assert.equal(requests[0].url, 'https://api.sumup.test/v1/merchants/MH4H92C7')
  for (const merchant of [{ sandbox: false }, { sandbox: 'true' }, {}, null]) assert.equal(isSandboxMerchant(merchant), false)
})

const ENV = {
  POCKETBASE_URL: 'https://pb.example',
  OWNER_ID: 'owner0000000001',
  NOTIFIER_EMAIL: 'notifier@example.com',
  NOTIFIER_PASSWORD: 'test-password',
  SUMUP_API_KEY: KEY,
  SUMUP_MERCHANT_CODE: 'MH4H92C7',
  SUMUP_AFFILIATE_KEY: 'test-affiliate-key',
  SUMUP_AFFILIATE_APP_ID: 'com.example.akinai'
}

test('card payments are configured with the four SumUp keys, POCKETBASE_URL and OWNER_ID; missing lists names only', () => {
  const settings = cardSettings(ENV)
  assert.deepEqual([settings.configured, settings.background], [true, true])
  assert.equal(settings.apiUrl, 'https://api.sumup.com')
  assert.deepEqual([settings.missing, settings.backgroundMissing], [[], []])
  assert.equal(cardSettings({ ...ENV, SUMUP_API_URL: 'https://api.sumup.test/' }).apiUrl, 'https://api.sumup.test')

  const none = cardSettings({})
  assert.deepEqual([none.configured, none.background], [false, false])
  assert.deepEqual(none.missing, ['SUMUP_API_KEY', 'SUMUP_MERCHANT_CODE', 'SUMUP_AFFILIATE_KEY', 'SUMUP_AFFILIATE_APP_ID', 'POCKETBASE_URL', 'OWNER_ID'])
})

test('without the notifier login card payments still work, but the return URL and the poll are off', () => {
  // The laptop's nuxt dev: sandbox keys, POCKETBASE_URL and OWNER_ID, never the notifier login
  const laptop = cardSettings({ ...ENV, NOTIFIER_EMAIL: '', NOTIFIER_PASSWORD: undefined })
  assert.deepEqual([laptop.configured, laptop.background], [true, false])
  assert.deepEqual(laptop.backgroundMissing, ['NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD'])
  // Background work needs card payments configured first
  assert.equal(cardSettings({ ...ENV, SUMUP_API_KEY: '' }).background, false)
})

test('the API key never goes over plain http, and the merchant code must be letters and digits', () => {
  assert.deepEqual(cardSettings({ ...ENV, SUMUP_API_URL: 'http://api.sumup.com' }).missing, ['SUMUP_API_URL'])
  assert.deepEqual(cardSettings({ ...ENV, SUMUP_API_URL: 'https://api.sumup.com/v0.1' }).missing, ['SUMUP_API_URL'])
  assert.deepEqual(cardSettings({ ...ENV, SUMUP_MERCHANT_CODE: '../me' }).missing, ['SUMUP_MERCHANT_CODE'])
  assert.deepEqual(cardSettings({ ...ENV, POCKETBASE_URL: 'http://pb.example' }).missing, ['POCKETBASE_URL'])
})
