import { test, expect, gotoReady } from './fixtures.js'

const bodyBackground = page =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor)

test.describe('theme foundation', () => {
  test('page uses the light surface colour by default', async ({ page }) => {
    await gotoReady(page, '/business-card')
    expect(await bodyBackground(page)).toBe('rgb(249, 250, 251)')
  })

  test('the dark class switches the surface tokens', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    expect(await bodyBackground(page)).toBe('rgb(3, 7, 18)')
  })

  test('viewport lets the layout reach under the notch', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute('content', /viewport-fit=cover/)
  })
})
