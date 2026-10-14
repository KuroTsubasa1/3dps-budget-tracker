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
  const soldBy = Date.now()

  // Coming back online syncs the queue by itself (the window online event)
  await context.setOffline(false)

  await expect.poll(() => loggedMovements(api).length).toBe(1)
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(4)
  expect(api.posted).toHaveLength(1)
  // The queue kept the lines and the time of the sale, not the time it synced
  expect(api.posted[0].items).toEqual([
    { article: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', categoryName: 'Keychain', quantity: 1, unitPrice: 4, lineTotal: 4, discount: 0, deal: '', dealName: '' }
  ])
  expect(Date.parse(api.posted[0].sold_at)).toBeLessThanOrEqual(soldBy)
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

test('a sale whose server reply was lost is not posted twice', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 10 })] })
  api.fail('budget_tracker_transactions', 'drop')
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  await expect.poll(() => transactionPosts(api).length).toBe(1)

  await goToDashboard(page)
  await page.getByRole('button', { name: /Sync now/ }).click()
  // Stock only moves once the sale counts as synced
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(9)
  expect(api.posted).toHaveLength(1)
  await expect(page.getByText('1 pending')).toHaveCount(0)
})

test('printing after a double sale of the last item counts in full', async ({ page, api }) => {
  api.seed({ articles: [keychain({ stock: 1 })] })
  // Two devices sold the last one at the same moment
  api.db.stock_movements.push(
    { id: 'dbl00000000001a', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: '', created: '2021-01-01 00:00:00.000Z' },
    { id: 'dbl00000000002a', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: '', created: '2021-01-01 00:00:01.000Z' }
  )
  api.db.budget_tracket_catalog[0].stock = 0
  await gotoReady(page, '/catalog')
  await page.getByRole('button', { name: 'Manage' }).click()
  await card(page, 'Pikachu Keychain').click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('Stock now').fill('3')
  await sheet.getByRole('button', { name: 'Save', exact: true }).click()

  await expect(sheet.getByTestId('article-stock')).toHaveText('3')
  expect(api.db.budget_tracket_catalog[0].stock).toBe(3)
})

const stockNowPanel = async (page) => {
  await page.getByRole('button', { name: 'Manage' }).click()
  await card(page, 'Pikachu Keychain').click()
  return page.getByRole('dialog')
}

test('Stock now refuses while a queued sale of the article cannot be sent, and sends it first once it can', async ({ page, api }) => {
  api.seed({ articles: [keychain()] })
  api.fail('budget_tracker_transactions', 500)
  await gotoReady(page, '/catalog')
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  await expect.poll(() => transactionPosts(api).length).toBe(1)
  await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('4 left')

  const panel = await stockNowPanel(page)
  await expect(panel.getByLabel('Stock now')).toHaveValue('4')
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText("Changes for this article are still waiting to sync. Try again once they're sent.")
  expect(loggedMovements(api)).toEqual([])
  expect(api.db.budget_tracket_catalog[0].stock).toBe(5)

  // The server takes the sale again: Save sends it first and the shown number is the stock
  api.fail('budget_tracker_transactions', 0)
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Stock unchanged')
  expect(api.posted).toHaveLength(1)
  expect(loggedMovements(api).map(m => [m.change, m.reason])).toEqual([[-1, 'sale']])
  expect(api.db.budget_tracket_catalog[0].stock).toBe(4)
})

test('Stock now right after an offline checkout comes back online waits for the sale', async ({ page, api, context }) => {
  api.seed({ articles: [keychain()] })
  await gotoReady(page, '/catalog')
  await context.setOffline(true)
  await addToCart(page, 'Pikachu Keychain', 1)
  await openCart(page)
  await page.getByRole('button', { name: 'Add to Balance' }).click()
  const panel = await stockNowPanel(page)
  await expect(panel.getByLabel('Stock now')).toHaveValue('4')

  // Back online, the queue starts sending the sale; Save comes while it is still out
  api.delayNext('budget_tracker_transactions', 2000)
  const posting = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/budget_tracker_transactions/records'))
  await context.setOffline(false)
  await posting
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByRole('alert')).toHaveText("Changes for this article are still waiting to sync. Try again once they're sent.")
  expect(loggedMovements(api)).toEqual([])

  await expect.poll(() => loggedMovements(api).length).toBe(1)
  await expect.poll(() => api.db.budget_tracket_catalog[0].stock).toBe(4)
  await panel.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(panel.getByRole('status')).toHaveText('Stock unchanged')
  expect(loggedMovements(api).map(m => [m.change, m.reason])).toEqual([[-1, 'sale']])
})
