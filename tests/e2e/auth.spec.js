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
})

test('logging out from Settings returns to login and stays logged out', async ({ page }) => {
  await gotoReady(page, '/settings#api')
  await expect(page.getByText('owner@example.com')).toBeVisible()
  await page.getByRole('button', { name: 'Log out' }).click()
  await page.waitForURL(url => url.pathname === '/login')
  await page.goto('/')
  await page.waitForURL(url => url.pathname === '/login')
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
  await api.mockTransactions({ status: 401 })
  await gotoReady(page, '/')
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill('Commission')
  await page.getByPlaceholder('0.00').fill('40')
  await page.getByRole('button', { name: 'Add to Balance' }).click()

  await expect(page.getByText(/session has expired/)).toBeVisible()
  await expect(page.getByText('1 pending')).toBeVisible()
  const stored = await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), TRANSACTIONS_KEY)
  expect(stored).toHaveLength(1)
})
