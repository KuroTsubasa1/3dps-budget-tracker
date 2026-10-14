import { test, expect, gotoReady } from './fixtures.js'

test.describe('Akinai branding', () => {
  test('the app is called Akinai in the tab title and the header', async ({ page, isMobile }) => {
    await gotoReady(page, '/')
    await expect(page).toHaveTitle('Akinai · 商い')
    // Phones name the app in the top bar, wider screens in the side navigation
    const brand = isMobile ? page.locator('header') : page.getByRole('navigation', { name: 'Primary' })
    await expect(brand.getByText('Akinai', { exact: true })).toBeVisible()
    await expect(brand.getByRole('img', { name: 'Akinai logo' })).toBeVisible()
    await expect(page.getByText('Budget Tracker')).toHaveCount(0)
  })

  test('the login page names Akinai', async ({ page }) => {
    await gotoReady(page, '/login')
    await expect(page.getByText('Owner account for Akinai')).toBeVisible()
  })

  test('the logo file loads as an SVG', async ({ request, baseURL }) => {
    const res = await request.get(new URL('/logo.svg', baseURL).toString())
    expect(res.status()).toBe(200)
    expect(res.headers()['content-type']).toContain('image/svg+xml')
  })

  test('the old address shows where Akinai moved, the new one does not', async ({ page }) => {
    await gotoReady(page, '/')
    await expect(page.getByText('Akinai has moved.')).toHaveCount(0)
    // Serve the old hostname from the dev server, so the page runs with the old location.hostname
    await page.route(/budget-tracker\.lasseharm\.space/, async route => {
      const url = route.request().url().replace(/^https?:\/\/budget-tracker\.lasseharm\.space/, 'http://localhost:3000')
      await route.fulfill({ response: await route.fetch({ url }) })
    })
    await page.goto('http://budget-tracker.lasseharm.space/')
    await expect(page.getByText('Akinai has moved.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Open akinai.lasseharm.space' })).toHaveAttribute('href', 'https://akinai.lasseharm.space')
    // Requests still in flight through the route must not outlive the test
    await page.unrouteAll({ behavior: 'ignoreErrors' })
  })
})
