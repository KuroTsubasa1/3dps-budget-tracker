import { readFileSync } from 'node:fs'
import { test, expect, gotoReady } from './fixtures.js'

test.describe('installable PWA', () => {
  test('the page links a manifest with 192, 512 and maskable icons that all load', async ({ page, request, baseURL }) => {
    await gotoReady(page, '/business-card')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBeTruthy()

    const response = await request.get(new URL(href, baseURL).toString())
    expect(response.status()).toBe(200)
    const manifest = await response.json()

    const find = (sizes, purpose) => manifest.icons.find(icon => icon.sizes === sizes && (icon.purpose || 'any') === purpose)
    const icons = [find('192x192', 'any'), find('512x512', 'any'), find('512x512', 'maskable')]
    for (const icon of icons) {
      expect(icon).toBeTruthy()
      const res = await request.get(new URL(icon.src, baseURL).toString())
      expect(res.status()).toBe(200)
      expect(res.headers()['content-type']).toContain('image/png')
    }
    expect(manifest.theme_color).toBe('#2563eb')
  })

  test('has an apple touch icon, a png favicon and the accent theme colour', async ({ page, request, baseURL }) => {
    await gotoReady(page, '/business-card')
    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute('href', '/icons/apple-touch-icon.png')
    await expect(page.locator('link[rel="icon"][sizes="32x32"]')).toHaveAttribute('href', '/icons/icon-32x32.png')
    const res = await request.get(new URL('/icons/apple-touch-icon.png', baseURL).toString())
    expect(res.status()).toBe(200)
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute('content', '#2563eb')
  })

  test('the service worker config does not cache PocketBase API responses', () => {
    // nuxt.config.ts is TypeScript using the Nuxt-global defineNuxtConfig, so it is checked as text
    const config = readFileSync(new URL('../../nuxt.config.ts', import.meta.url), 'utf8')
    expect(config).not.toContain('runtimeCaching')
    const pwaBlock = config.slice(config.indexOf('pwa:'))
    expect(pwaBlock).not.toContain('api-cache')
    expect(pwaBlock).not.toContain('pocket')
  })
})
