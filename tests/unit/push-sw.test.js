import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'

const SOURCE = readFileSync(new URL('../../public/push-sw.js', import.meta.url), 'utf8')

// Runs public/push-sw.js against a stand-in service worker scope
function loadWorker ({ windows = [] } = {}) {
  const listeners = {}
  const shown = []
  const opened = []
  const self = {
    location: { origin: 'https://akinai.example' },
    addEventListener: (type, listener) => { listeners[type] = listener },
    // Copied out of the worker's realm, so deepEqual compares plain objects
    registration: { showNotification: async (title, options) => { shown.push(JSON.parse(JSON.stringify({ title, ...options }))) } },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url) => { opened.push(url) }
    }
  }
  vm.runInNewContext(SOURCE, { self, URL })
  const dispatch = async (type, event) => {
    const waits = []
    listeners[type]({ ...event, waitUntil: promise => waits.push(promise) })
    await Promise.all(waits)
  }
  return { dispatch, shown, opened }
}

const pushEvent = payload => ({ data: { json: () => JSON.parse(payload), text: () => payload } })

test('a push shows the notification with its text and keeps the page to open', async () => {
  const worker = loadWorker()
  await worker.dispatch('push', pushEvent(JSON.stringify({ title: 'Setup today: Dokomi', body: 'Hall 4', url: '/calendar?c=c1' })))
  assert.deepEqual(worker.shown, [{
    title: 'Setup today: Dokomi',
    body: 'Hall 4',
    icon: '/icons/icon-192x192.png',
    badge: '/icons/icon-192x192.png',
    data: { url: '/calendar?c=c1' }
  }])
})

test('a push with plain text still shows something', async () => {
  const worker = loadWorker()
  await worker.dispatch('push', pushEvent('not json'))
  assert.equal(worker.shown[0].title, 'Akinai')
  assert.equal(worker.shown[0].body, 'not json')
})

test('tapping a notification focuses an open window on the page, or opens one', async () => {
  const visited = []
  const open = { url: 'https://akinai.example/catalog', focus: async () => { visited.push('focus') }, navigate: async (url) => { visited.push(url) } }
  const notification = { data: { url: '/calendar?c=c1' }, close: () => visited.push('close') }
  const withWindow = loadWorker({ windows: [open] })
  await withWindow.dispatch('notificationclick', { notification })
  assert.deepEqual(visited, ['close', 'focus', 'https://akinai.example/calendar?c=c1'])
  assert.deepEqual(withWindow.opened, [])

  const none = loadWorker()
  await none.dispatch('notificationclick', { notification: { data: { url: '/calendar?c=c1' }, close () {} } })
  assert.deepEqual(none.opened, ['https://akinai.example/calendar?c=c1'])
})

test('a push whose payload is null or not an object falls back to the defaults', async () => {
  const worker = loadWorker()
  await worker.dispatch('push', pushEvent('null'))
  await worker.dispatch('push', pushEvent('7'))
  assert.deepEqual(worker.shown.map(item => [item.title, item.data.url]), [['Akinai', '/calendar'], ['Akinai', '/calendar']])
})

test('a notification that points to another site opens the calendar instead', async () => {
  for (const url of ['https://evil.example/phish', '//evil.example/x', 'http://']) {
    const worker = loadWorker()
    await worker.dispatch('notificationclick', { notification: { data: { url }, close () {} } })
    assert.deepEqual(worker.opened, ['https://akinai.example/calendar'], url)
  }
})
