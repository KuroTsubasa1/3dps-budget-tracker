import { test, expect, gotoReady } from './fixtures.js'
import { NAV_ITEMS } from '../../utils/navigation.js'

const SETTINGS_KEY = 'budget-tracker-settings'
const TRANSACTIONS_KEY = 'budget-tracker-transactions'

test.describe('app shell', () => {
  test('primary navigation reaches every page and marks it current', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/business-card')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await expect(nav).toHaveCount(1)

    for (const item of NAV_ITEMS) {
      const link = nav.getByRole('link', { name: item.label, exact: true })
      await link.click()
      await page.waitForURL(url => url.pathname === item.to)
      await expect(link).toHaveAttribute('aria-current', 'page')
    }
  })

  test('phones get a bottom tab bar, larger screens a side rail', async ({ page, isMobile }) => {
    await gotoReady(page, '/business-card')
    const box = await page.getByRole('navigation', { name: 'Primary' }).boundingBox()
    const viewport = page.viewportSize()

    if (isMobile) {
      expect(box.y + box.height).toBeCloseTo(viewport.height, 0)
      expect(box.width).toBeCloseTo(viewport.width, 0)
    } else {
      expect(box.x).toBe(0)
      expect(box.height).toBeCloseTo(viewport.height, 0)
    }
  })

  test('tab bar links are comfortable tap targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Tab bar is phone-only')
    await gotoReady(page, '/business-card')
    const links = page.getByRole('navigation', { name: 'Primary' }).getByRole('link')
    await expect(links).toHaveCount(NAV_ITEMS.length)
    for (const link of await links.all()) {
      const box = await link.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('header shows the balance on every screen size', async ({ page }) => {
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify([{ id: 1, description: 'Sale', amount: 12.5, date: '2026-10-12' }]))
    }, TRANSACTIONS_KEY)
    await gotoReady(page, '/business-card')
    await expect(page.getByTestId('header-balance')).toBeVisible()
    await expect(page.getByTestId('header-balance')).toContainText('12,50')
  })

  test('stored dark mode survives hydration', async ({ page }) => {
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify({ display: { darkMode: true } }))
    }, SETTINGS_KEY)
    await gotoReady(page, '/business-card')
    await expect(page.locator('html')).toHaveClass(/dark/)
  })

  test('dark mode stays on while moving between tabs', async ({ page, api }) => {
    await api.mockCatalog()
    await page.addInitScript(key => {
      localStorage.setItem(key, JSON.stringify({ display: { darkMode: true } }))
    }, SETTINGS_KEY)
    await gotoReady(page, '/catalog')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const html = page.locator('html')

    for (const item of NAV_ITEMS) {
      await nav.getByRole('link', { name: item.label, exact: true }).click()
      await page.waitForURL(url => url.pathname === item.to)
      await expect(html).toHaveClass(/dark/)
    }
  })

  test('install card can be dismissed with Not Now', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await page.evaluate(() => {
      const event = new Event('beforeinstallprompt')
      event.prompt = () => {}
      event.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(event)
    })
    await expect(page.getByText('Install App')).toBeVisible()
    await page.getByRole('button', { name: 'Not Now' }).click()
    await expect(page.getByText('Install App')).toHaveCount(0)
  })

  test('first service worker install does not claim an update', async ({ page }) => {
    await gotoReady(page, '/business-card')
    // No controller at load (first visit), then the new worker takes control
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new Event('controllerchange')))
    await expect(page.getByText('Update Available')).toHaveCount(0)
  })
})
