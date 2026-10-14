import { test, expect, gotoReady, openTransactionForm, FAKE_TOKEN } from './fixtures.js'

const TRANSACTIONS_KEY = 'budget-tracker-transactions'

test.describe('logged out', () => {
  test.use({ owner: false })

  for (const path of ['/', '/reports', '/settings']) {
    test(`${path} redirects to login`, async ({ page }) => {
      await page.goto(path)
      await page.waitForURL(url => url.pathname === '/login')
      expect(new URL(page.url()).searchParams.get('redirect')).toBe(path)
    })
  }

  test('logging in returns to the requested page', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/login?redirect=/reports')
    await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(url => url.pathname === '/reports')
  })

  test('a wrong password shows an error', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/login')
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('nope')
    await page.getByRole('button', { name: 'Log in' }).click()
    await expect(page.getByRole('alert')).toHaveText('Wrong email or password')
  })

  test('a redirect to another site is ignored', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/login?redirect=//evil.example')
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(url => url.pathname === '/')
    expect(page.url()).not.toContain('evil.example')
  })

  test('logging in syncs a sale queued while the session was expired', async ({ page, context, api }) => {
    api.enable()
    await context.addInitScript(() => {
      if (sessionStorage.getItem('queue-seeded')) return
      const sale = { id: 1, description: 'Queued sale', amount: 12, date: '2026-10-13', notes: '' }
      localStorage.setItem('budget-tracker-offline-queue', JSON.stringify([{ ...sale, queuedAt: '2026-10-13T10:00:00.000Z', status: 'failed', lastError: 'Session expired' }]))
      sessionStorage.setItem('queue-seeded', '1')
    })
    await gotoReady(page, '/login')
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Log in' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ description: 'Queued sale', amount: 12 })
  })

  test('the catalog can be browsed but not sold from', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Dragon Figure' })).toBeVisible()
    await page.locator('h3', { hasText: 'Dragon Figure' }).click()
    await expect(page.getByRole('button', { name: /to cart/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View cart/ })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to Balance' })).toHaveCount(0)
  })
})

test('logging out from Settings returns to login and stays logged out', async ({ page }) => {
  await gotoReady(page, '/settings#api')
  await expect(page.getByText('owner@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL(url => url.pathname === '/login')
  await page.goto('/')
  await page.waitForURL(url => url.pathname === '/login')
})

test('logging out removes the cached transactions but keeps sales that still need to sync', async ({ page, api }) => {
  api.seed()
  api.posted.push({ id: 'srv000000000001', collectionName: 'budget_tracker_transactions', description: 'Commission: Totoro × 1 (Anna Example)', amount: 8, notes: '', created: '2026-10-10 10:00:00.000Z', updated: '2026-10-10 10:00:00.000Z' })
  await gotoReady(page, '/')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('budget-tracker-transactions') || '')).toContain('Anna Example')

  // The server keeps refusing new sales, so the queued one really is still waiting
  api.fail('budget_tracker_transactions', 500)
  await page.evaluate(() => {
    localStorage.setItem('budget-tracker-orphans', JSON.stringify([{ id: 1, description: 'Old stand sale', amount: 4, date: '2026-01-01' }]))
    localStorage.setItem('budget-tracker-offline-queue', JSON.stringify([
      { id: 2, recordId: 'pending00000001', description: 'Unsent sale', amount: 7, date: '2026-10-14', status: 'pending', queuedAt: '2026-10-14T10:00:00.000Z' },
      { id: 3, recordId: 'synced000000001', description: 'Commission: Pokeball × 1 (Ben Example)', amount: 30, date: '2026-10-13', status: 'synced', queuedAt: '2026-10-13T10:00:00.000Z' }
    ]))
  })

  await gotoReady(page, '/settings#api')
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL(url => url.pathname === '/login')

  const stored = await page.evaluate(() => ({
    transactions: localStorage.getItem('budget-tracker-transactions'),
    orphans: localStorage.getItem('budget-tracker-orphans'),
    queue: JSON.parse(localStorage.getItem('budget-tracker-offline-queue') || '[]')
  }))
  expect(stored.transactions).toBeNull()
  expect(stored.orphans).toBeNull()
  expect(stored.queue.map(item => item.description)).toEqual(['Unsent sale'])
})

test('a transaction refresh still loading at logout does not write the data back', async ({ page, api }) => {
  api.seed()
  api.posted.push({ id: 'srv000000000002', collectionName: 'budget_tracker_transactions', description: 'Commission: Totoro × 1 (Anna Example)', amount: 8, notes: '', created: '2026-10-10 10:00:00.000Z', updated: '2026-10-10 10:00:00.000Z' })
  await gotoReady(page, '/settings#api')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('budget-tracker-transactions') || '')).toContain('Anna Example')

  // Hold the next transactions read for a moment, then let the fake answer it
  let held = 0
  await page.route('**/api/collections/budget_tracker_transactions/records**', async (route) => {
    if (route.request().method() === 'GET') {
      held++
      await new Promise(resolve => setTimeout(resolve, 1500))
    }
    await route.fallback()
  })
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
  await expect.poll(() => held).toBeGreaterThan(0)
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL(url => url.pathname === '/login')
  await page.waitForTimeout(2000)

  expect(await page.evaluate(() => localStorage.getItem('budget-tracker-transactions'))).toBeNull()
})

test('transactions are sent with the owner session instead of the shared token', async ({ page, api }) => {
  await api.mockTransactions()
  await gotoReady(page, '/')
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
  await page.getByPlaceholder('0.00').fill('25')
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect.poll(() => api.posted.length).toBe(1)
  const post = api.requests.find(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records'))
  expect(post.authorization).toBe(FAKE_TOKEN)
  expect(post.body.token).toBeUndefined()
})

test('an expired session keeps the transaction and asks to log in', async ({ page, api }) => {
  await api.mockTransactions()
  await gotoReady(page, '/')
  // The fake token expires in 2100, so from here on the SDK treats the session as invalid
  await page.clock.setFixedTime(new Date('2101-01-01T00:00:00Z'))
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill('Commission')
  await page.getByPlaceholder('0.00').fill('40')
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect(page.getByText(/session has expired/)).toBeVisible()
  await expect(page.getByText('1 pending')).toBeVisible()
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), TRANSACTIONS_KEY)
  expect(stored).toHaveLength(1)
  const posts = api.requests.filter(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records'))
  expect(posts).toHaveLength(0)
})
