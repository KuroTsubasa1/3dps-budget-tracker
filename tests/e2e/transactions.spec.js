import { test, expect } from './fixtures.js'

const STORAGE_KEY = 'budget-tracker-transactions'

const storedTransactions = page =>
  page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), STORAGE_KEY)

test.describe('home page transactions', () => {
  test('shows validation errors for missing description and amount', async ({ page, api }) => {
    await page.goto('/')
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
    await page.goto('/')

    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect(page.getByText('Market sale').first()).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ description: 'Market sale', amount: 25 })

    const stored = await storedTransactions(page)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ description: 'Market sale', amount: 25 })

    // Form resets after a successful add
    await expect(page.getByPlaceholder('What is this transaction for?')).toHaveValue('')
    await expect(page.getByPlaceholder('0.00')).toHaveValue('')
  })

  test('records expenses as negative amounts', async ({ page, api }) => {
    await api.mockTransactions()
    await page.goto('/')

    await page.getByText('Expense', { exact: true }).click()
    await page.getByPlaceholder('What is this transaction for?').fill('Resin')
    await page.getByPlaceholder('0.00').fill('7.5')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(-7.5)
    expect((await storedTransactions(page))[0].amount).toBe(-7.5)
  })

  test('keeps the transaction locally and queues it when the API fails', async ({ page, api }) => {
    await api.mockTransactions({ status: 500 })
    await page.goto('/')

    await page.getByPlaceholder('What is this transaction for?').fill('Commission')
    await page.getByPlaceholder('0.00').fill('40')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect(page.getByText('Failed to save transaction to server')).toBeVisible()
    await expect(page.getByText('1 pending')).toBeVisible()
    expect(await storedTransactions(page)).toHaveLength(1)
  })

  test('restores saved transactions after a reload', async ({ page, api }) => {
    await api.mockTransactions()
    await page.goto('/')

    await page.getByPlaceholder('What is this transaction for?').fill('Keychain order')
    await page.getByPlaceholder('0.00').fill('3')
    await page.getByRole('button', { name: 'Add to Balance' }).click()
    await expect.poll(() => api.posted.length).toBe(1)

    await page.reload()
    await expect(page.getByText('Keychain order').first()).toBeVisible()
  })
})
