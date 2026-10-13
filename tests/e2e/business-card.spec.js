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

  test('shows a QR code each for the website, Etsy and Instagram', async ({ page }) => {
    await gotoReady(page, '/business-card')
    for (const name of ['Website', 'Etsy', 'Instagram']) {
      const block = page.getByRole('figure', { name })
      await expect(block).toBeVisible()
      await expect(block.locator('img[src^="data:image"], canvas').first()).toBeVisible()
    }
    await expect(page.getByRole('link', { name: 'etsy.com/shop/3DPrintShopHarm' })).toHaveAttribute('href', 'https://www.etsy.com/shop/3DPrintShopHarm')
    await expect(page.getByRole('link', { name: 'instagram.com/3d.print.shop.harm' })).toHaveAttribute('href', 'https://www.instagram.com/stories/3d.print.shop.harm/')
  })

  test('every QR code fits inside the screen', async ({ page }) => {
    await gotoReady(page, '/business-card')
    const codes = page.locator('figure').locator('img[src^="data:image"], canvas')
    await expect(codes).toHaveCount(3)
    for (const code of await codes.all()) {
      const box = await code.boundingBox()
      expect(box.x).toBeGreaterThanOrEqual(0)
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width)
    }
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
