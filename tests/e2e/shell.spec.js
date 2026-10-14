import { test, expect, gotoReady } from './fixtures.js'
import { NAV_ITEMS } from '../../utils/navigation.js'

const SETTINGS_KEY = 'budget-tracker-settings'
const TRANSACTIONS_KEY = 'budget-tracker-transactions'

// Phones reach Calendar, Reports, Business Card and Settings through the More sheet; the side rail lists every page.
// Returns the control that should now be marked current.
const goTo = async (page, item) => {
  const nav = page.getByRole('navigation', { name: 'Primary' })
  const more = nav.getByRole('button', { name: 'More', exact: true })
  if (item.phone === 'more' && await more.isVisible()) {
    await more.click()
    await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: item.label, exact: true }).click()
    await page.waitForURL(url => url.pathname === item.to)
    await expect(page.getByRole('dialog', { name: 'More' })).toHaveCount(0)
    return more
  }
  const link = nav.getByRole('link', { name: item.label, exact: true })
  await link.click()
  await page.waitForURL(url => url.pathname === item.to)
  return link
}

test.describe('app shell', () => {
  test('primary navigation reaches every page and marks it current', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/business-card')
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(1)

    for (const item of NAV_ITEMS) {
      const current = await goTo(page, item)
      await expect(current).toHaveAttribute('aria-current', 'page')
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

  test('the tab bar shows five comfortable tap targets', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Tab bar is phone-only')
    await gotoReady(page, '/business-card')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const targets = nav.locator('a[href], button')
    await expect(targets).toHaveCount(5)
    await expect(nav.getByRole('link')).toHaveText(['Home', 'Catalog', 'Commissions', 'Print'])
    await expect(nav.getByRole('button', { name: 'More', exact: true })).toBeVisible()
    for (const target of await targets.all()) {
      const box = await target.boundingBox()
      expect(box.height).toBeGreaterThanOrEqual(44)
      expect(box.width).toBeGreaterThanOrEqual(44)
    }
  })

  test('More opens the other pages and is highlighted on them', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'More is phone-only')
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const more = nav.getByRole('button', { name: 'More', exact: true })
    await expect(more).not.toHaveAttribute('aria-current', 'page')
    await more.click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await expect(sheet.getByRole('link')).toHaveText(['Calendar', 'Reports', 'Business Card', 'Settings'])
    await sheet.getByRole('link', { name: 'Settings', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/settings')
    await expect(sheet).toHaveCount(0)
    await expect(more).toHaveAttribute('aria-current', 'page')

    for (const path of ['/calendar', '/reports', '/business-card']) {
      await gotoReady(page, path)
      await expect(more).toHaveAttribute('aria-current', 'page')
    }
    await gotoReady(page, '/commissions')
    await expect(more).not.toHaveAttribute('aria-current', 'page')
    await expect(nav.getByRole('link', { name: 'Commissions', exact: true })).toHaveAttribute('aria-current', 'page')
  })

  test('tapping the current page in More closes the sheet', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'More is phone-only')
    await api.mockCatalog()
    await gotoReady(page, '/settings')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    await nav.getByRole('button', { name: 'More', exact: true }).click()
    const sheet = page.getByRole('dialog', { name: 'More' })
    await sheet.getByRole('link', { name: 'Settings', exact: true }).click()
    await expect(sheet).toHaveCount(0)
  })

  test('the side nav lists all eight pages', async ({ page, isMobile }) => {
    test.skip(isMobile, 'The side nav is for larger screens')
    await gotoReady(page, '/business-card')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    const links = nav.getByRole('link')
    await expect(links).toHaveCount(8)
    const labels = ['Dashboard', 'Catalog', 'Commissions', 'Print board', 'Calendar', 'Reports', 'Business Card', 'Settings']
    for (const [index, label] of labels.entries()) await expect(links.nth(index)).toHaveAccessibleName(label)
    await expect(nav.getByRole('button', { name: 'More', exact: true })).toHaveCount(0)
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

    await expect(nav).toHaveCount(1)
    for (const item of NAV_ITEMS) {
      await goTo(page, item)
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
