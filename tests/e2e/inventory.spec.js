import { test, expect, gotoReady } from './fixtures.js'

const keychain = overrides => ({ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, stock: 5, ...overrides })
const card = (page, name) => page.locator('h3', { hasText: name })
const isCompact = page => page.viewportSize().width < 1024

const openCart = async (page) => {
  if (isCompact(page)) await page.getByRole('button', { name: /View cart/ }).click()
}

const addToCart = async (page, name, times) => {
  for (let i = 0; i < times; i++) await card(page, name).click()
}

test('checkout logs a sale and lowers stock', async ({ page, api }) => {
  api.seed({ articles: [keychain()] })
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 2)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  expect(api.db.stock_movements[0]).toMatchObject({ article: 'k1', change: -2, reason: 'sale', note: '' })
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(3)
  expect(api.posted[0].amount).toBe(8)
  await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('3 left')
})

test('overselling warns, sells, and stops stock at 0', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 1 })] })
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 3)
  await openCart(page)
  await expect(page.getByText('only 1 in stock')).toBeVisible()
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  expect(api.db.stock_movements[0]).toMatchObject({ change: -1, reason: 'sale', note: 'oversold by 2' })
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(0)
  expect(api.posted[0].amount).toBe(12)
  await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('Out of stock')
})

test('selling from empty stock logs the oversell', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 0 })] })
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  expect(api.db.stock_movements[0]).toMatchObject({ change: 0, reason: 'sale', note: 'oversold by 1' })
  expect(api.db.budget_tracket_catalog[0].stock).toBe(0)
  expect(api.posted).toHaveLength(1)
})

test('an offline checkout syncs its stock changes later', async ({ page, api, context }) => {
  api.seed({ articles: [keychain()] })
  await gotoReady(page, '/catalog')
  await context.setOffline(true)
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  expect(api.db.stock_movements).toHaveLength(0)

  await context.setOffline(false)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Sync now/ }).click()

  await expect.poll(() => api.db.stock_movements.length).toBe(1)
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(4)
  expect(api.posted).toHaveLength(1)
})

test('a retried sync does not duplicate the sale', async ({ page, api }) => {
  api.seed({ articles: [keychain()] })
  // The movement is created, then the stock update fails, so the whole sale is queued
  api.fail('budget_tracket_catalog', 500)
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 2)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  await expect.poll(() => api.db.stock_movements.length).toBe(1)

  api.fail('budget_tracket_catalog', 0)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Sync now/ }).click()

  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(3)
  expect(api.posted).toHaveLength(1)
  expect(api.db.stock_movements).toHaveLength(1)
})
