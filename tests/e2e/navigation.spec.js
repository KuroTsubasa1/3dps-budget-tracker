import { test, expect } from './fixtures.js'

const pages = [
  { path: '/', heading: 'Balance Summary' },
  { path: '/catalog', heading: 'Product Catalog' },
  { path: '/business-card', heading: 'Digital Business Card' },
  { path: '/reports', heading: 'Financial Reports' },
  { path: '/settings', heading: 'Settings' }
]

for (const { path, heading } of pages) {
  test(`${path} renders without console errors`, async ({ page, api }) => {
    await api.mockCatalog()
    const errors = []
    page.on('pageerror', err => errors.push(err.message))

    await page.goto(path)
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
    expect(errors).toEqual([])
  })
}

test('business card renders its QR code in the browser', async ({ page }) => {
  await page.goto('/business-card')
  await expect(page.getByText('Scan QR Code')).toBeVisible()
  await expect(page.locator('img[src^="data:image"], canvas').first()).toBeVisible()
})
