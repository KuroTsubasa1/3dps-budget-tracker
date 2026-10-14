import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'

const STORAGE_KEY = 'budget-tracker-transactions'
const ORPHANS_KEY = 'budget-tracker-orphans'

const serverRecord = (id, description, amount, created = '2026-10-12 10:00:00.000Z') =>
  ({ id, collectionName: 'budget_tracker_transactions', description, amount, notes: '', created, updated: created })

// An entry another device never saw: not on the server and never queued
const seedLocal = (context, entries) => context.addInitScript(({ key, entries }) => {
  if (sessionStorage.getItem('local-seeded')) return
  localStorage.setItem(key, JSON.stringify(entries))
  sessionStorage.setItem('local-seeded', '1')
}, { key: STORAGE_KEY, entries })

const addSale = async (page, description, amount) => {
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill(description)
  await page.getByPlaceholder('0.00').fill(String(amount))
  await page.getByRole('button', { name: 'Add to Balance' }).click()
}

test('a second device shows transactions recorded on the server', async ({ page, api }) => {
  await api.mockTransactions()
  api.db.budget_tracker_transactions.push(serverRecord('srv000000000001', 'Booth sale', 20), serverRecord('srv000000000002', 'Resin', -4.5))
  await gotoReady(page, '/')

  await expect(page.getByTestId('header-balance')).toContainText('15,50')
  await expect(page.getByText('Booth sale').first()).toBeVisible()
  await expect(page.getByText('Resin').first()).toBeVisible()
})

test('a sale made offline stays listed and is counted once after syncing', async ({ page, api, context }) => {
  await api.mockTransactions()
  api.db.budget_tracker_transactions.push(serverRecord('srv000000000001', 'Booth sale', 20))
  await gotoReady(page, '/')
  await expect(page.getByTestId('header-balance')).toContainText('20,00')

  await context.setOffline(true)
  await addSale(page, 'Offline sale', 5)
  await expect(page.getByText('Offline sale').first()).toBeVisible()
  await expect(page.getByTestId('header-balance')).toContainText('25,00')

  await context.setOffline(false)
  await expect.poll(() => api.posted.length).toBe(2)
  await expect(page.getByText(/\d+ pending/)).toHaveCount(0)
  await expect(page.getByTestId('header-balance')).toContainText('25,00')
  await expect(page.getByText('Offline sale')).toHaveCount(1)
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY))).toHaveLength(2)
})

test('the balance is still shown after a reload without a server', async ({ page, api }) => {
  await api.mockTransactions()
  api.db.budget_tracker_transactions.push(serverRecord('srv000000000001', 'Booth sale', 20))
  await gotoReady(page, '/')
  await expect(page.getByTestId('header-balance')).toContainText('20,00')

  // The dev server cannot be reloaded while the browser is offline, so the transactions endpoint fails instead
  api.failReads('budget_tracker_transactions', 500)
  await page.reload()
  await expect(page.getByTestId('header-balance')).toContainText('20,00')
  await expect(page.getByText('Booth sale').first()).toBeVisible()
})

test.describe('local entries that are not on the server', () => {
  const lonely = { id: 111, recordId: 'loc000000000001', description: 'Lost sale', amount: 7, date: '2026-10-11', notes: '' }

  test('are listed in Settings and flagged on the dashboard', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/')
    await expect(page.getByText('1 local entry is not on the server', { exact: false })).toBeVisible()
    // They no longer count towards the shared balance
    await expect(page.getByTestId('header-balance')).toContainText('0,00')

    await page.getByRole('link', { name: /review in Settings/ }).click()
    await page.waitForURL(url => url.pathname === '/settings')
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toBeVisible()
    await expect(page.getByText('Lost sale')).toBeVisible()
  })

  test('Upload posts the entry and removes it', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/settings#data')
    await expect(page.getByText('Lost sale')).toBeVisible()
    await page.getByRole('button', { name: 'Upload' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ description: 'Lost sale', amount: 7 })
    expect(api.posted[0].id).not.toBe(lonely.recordId)
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toHaveCount(0)

    await gotoReady(page, '/')
    await expect(page.getByText('not on the server')).toHaveCount(0)
    await expect(page.getByTestId('header-balance')).toContainText('7,00')
  })

  test('Discard removes the entry after confirmation', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/settings#data')
    await page.getByRole('button', { name: 'Discard' }).click()
    // Cancelling keeps it
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Lost sale')).toBeVisible()

    await page.getByRole('button', { name: 'Discard' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toHaveCount(0)
    expect(api.posted).toHaveLength(0)
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), ORPHANS_KEY)).toHaveLength(0)

    await gotoReady(page, '/')
    await expect(page.getByText('not on the server')).toHaveCount(0)
  })
})
