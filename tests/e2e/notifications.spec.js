import { test, expect, gotoReady } from './fixtures.js'

// The status line shows Berlin time
test.use({ timezoneId: 'Europe/Berlin' })

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-device'

// Stand-ins for the browser's Notification, PushManager and service worker registration (Playwright blocks
// real service workers). window.__push holds the permission, the subscription and what subscribe() got.
const stubPush = (page, { permission = 'default', answer = 'granted', existingKey = null, endpoint: stubEndpoint = ENDPOINT } = {}) => page.addInitScript(({ permission, answer, endpoint, existingKey }) => {
  const push = { permission, answer, subscription: null, keyLength: 0, copied: '' }
  window.__push = push
  window.Notification = class Notification {
    static get permission () { return push.permission }
    static async requestPermission () {
      if (push.permission === 'default') push.permission = push.answer
      return push.permission
    }
  }
  window.PushManager = class PushManager {}
  const subscription = (key = []) => ({
    endpoint,
    options: { applicationServerKey: Uint8Array.from(key).buffer },
    toJSON: () => ({ endpoint, keys: { p256dh: 'test-p256dh', auth: 'test-auth' } }),
    unsubscribe: async () => { push.subscription = null; return true }
  })
  const pushManager = {
    getSubscription: async () => push.subscription,
    subscribe: async (options) => {
      push.keyLength = options.applicationServerKey.length
      push.subscribed = (push.subscribed ?? 0) + 1
      push.subscription = subscription([...options.applicationServerKey])
      return push.subscription
    }
  }
  // A subscription made earlier, with another application server key (the VAPID key was rotated)
  if (existingKey) push.subscription = subscription(existingKey)
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: {
      getRegistration: async () => ({ pushManager }),
      // Like Playwright's blocked service workers: the app's own registration fails quietly
      register: () => Promise.reject(new Error('blocked in tests')),
      addEventListener () {},
      removeEventListener () {},
      controller: null,
      ready: new Promise(() => {})
    }
  })
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async (text) => { push.copied = text } } })
}, { permission, answer, endpoint: stubEndpoint, existingKey })

const open = page => gotoReady(page, '/settings#notifications')
const status = page => page.getByTestId('push-status')

test.describe('notifications', () => {
  test('without the server env the status line says so and nothing can be turned on', async ({ page, api }) => {
    api.enable()
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText("Notifications aren't configured on the server")
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeDisabled()
    await expect(page.getByText("The calendar link isn't configured on the server")).toBeVisible()
  })

  test('turning on asks for permission, subscribes this device and stores it; test and turn off work', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, feed: true })
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText("Reminders haven't been checked yet")
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    expect(await page.evaluate(() => window.__push.keyLength)).toBe(65)
    expect(api.db.push_subscriptions).toHaveLength(1)
    expect(api.db.push_subscriptions[0]).toMatchObject({ endpoint: ENDPOINT, keys: { p256dh: 'test-p256dh', auth: 'test-auth' } })
    expect(api.db.push_subscriptions[0].device).toMatch(/^(Windows|Android|Mac|Browser)$/)

    await page.getByRole('button', { name: 'Send test notification' }).click()
    await expect(page.getByText('Test notification sent')).toBeVisible()
    expect(api.notifier.tests).toEqual([{ endpoint: ENDPOINT }])

    await page.getByRole('button', { name: 'Turn off' }).click()
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeEnabled()
    expect(api.db.push_subscriptions).toEqual([])
    expect(await page.evaluate(() => window.__push.subscription)).toBeNull()
  })

  test('a push service that is not allowed is refused: message shown, nothing stored, state off', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, feed: true })
    await stubPush(page, { endpoint: 'https://push.example.com/x' })
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByRole('alert')).toHaveText("This browser's push service isn't supported. Use Safari on iPhone, or Chrome, Firefox or Edge.")
    expect(api.db.push_subscriptions ?? []).toEqual([])
    expect(await page.evaluate(() => window.__push.subscription)).toBeNull()
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeEnabled()
  })

  test('a device already on the server turns on without a second record', async ({ page, api }) => {
    api.seed({ pushSubscriptions: [{ id: 'sub000000000001', collectionName: 'push_subscriptions', endpoint: ENDPOINT, keys: { p256dh: 'test-p256dh', auth: 'test-auth' }, device: 'Android' }] })
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    expect(api.db.push_subscriptions).toHaveLength(1)
  })

  test('the status line shows the last check, or the last error', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, lastRun: '2026-10-14T11:05:00.000Z' })
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText('Reminders last checked Wed 14 Oct, 13:05')
    api.notifier.lastError = 'PocketBase is unreachable'
    await page.reload()
    await expect(status(page)).toHaveText('Last check failed: PocketBase is unreachable')
  })

  test('with no device on the server the status line says so, until this device turns notifications on', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, lastRun: '2026-10-14T11:05:00.000Z', devices: 0 })
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText('No device has notifications on')
    // The server counts the new device once it is stored
    api.notifier.devices = 1
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    await expect(status(page)).toHaveText('Reminders last checked Wed 14 Oct, 13:05')
    api.notifier.devices = 0
    await page.getByRole('button', { name: 'Turn off' }).click()
    await expect(status(page)).toHaveText('No device has notifications on')
  })

  test('the last delivery problem follows the last check', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, {
      configured: true,
      lastRun: '2026-10-14T11:05:00.000Z',
      lastProblem: 'Apple answered 410 for a device; it was removed',
      devices: 1
    })
    await stubPush(page)
    await open(page)
    await expect(status(page)).toHaveText('Reminders last checked Wed 14 Oct, 13:05 · Apple answered 410 for a device; it was removed')
  })

  test('blocked notifications explain how to allow them again', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page, { permission: 'denied' })
    await open(page)
    await expect(page.getByText(/Notifications are blocked for Akinai on this device/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toHaveCount(0)
  })

  test('saying no to the permission prompt leaves notifications off', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page, { answer: 'denied' })
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText(/Notifications are blocked for Akinai on this device/)).toBeVisible()
    expect(api.db.push_subscriptions).toEqual([])
  })

  for (const code of [410, 404]) {
    test(`a device the push service forgot (${code}) is asked to turn notifications on again`, async ({ page, api }) => {
      api.enable()
      Object.assign(api.notifier, { configured: true, testStatus: code })
      await stubPush(page)
      await open(page)
      await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
      await page.getByRole('button', { name: 'Send test notification' }).click()
      await expect(page.getByRole('alert')).toHaveText('This device has to turn notifications on again')
      // The dead subscription is dropped, so the device can turn notifications on afresh
      await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeVisible()
      expect(await page.evaluate(() => window.__push.subscription)).toBeNull()
    })
  }

  test('another failure of the test shows the server message and keeps notifications on', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, testStatus: 502 })
    await stubPush(page)
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await page.getByRole('button', { name: 'Send test notification' }).click()
    await expect(page.getByRole('alert')).toHaveText('Push server answered 502')
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
  })

  test('a failed save after subscribing leaves notifications off and the subscription dropped', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await open(page)
    api.failOnce('push_subscriptions', 500)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByText('Notifications are on for this device')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeVisible()
    expect(api.db.push_subscriptions).toEqual([])
    expect(await page.evaluate(() => window.__push.subscription)).toBeNull()
  })

  test('a subscription made with an old key is replaced when the server key changed', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page, { existingKey: [1, 2, 3] })
    await open(page)
    // Another application server key: it is not "on" with the current one
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeVisible()
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    expect(await page.evaluate(() => window.__push.subscribed)).toBe(1)
    expect(await page.evaluate(() => window.__push.keyLength)).toBe(65)
  })

  test('a rejected login on load asks to log in again', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await page.route('**/api/push/status', route => route.fulfill({ status: 401, json: { statusCode: 401, message: 'Log in again' } }))
    await open(page)
    await expect(page.getByRole('alert')).toHaveText('Log in again to manage notifications')
  })

  test('the error from a failed load goes away when the connection comes back', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    let fail = true
    await page.route('**/api/push/status', route => (fail ? route.fulfill({ status: 500, json: { statusCode: 500 } }) : route.fallback()))
    await open(page)
    await expect(page.getByRole('alert')).toHaveText('Could not reach the server. Try again later.')
    fail = false
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect(page.getByRole('alert')).toHaveCount(0)
    await expect(page.getByTestId('push-status')).toHaveText("Reminders haven't been checked yet")
  })

  test('logging out turns notifications off on this device', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    expect(api.db.push_subscriptions).toHaveLength(1)
    // Client-side, so the stubbed subscription survives
    const back = page.getByRole('button', { name: 'All settings' })
    if (await back.isVisible()) await back.click()
    await page.getByRole('button', { name: /^API Configuration/ }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(api.db.push_subscriptions).toEqual([])
    expect(await page.evaluate(() => window.__push.subscription)).toBeNull()
  })

  test('logging out still works when the server record cannot be deleted', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await expect(page.getByText('Notifications are on for this device')).toBeVisible()
    api.failOnce('push_subscriptions', 500)
    const back = page.getByRole('button', { name: 'All settings' })
    if (await back.isVisible()) await back.click()
    await page.getByRole('button', { name: /^API Configuration/ }).click()
    await page.getByRole('button', { name: 'Log out' }).click()
    await expect(page).toHaveURL(/\/login/)
    expect(await page.evaluate(() => window.__push.subscription)).toBeNull()
  })

  test('the calendar link is shown and copied', async ({ page, api, baseURL }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, feed: true })
    await stubPush(page)
    await open(page)
    const link = new URL('/api/calendar/feedsecret.ics', baseURL).href
    await expect(page.getByLabel('Private link')).toHaveValue(link)
    await page.getByRole('button', { name: 'Copy calendar link' }).click()
    await expect(page.getByText('Calendar link copied')).toBeVisible()
    expect(await page.evaluate(() => window.__push.copied)).toBe(link)
    await expect(page.getByText(/Add Subscribed Calendar, and paste the link/)).toBeVisible()
  })

  test('offline, the buttons that need the server are disabled', async ({ page, api, context }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await open(page)
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeEnabled()
    await context.setOffline(true)
    await expect(page.getByText('Needs a connection')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toBeDisabled()
    await context.setOffline(false)
  })
})

test.describe('notifications on an iPhone outside the Home Screen', () => {
  test.use({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1' })

  test('explains that Akinai must be on the Home Screen first', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true })
    await stubPush(page)
    await open(page)
    await expect(page.getByText(/Akinai has to be on the Home Screen first/)).toBeVisible()
    await expect(page.getByRole('button', { name: 'Turn on notifications on this device' })).toHaveCount(0)
  })
})
