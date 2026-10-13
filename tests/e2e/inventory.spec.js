import { test, expect, gotoReady } from './fixtures.js'

const loggedMovements = api => api.db.stock_movements.filter(m => m.note !== 'opening stock')

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

  await expect.poll(() => loggedMovements(api).length).toBe(1)
  expect(loggedMovements(api)[0]).toMatchObject({ article: 'k1', change: -2, reason: 'sale', note: '' })
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

  await expect.poll(() => loggedMovements(api).length).toBe(1)
  expect(loggedMovements(api)[0]).toMatchObject({ change: -1, reason: 'sale', note: 'oversold by 2' })
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

  await expect.poll(() => loggedMovements(api).length).toBe(1)
  expect(loggedMovements(api)[0]).toMatchObject({ change: 0, reason: 'sale', note: 'oversold by 1' })
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
  expect(loggedMovements(api)).toHaveLength(0)

  // Coming back online syncs the queue by itself (the window online event)
  await context.setOffline(false)

  await expect.poll(() => loggedMovements(api).length).toBe(1)
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
  await expect.poll(() => loggedMovements(api).length).toBe(1)

  api.fail('budget_tracket_catalog', 0)
  await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
  await page.getByRole('button', { name: /Sync now/ }).click()

  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(3)
  expect(api.posted).toHaveLength(1)
  expect(loggedMovements(api)).toHaveLength(1)
})

const transactionPosts = api =>
  api.requests.filter(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records'))
const goToDashboard = page =>
  page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()

test('a sale that fails to sync twice is retried until it succeeds', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 10 })] })
  api.fail('budget_tracker_transactions', 500)
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  await expect.poll(() => transactionPosts(api).length).toBe(1)

  await goToDashboard(page)
  await page.getByRole('button', { name: /Sync now/ }).click()
  await expect.poll(() => transactionPosts(api).length).toBe(2)
  await expect(page.getByRole('button', { name: /Syncing/ })).toHaveCount(0)
  await expect(page.getByText('1 pending')).toBeVisible()

  api.fail('budget_tracker_transactions', 0)
  await page.getByRole('button', { name: /Sync now/ }).click()
  await expect.poll(() => api.posted.length).toBe(1)
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(9)
  await expect(page.getByText('1 pending')).toHaveCount(0)
})
