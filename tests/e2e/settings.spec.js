import { test, expect, gotoReady } from './fixtures.js'

const categoryButton = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) })

test.describe('settings', () => {
  test('phones drill from the group list into a section and back', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await gotoReady(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toHaveCount(0)

    await categoryButton(page, 'Display Settings').click()
    await expect(page).toHaveURL(/#display$/)
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toBeVisible()
    await expect(categoryButton(page, 'Account Settings')).toHaveCount(0)

    await page.getByRole('button', { name: 'All settings' }).click()
    await expect(categoryButton(page, 'Account Settings')).toBeVisible()
  })

  test('deep link opens a section and back returns to the list', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await gotoReady(page, '/settings#display')
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'All settings' }).click()
    await expect(categoryButton(page, 'Display Settings')).toBeVisible()
    await expect(page).not.toHaveURL(/#display$/)
  })

  test('larger screens show the list and a section side by side', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop layout only')
    await gotoReady(page, '/settings')
    await expect(categoryButton(page, 'Display Settings')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible()
  })

  test('dark mode survives saving and reloading', async ({ page }) => {
    await gotoReady(page, '/settings#display')
    const html = page.locator('html')

    await page.getByRole('switch', { name: /Dark Mode/ }).click()
    await expect(html).toHaveClass(/dark/)

    await page.getByRole('button', { name: 'Save Display Settings' }).click()
    await expect(page.getByText('Display settings saved successfully')).toBeVisible()
    await expect(html).toHaveClass(/dark/)

    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect(html).toHaveClass(/dark/)
  })

  test('the legacy shared API token is neither shipped nor kept in settings', async ({ page, context }) => {
    await context.addInitScript(() => {
      if (sessionStorage.getItem('settings-seeded')) return
      const legacy = { api: { baseUrl: 'https://old.example/api/', endpoint: 'records', token: 'old-shared-token' }, display: { darkMode: false } }
      localStorage.setItem('budget-tracker-settings', JSON.stringify(legacy))
      sessionStorage.setItem('settings-seeded', '1')
    })
    await gotoReady(page, '/settings#display')
    expect(await page.evaluate(() => Object.keys(window.__NUXT__.config.public))).not.toContain('apiToken')

    await page.getByRole('button', { name: 'Save Display Settings' }).click()
    await expect(page.getByText('Display settings saved successfully')).toBeVisible()
    const stored = await page.evaluate(() => localStorage.getItem('budget-tracker-settings'))
    expect(JSON.parse(stored).api).toBeUndefined()
    expect(stored).not.toContain('old-shared-token')
  })

  test('clearing data asks for confirmation in a sheet', async ({ page }) => {
    await gotoReady(page, '/settings#data')
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Clear All Data' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })

  test('clearing data removes local entries, the queue and the old API cache', async ({ page }) => {
    await page.addInitScript(() => {
      if (sessionStorage.getItem('data-seeded')) return
      localStorage.setItem('budget-tracker-transactions', JSON.stringify([{ id: 1, recordId: 'loc000000000001', description: 'Lost sale', amount: 7, date: '2026-10-11', notes: '' }]))
      localStorage.setItem('budget-tracker-orphans', JSON.stringify([{ id: 2, description: 'Old stand sale', amount: 4, date: '2026-01-01' }]))
      localStorage.setItem('budget-tracker-offline-queue', JSON.stringify([{ id: 3, recordId: 'pending00000001', description: 'Unsent sale', amount: 5, date: '2026-10-14', status: 'pending', queuedAt: '2026-10-14T10:00:00.000Z' }]))
      sessionStorage.setItem('data-seeded', '1')
    })
    await gotoReady(page, '/settings#data')
    await expect(page.getByText('Old stand sale')).toBeVisible()
    await page.evaluate(async () => { await (await caches.open('api-cache')).put('/x', new Response('x')) })

    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    await page.getByRole('dialog', { name: 'Clear All Data' }).getByRole('button', { name: 'Delete All Data' }).click()
    await expect(page.getByText('Old stand sale')).toHaveCount(0)
    await expect(page.getByText(/\d+ pending/)).toHaveCount(0)
    const stored = await page.evaluate(async () => ({
      transactions: localStorage.getItem('budget-tracker-transactions'),
      orphans: localStorage.getItem('budget-tracker-orphans'),
      queue: JSON.parse(localStorage.getItem('budget-tracker-offline-queue') || '[]'),
      cache: await caches.has('api-cache')
    }))
    expect(stored).toEqual({ transactions: null, orphans: null, queue: [], cache: false })
    await gotoReady(page, '/')
    await expect(page.getByText('Lost sale')).toHaveCount(0)
    await expect(page.getByText('not on the server')).toHaveCount(0)
  })
})
