import { test } from 'node:test'
import assert from 'node:assert/strict'
import { runReminderJob, createReminderRunner, createPushSender, forgetSubscription, PUSH_TTL_S } from '../../server/utils/reminderJob.js'
import { createNotifier } from '../../server/utils/notifier.js'

const local = (month, day, hours, minutes = 0) => new Date(2026, month - 1, day, hours, minutes)
const iso = (...parts) => local(...parts).toISOString()
// 29 October, 09:05 local: the 09:00 reminders are due
const NOW = local(10, 29, 9, 5)

const reminder = (id, kind, at, extra = {}) => ({ id, kind, at, auto: true, ...extra })
const convention = (id, status, reminders, extra = {}) => ({
  id,
  name: id,
  status,
  starts_on: '2026-11-07',
  ends_on: '2026-11-08',
  applications_close: '2026-10-30',
  hall: '',
  table: '',
  setup_at: '',
  reminders,
  ...extra
})
const pushError = statusCode => Object.assign(new Error(`push ${statusCode}`), { statusCode })

// An in-memory notifier store that records what the job wrote
function fakeStore ({ conventions = [], articles = [], subscriptions = [] } = {}) {
  const db = { conventions: structuredClone(conventions), subscriptions: structuredClone(subscriptions) }
  return {
    db,
    calls: [],
    async listConventions () { this.calls.push('conventions'); return structuredClone(db.conventions) },
    async listActiveArticles () { this.calls.push('articles'); return structuredClone(articles) },
    async listSubscriptions () { this.calls.push('subscriptions'); return structuredClone(db.subscriptions) },
    async deleteSubscription (id) { db.subscriptions = db.subscriptions.filter(item => item.id !== id) },
    async markReminders (id, marks) {
      const record = db.conventions.find(item => item.id === id)
      record.reminders = record.reminders.map((item) => {
        const mark = marks.find(entry => entry.id === item.id && entry.at === item.at)
        if (!mark || item.sent_at) return item
        const { id: _id, at: _at, ...fields } = mark
        return { ...item, ...fields }
      })
    }
  }
}

// Records every push; `fail` maps an endpoint to the error it answers with
function fakeSend (fail = {}) {
  const sent = []
  const send = async (subscription, message) => {
    if (fail[subscription.endpoint]) throw fail[subscription.endpoint]
    sent.push({ endpoint: subscription.endpoint, ...message })
  }
  return { sent, send }
}

const PHONE = { id: 'sub000000000001', endpoint: 'https://fcm.googleapis.com/fcm/send/phone', keys: { p256dh: 'p', auth: 'a' } }
const TABLET = { id: 'sub000000000002', endpoint: 'https://fcm.googleapis.com/fcm/send/tablet', keys: { p256dh: 'p', auth: 'a' } }
const remindersOf = (store, id) => store.db.conventions.find(item => item.id === id).reminders

test('due reminders are sent to every device and recorded as sent', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('auto-deadline-1', 'deadline', iso(10, 29, 9)), reminder('later', 'custom', iso(10, 29, 18))])],
    subscriptions: [PHONE, TABLET]
  })
  const { sent, send } = fakeSend()
  const summary = await runReminderJob({ store, send, now: NOW })
  assert.deepEqual(sent, [
    { endpoint: PHONE.endpoint, title: 'Applications close tomorrow', body: 'dokomi · closes Fri 30 Oct', url: '/calendar?c=dokomi' },
    { endpoint: TABLET.endpoint, title: 'Applications close tomorrow', body: 'dokomi · closes Fri 30 Oct', url: '/calendar?c=dokomi' }
  ])
  assert.deepEqual(remindersOf(store, 'dokomi'), [
    reminder('auto-deadline-1', 'deadline', iso(10, 29, 9), { sent_at: NOW.toISOString() }),
    reminder('later', 'custom', iso(10, 29, 18))
  ])
  assert.deepEqual(summary, { sent: 1, skipped: 0, missed: 0, failed: 0, removed: 0, errors: [], stateErrors: [] })
  // Never sent twice
  await runReminderJob({ store, send, now: local(10, 29, 9, 10) })
  assert.equal(sent.length, 2)
})

test('a reminder the status no longer allows is skipped, one more than a day late is missed, and neither is sent', async () => {
  const store = fakeStore({
    conventions: [
      convention('applied', 'applied', [reminder('auto-deadline-1', 'deadline', iso(10, 29, 9))]),
      convention('late', 'interested', [reminder('auto-deadline-7', 'deadline', iso(10, 23, 9))])
    ],
    subscriptions: [PHONE]
  })
  const { sent, send } = fakeSend()
  const summary = await runReminderJob({ store, send, now: NOW })
  assert.deepEqual(sent, [])
  assert.deepEqual(remindersOf(store, 'applied')[0], reminder('auto-deadline-1', 'deadline', iso(10, 29, 9), { sent_at: NOW.toISOString(), skipped: true }))
  assert.deepEqual(remindersOf(store, 'late')[0], reminder('auto-deadline-7', 'deadline', iso(10, 23, 9), { sent_at: NOW.toISOString(), missed: true }))
  assert.deepEqual([summary.sent, summary.skipped, summary.missed], [0, 1, 1])
  // Nothing to send: neither the devices nor the articles are loaded
  assert.deepEqual(store.calls, ['conventions'])
})

test('a device the push service no longer knows is deleted', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('auto-deadline-1', 'deadline', iso(10, 29, 9))])],
    subscriptions: [PHONE, TABLET]
  })
  const { sent, send } = fakeSend({ [PHONE.endpoint]: pushError(410) })
  const summary = await runReminderJob({ store, send, now: NOW })
  assert.deepEqual(store.db.subscriptions.map(item => item.id), [TABLET.id])
  assert.deepEqual(sent.map(item => item.endpoint), [TABLET.endpoint])
  assert.deepEqual([summary.sent, summary.removed], [1, 1])
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, NOW.toISOString())

  const gone = fakeStore({ conventions: [convention('x', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])], subscriptions: [PHONE] })
  await runReminderJob({ store: gone, send: fakeSend({ [PHONE.endpoint]: pushError(404) }).send, now: NOW })
  assert.deepEqual(gone.db.subscriptions, [])
})

test('a reminder no device could get stays unsent for the next run, and the error is reported', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('auto-deadline-1', 'deadline', iso(10, 29, 9))])],
    subscriptions: [PHONE]
  })
  const summary = await runReminderJob({ store, send: fakeSend({ [PHONE.endpoint]: pushError(500) }).send, now: NOW })
  assert.deepEqual([summary.sent, summary.failed], [0, 1])
  assert.deepEqual(summary.errors, ['push 500'])
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, undefined)
  // Next run the push service is back
  const { sent, send } = fakeSend()
  await runReminderJob({ store, send, now: local(10, 29, 9, 10) })
  assert.equal(sent.length, 1)
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, local(10, 29, 9, 10).toISOString())
})

test('the stock check reads the active articles and lists what to print', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'booked', [reminder('auto-stock', 'stock', iso(10, 24, 9))])],
    articles: [{ id: 'k1', name: 'Pikachu Keychain', active: true, stock: 1, low_stock_threshold: 3, target_stock: 0 }],
    subscriptions: [PHONE]
  })
  const { sent, send } = fakeSend()
  await runReminderJob({ store, send, now: local(10, 24, 9, 1) })
  assert.deepEqual(sent.map(item => [item.title, item.body]), [['dokomi in 14 days', 'Low stock: Pikachu Keychain (print 5)']])
  assert.deepEqual(store.calls, ['conventions', 'articles', 'subscriptions'])
})

test('without any device a due reminder still counts as sent', async () => {
  const store = fakeStore({ conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])] })
  const summary = await runReminderJob({ store, send: fakeSend().send, now: NOW })
  assert.equal(summary.sent, 1)
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, NOW.toISOString())
})

test('the runner keeps the last run and the last error for the status line, and retries next time', async () => {
  const logged = []
  const log = { error: message => logged.push(message) }
  let broken = true
  const store = fakeStore({ conventions: [] })
  const listConventions = store.listConventions.bind(store)
  store.listConventions = async () => {
    if (broken) throw new Error('PocketBase is unreachable')
    return listConventions()
  }
  const status = { lastRun: null, lastError: null }
  const runner = createReminderRunner({ store, send: fakeSend().send, status, log })
  assert.equal(await runner.run(NOW), null)
  assert.deepEqual(status, { lastRun: null, lastError: 'PocketBase is unreachable' })
  assert.deepEqual(logged, ['[reminders] PocketBase is unreachable'])
  broken = false
  await runner.run(local(10, 29, 9, 10))
  assert.deepEqual(status, { lastRun: local(10, 29, 9, 10).toISOString(), lastError: null })
})

test('the runner never runs twice at once', async () => {
  let calls = 0
  let release
  const store = fakeStore()
  store.listConventions = () => { calls++; return new Promise(resolve => { release = () => resolve([]) }) }
  const runner = createReminderRunner({ store, send: fakeSend().send, status: { lastRun: null, lastError: null }, log: { error () {} } })
  const first = runner.run(NOW)
  const second = runner.run(NOW)
  assert.equal(first, second)
  release()
  await first
  assert.equal(calls, 1)
})

test('a device failure is shown in the status line even though the run finished', async () => {
  const store = fakeStore({ conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])], subscriptions: [PHONE] })
  const status = { lastRun: null, lastError: null }
  const runner = createReminderRunner({ store, send: fakeSend({ [PHONE.endpoint]: pushError(500) }).send, status, log: { error () {} } })
  await runner.run(NOW)
  assert.deepEqual(status, { lastRun: NOW.toISOString(), lastError: 'Could not reach a device: push 500' })
})

test('pushes go out with the VAPID details and a day to live', async () => {
  const calls = []
  const webpush = { sendNotification: async (...args) => { calls.push(args) } }
  const send = createPushSender({ webpush, publicKey: 'pub', privateKey: 'priv', subject: 'mailto:owner@example.com' })
  await send(PHONE, { title: 'T', body: 'B', url: '/calendar?c=x' })
  assert.deepEqual(calls, [[
    { endpoint: PHONE.endpoint, keys: PHONE.keys },
    '{"title":"T","body":"B","url":"/calendar?c=x"}',
    { vapidDetails: { subject: 'mailto:owner@example.com', publicKey: 'pub', privateKey: 'priv' }, TTL: PUSH_TTL_S, timeout: 30_000 }
  ]])
  assert.equal(PUSH_TTL_S, 86400)
})

// A stand-in for the PocketBase SDK: tokens are JWTs with an exp, answers come from `handlers`
const jwt = exp => ['h', Buffer.from(JSON.stringify({ exp })).toString('base64url'), 's'].join('.')
function fakeSdk (handlers) {
  const log = []
  class FakePocketBase {
    constructor (url, authStore) {
      this.url = url
      this.authStore = authStore
      log.push(['new', url])
    }

    autoCancellation () {}
    filter (expression, params) { return expression.replace('{:endpoint}', JSON.stringify(params.endpoint)) }
    collection (name) {
      const pb = this
      const answer = async (method, ...args) => {
        log.push([name, method, pb.authStore.token ? 'auth' : 'guest'])
        return handlers[`${name}.${method}`](pb, ...args)
      }
      return {
        authWithPassword: async (email, password) => {
          log.push(['login', email, password])
          pb.authStore.save(handlers.nextToken(), { id: 'notifier0000001' })
        },
        getFullList: options => answer('getFullList', options),
        getOne: id => answer('getOne', id),
        update: (id, body) => answer('update', id, body),
        delete: id => answer('delete', id)
      }
    }
  }
  return { FakePocketBase, log }
}

test('the notifier logs in before its first call and again when the token runs out', async () => {
  const fresh = () => jwt(Math.floor(Date.now() / 1000) + 14 * 86400)
  let tokens = [jwt(Math.floor(Date.now() / 1000) + 600), fresh()]
  const { FakePocketBase, log } = fakeSdk({
    nextToken: () => tokens.shift(),
    'conventions.getFullList': async () => []
  })
  const notifier = createNotifier({ PocketBaseClass: FakePocketBase, url: 'http://pb.test', email: 'notifier@example.com', password: 'secret' })
  await notifier.listConventions()
  // The first token expires within the hour, so the next call logs in again
  await notifier.listConventions()
  await notifier.listConventions()
  assert.deepEqual(log.filter(entry => entry[0] === 'login').length, 2)
  assert.deepEqual(log[0], ['new', 'http://pb.test'])
  assert.ok(log.filter(entry => entry[0] === 'conventions').every(entry => entry[2] === 'auth'))
  // The notifier knows its own account, so the owner's routes can accept it
  assert.equal(await notifier.accountId(), 'notifier0000001')
  tokens = []
})

test('the notifier logs in again once on a 401 and retries', async () => {
  let failures = 1
  const { FakePocketBase, log } = fakeSdk({
    nextToken: () => jwt(Math.floor(Date.now() / 1000) + 14 * 86400),
    'push_subscriptions.getFullList': async () => {
      if (failures-- > 0) throw Object.assign(new Error('unauthorized'), { status: 401 })
      return [PHONE]
    }
  })
  const notifier = createNotifier({ PocketBaseClass: FakePocketBase, url: 'http://pb.test', email: 'n@example.com', password: 'p' })
  assert.deepEqual(await notifier.listSubscriptions(), [PHONE])
  assert.equal(log.filter(entry => entry[0] === 'login').length, 2)
})

test('the notifier marks reminders on a fresh copy, so an edit made meanwhile survives', async () => {
  const stored = convention('dokomi', 'interested', [
    reminder('auto-deadline-7', 'deadline', iso(10, 23, 9)),
    // The owner moved this one after the job loaded it
    reminder('auto-deadline-1', 'deadline', iso(10, 29, 20), { auto: false })
  ])
  let written = null
  const { FakePocketBase } = fakeSdk({
    nextToken: () => jwt(Math.floor(Date.now() / 1000) + 14 * 86400),
    'conventions.getOne': async () => structuredClone(stored),
    'conventions.update': async (pb, id, body) => { written = { id, body } }
  })
  const notifier = createNotifier({ PocketBaseClass: FakePocketBase, url: 'http://pb.test', email: 'n@example.com', password: 'p' })
  await notifier.markReminders('dokomi', [
    { id: 'auto-deadline-7', at: iso(10, 23, 9), sent_at: NOW.toISOString(), missed: true },
    { id: 'auto-deadline-1', at: iso(10, 29, 9), sent_at: NOW.toISOString() }
  ])
  assert.deepEqual(written, {
    id: 'dokomi',
    body: {
      reminders: [
        reminder('auto-deadline-7', 'deadline', iso(10, 23, 9), { sent_at: NOW.toISOString(), missed: true }),
        reminder('auto-deadline-1', 'deadline', iso(10, 29, 20), { auto: false })
      ]
    }
  })
})

test('the notifier finds a device by its endpoint', async () => {
  let filter = ''
  const { FakePocketBase } = fakeSdk({
    nextToken: () => jwt(Math.floor(Date.now() / 1000) + 14 * 86400),
    'push_subscriptions.getFullList': async (pb, options) => { filter = options.filter; return [PHONE] }
  })
  const notifier = createNotifier({ PocketBaseClass: FakePocketBase, url: 'http://pb.test', email: 'n@example.com', password: 'p' })
  assert.deepEqual(await notifier.findSubscription(PHONE.endpoint), PHONE)
  assert.equal(filter, `endpoint = "${PHONE.endpoint}"`)
})

test('a failed mark for one convention does not resend the others', async () => {
  const store = fakeStore({
    conventions: [
      convention('a', 'interested', [reminder('r', 'custom', iso(10, 29, 9))]),
      convention('b', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])
    ],
    subscriptions: [PHONE]
  })
  const markReminders = store.markReminders.bind(store)
  store.markReminders = async (id, marks) => {
    if (id === 'a') throw new Error('PocketBase is unreachable')
    return markReminders(id, marks)
  }
  const { sent, send } = fakeSend()
  const first = await runReminderJob({ store, send, now: NOW })
  assert.deepEqual([first.errors, first.stateErrors], [[], ['PocketBase is unreachable']])
  await runReminderJob({ store, send, now: local(10, 29, 9, 10) })
  await runReminderJob({ store, send, now: local(10, 29, 9, 15) })
  assert.equal(sent.filter(item => item.url === '/calendar?c=b').length, 1)
  assert.equal(remindersOf(store, 'b')[0].sent_at, NOW.toISOString())
})

test('a 410 device whose deletion answers 404 still marks the reminder', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])],
    subscriptions: [PHONE]
  })
  store.deleteSubscription = async () => { throw Object.assign(new Error('not found'), { status: 404 }) }
  const summary = await runReminderJob({ store, send: fakeSend({ [PHONE.endpoint]: pushError(410) }).send, now: NOW })
  assert.deepEqual([summary.sent, summary.failed, summary.errors, summary.stateErrors], [1, 0, [], []])
  assert.equal(remindersOf(store, 'dokomi')[0].sent_at, NOW.toISOString())
})

test('an endpoint that is not a public https address is never contacted and its device is deleted', async () => {
  const evil = { id: 'sub000000000009', endpoint: 'https://169.254.169.254/latest', keys: { p256dh: 'p', auth: 'a' } }
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])],
    subscriptions: [evil, PHONE]
  })
  const { sent, send } = fakeSend()
  const summary = await runReminderJob({ store, send, now: NOW })
  assert.deepEqual(sent.map(item => item.endpoint), [PHONE.endpoint])
  assert.deepEqual(store.db.subscriptions.map(item => item.id), [PHONE.id])
  assert.deepEqual([summary.sent, summary.removed], [1, 1])
})

test('a run that hangs is cut off, its error recorded, and the next run starts', async () => {
  const store = fakeStore({
    conventions: [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])],
    subscriptions: [PHONE]
  })
  const status = { lastRun: null, lastError: null }
  const logged = []
  const runner = createReminderRunner({ store, send: () => new Promise(() => {}), status, log: { error: message => logged.push(message) }, capMs: 20 })
  const first = runner.run(NOW)
  assert.equal(await first, null)
  assert.match(status.lastError, /took too long/)
  assert.equal(logged.length, 1)
  assert.notEqual(runner.run(NOW), first)
})

test('the status line says whether a device or the saved reminder state failed', async () => {
  const conventions = [convention('dokomi', 'interested', [reminder('r', 'custom', iso(10, 29, 9))])]
  const device = { lastRun: null, lastError: null }
  await createReminderRunner({ store: fakeStore({ conventions, subscriptions: [PHONE] }), send: fakeSend({ [PHONE.endpoint]: pushError(500) }).send, status: device, log: { error () {} } }).run(NOW)
  assert.equal(device.lastError, 'Could not reach a device: push 500')

  const state = { lastRun: null, lastError: null }
  const store = fakeStore({ conventions, subscriptions: [PHONE] })
  store.markReminders = async () => { throw new Error('PocketBase is unreachable') }
  const logged = []
  await createReminderRunner({ store, send: fakeSend().send, status: state, log: { error: message => logged.push(message) } }).run(NOW)
  assert.equal(state.lastError, 'Could not save reminder state: PocketBase is unreachable')
  assert.deepEqual(logged, ['[reminders] Could not save reminder state: PocketBase is unreachable'])
})

test('forgetting a subscription tolerates one that is already gone', async () => {
  const deleted = []
  const store = { deleteSubscription: async (id) => { deleted.push(id) } }
  await forgetSubscription(store, 'a')
  assert.deepEqual(deleted, ['a'])
  await forgetSubscription({ deleteSubscription: async () => { throw Object.assign(new Error('missing'), { status: 404 }) } }, 'b')
  await assert.rejects(forgetSubscription({ deleteSubscription: async () => { throw Object.assign(new Error('down'), { status: 500 }) } }, 'c'), /down/)
})

test('the notifier gives up on a PocketBase request that never answers', async () => {
  const realFetch = globalThis.fetch
  // Never answers; only an abort signal can end it
  globalThis.fetch = (url, options) => new Promise((resolve, reject) => {
    options.signal?.addEventListener('abort', () => reject(options.signal.reason))
  })
  // AbortSignal.timeout does not keep the process alive; Node 20 (CI and the server) would end the test
  // before the timeout fires, so hold the event loop open the way a running server does
  const keepAlive = setInterval(() => {}, 1000)
  try {
    const notifier = createNotifier({ url: 'https://pb.test', email: 'n@example.com', password: 'p', requestTimeoutMs: 20 })
    await assert.rejects(notifier.listConventions())
  } finally {
    clearInterval(keepAlive)
    globalThis.fetch = realFetch
  }
})
