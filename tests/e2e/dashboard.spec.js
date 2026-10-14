import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'

const bodyOverflow = page => page.evaluate(() => document.body.style.overflow)

test.describe('dashboard on phones', () => {
  test.beforeEach(({ isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
  })

  test('add button opens the transaction sheet and Escape closes it', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    const sheet = page.getByRole('dialog', { name: 'Add Transaction' })
    await expect(sheet).toBeVisible()
    await expect.poll(() => bodyOverflow(page)).toBe('hidden')

    await page.keyboard.press('Escape')
    await expect(sheet).toHaveCount(0)
    await expect.poll(() => bodyOverflow(page)).toBe('')
  })

  test('tapping the backdrop closes the sheet', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByTestId('sheet-backdrop').click({ position: { x: 20, y: 20 } })
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('saving closes the sheet and lists the transaction', async ({ page, api }) => {
    await api.mockTransactions()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Add to Balance' }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Market sale')).toBeVisible()
  })

  test('leaving the page with the sheet open unlocks scrolling', async ({ page }) => {
    await gotoReady(page, '/business-card')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/')
    await openTransactionForm(page)
    await expect.poll(() => bodyOverflow(page)).toBe('hidden')

    await page.goBack()
    await page.waitForURL(url => url.pathname === '/business-card')
    await expect.poll(() => bodyOverflow(page)).toBe('')
  })

  test('growing past the desktop breakpoint swaps the sheet for the inline form', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.setViewportSize({ width: 1280, height: 800 })

    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add to Balance' })).toHaveCount(1)
    await expect.poll(() => bodyOverflow(page)).toBe('')
  })

  test('shrinking back after a breakpoint swap does not reopen the sheet', async ({ page }) => {
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.setViewportSize({ width: 1280, height: 800 })
    await expect(page.getByRole('dialog')).toHaveCount(0)

    await page.setViewportSize({ width: 412, height: 915 })
    await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toBeVisible()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })
})

test('desktop shows the form inline without a floating button', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Desktop layout only')
  await gotoReady(page, '/')
  await expect(page.getByRole('button', { name: 'Add to Balance' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add transaction', exact: true })).toHaveCount(0)
})

test('keypad decimal point works after typing digits', async ({ page }) => {
  await gotoReady(page, '/')
  await openTransactionForm(page)
  const amount = page.getByPlaceholder('0.00')
  await amount.fill('12')
  await page.getByRole('button', { name: '.', exact: true }).click()
  await page.getByRole('button', { name: '5', exact: true }).click()
  await expect(amount).toHaveValue('12.5')
})

test('View All on the dashboard opens the reports', async ({ page }) => {
  await gotoReady(page, '/')
  await page.getByRole('link', { name: 'View All' }).click()
  await expect(page).toHaveURL(/\/reports$/)
})
