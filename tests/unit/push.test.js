import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pushSupport, deviceName, urlBase64ToUint8Array, statusText } from '../../utils/push.js'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const PIXEL = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15'
const full = { hasServiceWorker: true, hasNotification: true, hasPushManager: true }

test('an iPhone needs Akinai on the Home Screen before it can get notifications', () => {
  assert.equal(pushSupport({ userAgent: IPHONE, standalone: false, ...full }), 'install')
  assert.equal(pushSupport({ userAgent: IPHONE, standalone: true, ...full }), 'ok')
  // An iPad asks for the desktop site but has touch
  assert.equal(pushSupport({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 5, standalone: false, ...full }), 'install')
  assert.equal(pushSupport({ userAgent: IPAD_DESKTOP, platform: 'MacIntel', maxTouchPoints: 0, standalone: false, ...full }), 'ok')
})

test('a browser without push support is told so', () => {
  assert.equal(pushSupport({ userAgent: PIXEL, standalone: false, ...full }), 'ok')
  assert.equal(pushSupport({ userAgent: PIXEL, standalone: false, ...full, hasPushManager: false }), 'unsupported')
})

test('devices are named from the user agent', () => {
  assert.deepEqual([IPHONE, PIXEL, IPAD_DESKTOP, ''].map(deviceName), ['iPhone', 'Android', 'Mac', 'Browser'])
})

test('the VAPID key is decoded from base64url', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID_-8')], [1, 2, 3, 255, 239])
  assert.equal(urlBase64ToUint8Array('BGHxbo5dwKMN5gGwSeCpYcjC_YxtaoR14Ex7zi3-5eL0L3yRPC3xJTnR-dV6QBszCl30NysrCA9zjmyfeZjmXhQ').length, 65)
})

test('the status line says what the server last did', () => {
  assert.equal(statusText(null), '')
  assert.equal(statusText({ configured: false }), "Notifications aren't configured on the server")
  assert.equal(statusText({ configured: true, lastRun: null, lastError: null }), "Reminders haven't been checked yet")
  const lastRun = new Date(2026, 9, 14, 13, 5).toISOString()
  assert.equal(statusText({ configured: true, lastRun, lastError: null }), 'Reminders last checked Wed 14 Oct, 13:05')
  assert.equal(statusText({ configured: true, lastRun, lastError: 'PocketBase is unreachable' }), 'Last check failed: PocketBase is unreachable')
})

test('the status line says when no device has notifications on, and the last delivery problem', () => {
  const lastRun = new Date(2026, 9, 14, 13, 5).toISOString()
  assert.equal(statusText({ configured: true, lastRun, lastError: null, devices: 0 }), 'No device has notifications on')
  assert.equal(statusText({ configured: true, lastRun: null, lastError: null, devices: 0 }), 'No device has notifications on')
  assert.equal(
    statusText({ configured: true, lastRun, lastError: null, lastProblem: 'Apple answered 410 for a device; it was removed', devices: 1 }),
    'Reminders last checked Wed 14 Oct, 13:05 · Apple answered 410 for a device; it was removed'
  )
  // The server could not count the devices: the usual line
  assert.equal(statusText({ configured: true, lastRun, lastError: null, lastProblem: null, devices: null }), 'Reminders last checked Wed 14 Oct, 13:05')
})
