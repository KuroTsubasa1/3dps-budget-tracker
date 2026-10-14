import { test } from 'node:test'
import assert from 'node:assert/strict'

// h3 helpers are auto-imported in Nitro; stand-ins for the unit test
globalThis.getHeader = (event, name) => event.headers[name]
globalThis.createError = options => Object.assign(new Error(options.statusMessage), options)
const { requireCaller } = await import('../../server/utils/requireCaller.js')

const OWNER_ID = 'owner0000000001'
const NOTIFIER_ID = 'notifier0000001'
const jwt = id => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ id })).toString('base64url'), 'sig'].join('.')
const TOKENS = { owner: jwt(OWNER_ID), notifier: jwt(NOTIFIER_ID), stranger: jwt('stranger0000001') }
const SETTINGS = { pocketbaseUrl: 'http://pb.test', ownerId: OWNER_ID }

function setup () {
  const accounts = { [TOKENS.owner]: OWNER_ID, [TOKENS.notifier]: NOTIFIER_ID, [TOKENS.stranger]: 'stranger0000001' }
  const fetches = []
  const fetch = async (url, options) => {
    fetches.push(url)
    const id = accounts[options.headers.Authorization]
    return id ? { ok: true, json: async () => ({ record: { collectionName: 'users', id } }) } : { ok: false, status: 401, json: async () => ({}) }
  }
  const notifier = { logins: 0, accountId: async () => { notifier.logins++; return NOTIFIER_ID } }
  const call = authorization => requireCaller({ headers: authorization === undefined ? {} : { authorization } }, SETTINGS, { notifier, fetch })
  return { call, fetches, notifier }
}
const refused = async (promise) => {
  await assert.rejects(promise, error => error.statusCode === 401)
}

test('no header: 401, and neither PocketBase nor the notifier login is contacted', async () => {
  const { call, fetches, notifier } = setup()
  await refused(call(undefined))
  assert.deepEqual([fetches.length, notifier.logins], [0, 0])
})

test('a malformed header: 401 without any network call', async () => {
  const { call, fetches, notifier } = setup()
  for (const header of ['Bearer x', 'junk', `${TOKENS.owner}\nX: 1`]) await refused(call(header))
  assert.deepEqual([fetches.length, notifier.logins], [0, 0])
})

test('the owner is let in without a notifier login', async () => {
  const { call, notifier } = setup()
  await call(TOKENS.owner)
  assert.equal(notifier.logins, 0)
})

test('the notifier is let in, its id resolved only after the owner did not match', async () => {
  const { call, notifier } = setup()
  await call(TOKENS.notifier)
  assert.equal(notifier.logins, 1)
})

test('any other account is refused, and so is everybody when the owner id is not set', async () => {
  const { call } = setup()
  await refused(call(TOKENS.stranger))
  const { fetches } = setup()
  await refused(requireCaller({ headers: { authorization: TOKENS.owner } }, { ...SETTINGS, ownerId: '' }, { notifier: { accountId: async () => '' }, fetch: async () => { fetches.push(1); return { ok: false } } }))
  // Without an owner id nothing is even asked of PocketBase
  assert.equal(fetches.length, 0)
})
