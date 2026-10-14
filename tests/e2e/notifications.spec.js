import { test, expect, gotoReady } from './fixtures.js'

// The status line shows Berlin time
test.use({ timezoneId: 'Europe/Berlin' })

const ENDPOINT = 'https://fcm.googleapis.com/fcm/send/test-device'

// Stand-ins for the browser's Notification, PushManager and service worker registration (Playwright blocks
// real service workers). window.__push holds the permission, the subscription and what subscribe() got.
const stubPush = (page, { permission = 'default', answer = 'granted' } = {}) => page.addInitScript(({ permission, answer, endpoint }) => {
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
  const subscription = () => ({
    endpoint,
    toJSON: () => ({ endpoint, keys: { p256dh: 'test-p256dh', auth: 'test-auth' } }),
    unsubscribe: async () => { push.subscription = null; return true }
  })
  const pushManager = {
    getSubscription: async () => push.subscription,
    subscribe: async (options) => {
      push.keyLength = options.applicationServerKey.length
      push.subscription = subscription()
      return push.subscription
    }
  }
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
}, { permission, answer, endpoint: ENDPOINT })

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

  test('a device the push service forgot is asked to turn notifications on again', async ({ page, api }) => {
    api.enable()
    Object.assign(api.notifier, { configured: true, testStatus: 410 })
    await stubPush(page)
    await open(page)
    await page.getByRole('button', { name: 'Turn on notifications on this device' }).click()
    await page.getByRole('button', { name: 'Send test notification' }).click()
    await expect(page.getByRole('alert')).toHaveText('This device has to turn notifications on again')
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
