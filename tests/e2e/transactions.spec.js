import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'

const STORAGE_KEY = 'budget-tracker-transactions'

const storedTransactions = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), STORAGE_KEY)

test.describe('home page transactions', () => {
  test('shows validation errors for missing description and amount', async ({ page, api }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    const submit = page.getByRole('button', { name: 'Add to Balance' })

    await submit.click()
    await expect(page.getByText('Please enter a description for the transaction')).toBeVisible()

    await page.getByPlaceholder('What is this transaction for?').fill('Filament')
    await submit.click()
    await expect(page.getByText('Please enter a valid amount')).toBeVisible()

    expect(api.posted).toHaveLength(0)
    expect(await storedTransactions(page)).toHaveLength(0)
  })

  test('adds an income transaction and syncs it to the API', async ({ page, api }) => {
    await api.mockTransactions()
    await gotoReady(page, '/')
    await openTransactionForm(page)

    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect(page.getByText('Market sale').first()).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    // Income typed on Home is cash
    expect(api.posted[0]).toMatchObject({ description: 'Market sale', amount: 25, payment_method: 'cash' })
    // A manual entry has no lines and no sale time
    expect(api.posted[0].items).toBeUndefined()
    expect(api.posted[0].sold_at).toBeUndefined()

    const stored = await storedTransactions(page)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ description: 'Market sale', amount: 25 })

    await openTransactionForm(page)
    // Form resets after a successful add
    await expect(page.getByPlaceholder('What is this transaction for?')).toHaveValue('')
    await expect(page.getByPlaceholder('0.00')).toHaveValue('')
  })

  test('records expenses as negative amounts', async ({ page, api }) => {
    await api.mockTransactions()
    await gotoReady(page, '/')
    await openTransactionForm(page)

    await page.getByText('Expense', { exact: true }).click()
    await page.getByPlaceholder('What is this transaction for?').fill('Resin')
    await page.getByPlaceholder('0.00').fill('7.5')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(-7.5)
    // An expense has no payment method
    expect(api.posted[0].payment_method).toBeUndefined()
    expect((await storedTransactions(page))[0].amount).toBe(-7.5)
  })

  test('keeps the transaction locally and queues it when the API fails', async ({ page, api }) => {
    await api.mockTransactions({ status: 500 })
    await gotoReady(page, '/')
    await openTransactionForm(page)

    await page.getByPlaceholder('What is this transaction for?').fill('Commission')
    await page.getByPlaceholder('0.00').fill('40')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect(page.getByText('Failed to save transaction to server')).toBeVisible()
    await expect(page.getByText('1 pending')).toBeVisible()
    expect(await storedTransactions(page)).toHaveLength(1)
  })

  test('restores saved transactions after a reload', async ({ page, api }) => {
    await api.mockTransactions()
    await gotoReady(page, '/')
    await openTransactionForm(page)

    await page.getByPlaceholder('What is this transaction for?').fill('Keychain order')
    await page.getByPlaceholder('0.00').fill('3')
    await page.getByRole('button', { name: 'Add to Balance' }).click()
    await expect.poll(() => api.posted.length).toBe(1)

    await page.reload()
    await expect(page.getByText('Keychain order').first()).toBeVisible()
  })
})

test('a sale queued while a sync is running is not dropped', async ({ page, api }) => {
  const addSale = async (description) => {
    await openTransactionForm(page)
    await page.getByPlaceholder('What is this transaction for?').fill(description)
    await page.getByPlaceholder('0.00').fill('5')
    await page.getByRole('button', { name: 'Add to Balance' }).click()
  }

  await api.mockTransactions({ status: 500 })
  await gotoReady(page, '/')
  await addSale('Sale A')
  await expect(page.getByText('1 pending')).toBeVisible()

  // Sale A's sync is slow; Sale B fails and gets queued while it is still in flight
  api.fail('budget_tracker_transactions', 0)
  api.delayNext('budget_tracker_transactions', 3000)
  await page.getByRole('button', { name: /Sync now/ }).click()
  await expect(page.getByRole('button', { name: /Syncing/ })).toBeVisible()
  api.fail('budget_tracker_transactions', 500)
  // Sale A's warning toast sits over the desktop form's submit button; clear it first
  await page.getByRole('button', { name: 'Dismiss' }).first().click()
  await addSale('Sale B')
  // Proves the overlap: B is in the queue while A's sync is still running
  await expect(page.getByText('2 pending')).toBeVisible()
  await expect(page.getByRole('button', { name: /Syncing/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Syncing/ })).toHaveCount(0, { timeout: 15000 })

  await expect(page.getByText('1 pending')).toBeVisible()

  api.fail('budget_tracker_transactions', 0)
  await page.getByRole('button', { name: /Sync now/ }).click()
  await expect.poll(() => api.posted.map(record => record.description).sort()).toEqual(['Sale A', 'Sale B'])
  await expect(page.getByText(/\d+ pending/)).toHaveCount(0)
})
