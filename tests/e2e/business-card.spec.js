import { test, expect, gotoReady } from './fixtures.js'

test.describe('business card', () => {
  test('QR code fits inside the screen', async ({ page }) => {
    await gotoReady(page, '/business-card')
    const qr = page.locator('img[src^="data:image"], canvas').first()
    await expect(qr).toBeVisible()
    const box = await qr.boundingBox()
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
  })

  test('print button opens the print dialog', async ({ page }) => {
    await page.addInitScript(() => { window.print = () => { window.__printed = true } })
    await gotoReady(page, '/business-card')
    await page.getByRole('button', { name: 'Print' }).click()
    expect(await page.evaluate(() => window.__printed)).toBe(true)
  })

  test('share button appears only where the share sheet exists', async ({ page }) => {
    await gotoReady(page, '/business-card')
    const hasShare = await page.evaluate(() => typeof navigator.share === 'function')
    await expect(page.getByRole('button', { name: 'Share' })).toHaveCount(hasShare ? 1 : 0)
  })

  test('contact rows are tappable links', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await expect(page.getByRole('link', { name: 'service@3dps.space' })).toHaveAttribute('href', 'mailto:service@3dps.space')
  })
})
