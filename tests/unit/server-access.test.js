import { test } from 'node:test'
import assert from 'node:assert/strict'
import { notifierSettings } from '../../server/utils/notifierSettings.js'
import { verifyCaller, feedFileMatches, isWellFormedAuthorization, isPushEndpointAllowed } from '../../server/utils/access.js'

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
const check = (authorization, fetch) => verifyCaller({ authorization, pocketbaseUrl: 'http://pb.test', fetch })

test('a valid token gives the account PocketBase names, and the token goes only to auth-refresh', async () => {
  const { fetch, requests } = fakeFetch()
  assert.equal(await check(TOKENS.owner, fetch), OWNER_ID)
  assert.equal(await check(TOKENS.notifier, fetch), NOTIFIER_ID)
  assert.equal(await check(TOKENS.stranger, fetch), 'stranger0000001')
  assert.deepEqual(requests[0], { url: 'http://pb.test/api/collections/users/auth-refresh', method: 'POST', authorization: TOKENS.owner })
})

test('the call to PocketBase has a time limit', async () => {
  let signal
  await check(TOKENS.owner, async (url, options) => { signal = options.signal; return { ok: false } })
  assert.ok(signal instanceof AbortSignal)
})

test('a token PocketBase rejects is refused', async () => {
  const { fetch } = fakeFetch()
  assert.equal(await check(TOKENS.expired, fetch), null)
})

test('a missing or malformed header is refused without asking PocketBase', async () => {
  const { fetch, requests } = fakeFetch()
  for (const header of [undefined, '', 'Bearer x', 'not-a-token', `${TOKENS.owner}\nX-Injected: 1`, `${'a'.repeat(5000)}.b.c`]) {
    assert.equal(await check(header, fetch), null, String(header).slice(0, 20))
    assert.equal(isWellFormedAuthorization(header), false)
  }
  assert.equal(isWellFormedAuthorization(TOKENS.owner), true)
  assert.deepEqual(requests, [])
  assert.equal(await verifyCaller({ authorization: TOKENS.owner, pocketbaseUrl: '', fetch }), null)
  assert.deepEqual(requests, [])
})

test('when PocketBase cannot be reached, nobody is let in', async () => {
  assert.equal(await check(TOKENS.owner, async () => { throw new Error('offline') }), null)
  // A list-style answer (200, no record) is not proof either
  assert.equal(await check(TOKENS.owner, async () => ({ ok: true, json: async () => ({ items: [] }) })), null)
})

test('only a 200 with a users record that has a string id counts', async () => {
  const answer = (ok, body) => async () => ({ ok, status: ok ? 200 : 401, json: async () => body })
  // A refusal whose body still carries a record
  assert.equal(await check(TOKENS.owner, answer(false, { record: { collectionName: 'users', id: OWNER_ID } })), null)
  // A record of another collection
  assert.equal(await check(TOKENS.owner, answer(true, { record: { collectionName: 'admins', id: OWNER_ID } })), null)
  // An id that is not a string
  assert.equal(await check(TOKENS.owner, answer(true, { record: { collectionName: 'users', id: 123 } })), null)
  assert.equal(await check(TOKENS.owner, answer(true, { record: { collectionName: 'users', id: OWNER_ID } })), OWNER_ID)
})

test('only the real push services are allowed as endpoints', () => {
  for (const endpoint of [
    'https://fcm.googleapis.com/fcm/send/abc', 'https://FCM.googleapis.com./fcm/send/abc', 'https://fcm.googleapis.com:443/x',
    'https://updates.push.services.mozilla.com/wpush/v2/x', 'https://web.push.apple.com/Q1', 'https://api.push.apple.com/3/device/x',
    'https://db5p.notify.windows.com/?token=x', 'https://wns2-par02p.notify.windows.com/w/?token=x'
  ]) {
    assert.equal(isPushEndpointAllowed(endpoint), true, endpoint)
  }
  for (const endpoint of [
    undefined, '', 'not a url', 'http://fcm.googleapis.com/x', 'https://push.example/x',
    'https://127.0.0.1.nip.io/x', 'https://169.254.169.254/latest', 'https://localhost../x', 'https://localhost/x',
    'https://fcm.googleapis.com.evil.com/x', 'https://evilfcm.googleapis.com/x', 'https://push.apple.com.evil/x', 'https://push.apple.com/x',
    'https://notify.windows.com/x', 'https://evilpush.services.mozilla.com/x', 'https://fcm.googleapis.com@evil.com/x',
    'https://user:pass@fcm.googleapis.com/x', 'https://user@fcm.googleapis.com/x', 'https://fcm.googleapis.com:8443/x',
    'https://8.8.8.8/x', 'https://[::1]/x', 'https://[2001:db8::1]/x'
  ]) {
    assert.equal(isPushEndpointAllowed(endpoint), false, String(endpoint))
  }
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
  CALENDAR_SECRET: 'feedsecret-feedsecret-feedsecret-12',
  POCKETBASE_URL: 'https://pb.example/'
}

test('push needs the owner id, the notifier login and the VAPID keys; the feed the owner id, the login and its secret', () => {
  const settings = notifierSettings(FULL)
  assert.deepEqual([settings.push, settings.feed, settings.missing, settings.ownerId], [true, true, [], OWNER_ID])
  assert.equal(settings.pocketbaseUrl, 'https://pb.example')
  // No fallback to the production PocketBase
  assert.equal(notifierSettings({}).pocketbaseUrl, '')
  // The notifier's password never goes over plain http
  const plain = notifierSettings({ ...FULL, POCKETBASE_URL: 'http://pb.example' })
  assert.deepEqual([plain.push, plain.feed, plain.pocketbaseUrl, plain.missing], [false, false, '', ['POCKETBASE_URL']])
  const noUrl = notifierSettings({ ...FULL, POCKETBASE_URL: '' })
  assert.deepEqual([noUrl.push, noUrl.feed, noUrl.missing], [false, false, ['POCKETBASE_URL']])
  const noKeys = notifierSettings({ ...FULL, VAPID_PRIVATE_KEY: ' ' })
  assert.deepEqual([noKeys.push, noKeys.feed, noKeys.missing], [false, true, ['VAPID_PRIVATE_KEY']])
  // A malformed owner id counts as missing: nobody could pass the check
  const badOwner = notifierSettings({ ...FULL, OWNER_ID: 'owner@example.com' })
  assert.deepEqual([badOwner.push, badOwner.feed, badOwner.ownerId, badOwner.missing], [false, false, '', ['OWNER_ID']])
  const nothing = notifierSettings({})
  assert.deepEqual([nothing.push, nothing.feed], [false, false])
  assert.deepEqual(nothing.missing, ['POCKETBASE_URL', 'OWNER_ID', 'NOTIFIER_EMAIL', 'NOTIFIER_PASSWORD', 'NUXT_PUBLIC_VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'VAPID_SUBJECT', 'CALENDAR_SECRET'])
})

test('the feed secret must be long and URL-safe', () => {
  for (const secret of ['short', 'a'.repeat(31), `${'a'.repeat(32)}.ics`, `${'a'.repeat(31)} `, `${'a'.repeat(31)}/`]) {
    const settings = notifierSettings({ ...FULL, CALENDAR_SECRET: secret })
    assert.deepEqual([settings.feed, settings.push, settings.missing], [false, true, ['CALENDAR_SECRET']], secret)
  }
  assert.equal(notifierSettings({ ...FULL, CALENDAR_SECRET: `${'aZ09_-'.repeat(6)}` }).feed, true)
})
