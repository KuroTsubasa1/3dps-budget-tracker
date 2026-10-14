import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifierSettings } from '../../server/utils/notifierSettings.js'
import { verifyCaller, feedFileMatches } from '../../server/utils/access.js'

const OWNER_ID = 'owner0000000001'
const NOTIFIER_ID = 'notifier0000001'
const jwt = id => ['eyJhbGciOiJIUzI1NiJ9', Buffer.from(JSON.stringify({ id })).toString('base64url'), 'sig'].join('.')
const TOKENS = { owner: jwt(OWNER_ID), notifier: jwt(NOTIFIER_ID), stranger: jwt('stranger0000001'), expired: jwt('expired00000001') }

// PocketBase's auth-refresh: 200 with the account for a valid token, 401 otherwise
function fakeFetch () {
  const requests = []
  const accounts = { [TOKENS.owner]: OWNER_ID, [TOKENS.notifier]: NOTIFIER_ID, [TOKENS.stranger]: 'stranger0000001' }
  const fetch = async (url, options) => {
    requests.push({ url, method: options.method, authorization: options.headers.Authorization })
    const id = accounts[options.headers.Authorization]
    return id
      ? { ok: true, json: async () => ({ token: 'renewed', record: { collectionName: 'users', id } }) }
      : { ok: false, status: 401, json: async () => ({ code: 401 }) }
  }
  return { fetch, requests }
}
const check = (authorization, fetch) => verifyCaller({ authorization, pocketbaseUrl: 'http://pb.test', allowedIds: [OWNER_ID, NOTIFIER_ID], fetch })

test('the owner and the notifier are let in, and the token goes only to auth-refresh', async () => {
  const { fetch, requests } = fakeFetch()
  assert.equal(await check(TOKENS.owner, fetch), true)
  assert.equal(await check(TOKENS.notifier, fetch), true)
  assert.deepEqual(requests[0], { url: 'http://pb.test/api/collections/users/auth-refresh', method: 'POST', authorization: TOKENS.owner })
})

test('a valid token of any other account is refused', async () => {
  const { fetch } = fakeFetch()
  assert.equal(await check(TOKENS.stranger, fetch), false)
})

test('a token PocketBase rejects is refused', async () => {
  const { fetch } = fakeFetch()
  assert.equal(await check(TOKENS.expired, fetch), false)
})

test('a missing or malformed header is refused without asking PocketBase', async () => {
  const { fetch, requests } = fakeFetch()
  for (const header of [undefined, '', 'Bearer x', 'not-a-token', `${TOKENS.owner}\nX-Injected: 1`, `${'a'.repeat(5000)}.b.c`]) {
    assert.equal(await check(header, fetch), false, String(header).slice(0, 20))
  }
  assert.deepEqual(requests, [])
})

test('without an allow-list, or when PocketBase cannot be reached, nobody is let in', async () => {
  const { fetch, requests } = fakeFetch()
  assert.equal(await verifyCaller({ authorization: TOKENS.owner, pocketbaseUrl: 'http://pb.test', allowedIds: ['', null], fetch }), false)
  assert.deepEqual(requests, [])
  assert.equal(await check(TOKENS.owner, async () => { throw new Error('offline') }), false)
  // A list-style answer (200, no record) is not proof either
  assert.equal(await check(TOKENS.owner, async () => ({ ok: true, json: async () => ({ items: [] }) })), false)
})

test('the feed link needs the exact secret', () => {
  assert.equal(feedFileMatches('s3cret.ics', 's3cret'), true)
  assert.equal(feedFileMatches('s3cret', 's3cret'), false)
  assert.equal(feedFileMatches('S3cret.ics', 's3cret'), false)
  assert.equal(feedFileMatches('.ics', ''), false)
  assert.equal(feedFileMatches('', ''), false)
})

const FULL = {
  OWNER_ID,
  NOTIFIER_EMAIL: 'akinai-notifier@example.com',
  NOTIFIER_PASSWORD: 'long-random',
  NUXT_PUBLIC_VAPID_PUBLIC_KEY: 'BPub',
  VAPID_PRIVATE_KEY: 'priv',
  VAPID_SUBJECT: 'mailto:owner@example.com',
  CALENDAR_SECRET: 'feedsecret',
  NUXT_PUBLIC_POCKETBASE_URL: 'https://pb.example/'
}

test('push needs the owner id, the notifier login and the VAPID keys; the feed the owner id, the login and its secret', () => {
  const settings = notifierSettings(FULL)
  assert.deepEqual([settings.push, settings.feed, settings.missing, settings.ownerId], [true, true, [], OWNER_ID])
  assert.equal(settings.pocketbaseUrl, 'https://pb.example')
  assert.equal(notifierSettings({}).pocketbaseUrl, 'https://pocket.lasseharm.space')
  const noKeys = notifierSettings({ ...FULL, VAPID_PRIVATE_KEY: ' ' })
  assert.deepEqual([noKeys.push, noKeys.feed, noKeys.missing], [false, true, ['VAPID_PRIVATE_KEY']])
  // A malformed owner id counts as missing: nobody could pass the check
  const badOwner = notifierSettings({ ...FULL, OWNER_ID: 'owner@example.com' })
  assert.deepEqual([badOwner.push, badOwner.feed, badOwner.ownerId, badOwner.missing], [false, false, '', ['OWNER_ID']])
  const nothing = notifierSettings({})
  assert.deepEqual([nothing.push, nothing.feed], [false, false])
  assert.deepEqual(nothing.missing, ['OWNER_ID', 'NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD', 'NUXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CALENDAR_SECRET'])
})
