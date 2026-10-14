import { readFileSync } from 'node:fs'
import { test, expect } from './fixtures.js'
import { REPORT_TIMEZONE, openReports } from './report-data.js'

// Figures for Wednesday 14 October 2026, 13:00 in Berlin; the data is in tests/e2e/report-data.js
test.use({ timezoneId: REPORT_TIMEZONE })

const card = (page, title) => page.locator('section', { has: page.getByRole('heading', { name: title, exact: true }) })
const rowsOf = (page, title) => card(page, title).getByRole('listitem')
const periodChip = (page, name) => page.getByRole('group', { name: 'Time period' }).getByRole('button', { name, exact: true })
const reportChip = (page, name) => page.getByRole('group', { name: 'Report' }).getByRole('button', { name, exact: true })

test.describe('reports', () => {
  test('the page starts on Month and Sales, and Custom reveals the date inputs', async ({ page, api }) => {
    await openReports(page, api)
    await expect(periodChip(page, 'Month')).toHaveAttribute('aria-pressed', 'true')
    await expect(reportChip(page, 'Sales')).toHaveAttribute('aria-pressed', 'true')
    for (const name of ['Today', 'Week', 'Year', 'Custom']) await expect(periodChip(page, name)).toHaveAttribute('aria-pressed', 'false')
    for (const name of ['Market day', 'Money', 'Stock']) await expect(reportChip(page, name)).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByLabel('Start Date')).toHaveCount(0)
    await periodChip(page, 'Custom').click()
    await expect(page.getByLabel('Start Date')).toBeVisible()
    await expect(page.getByLabel('End Date')).toBeVisible()
  })

  test('the Sales tab ranks articles and categories, lists deals and flags older sales', async ({ page, api }) => {
    await openReports(page, api)
    // Pikachu: 11 € from lines (7 + 4), 3 units from lines and 3 from the older sale's movement
    await expect(rowsOf(page, 'Top articles')).toHaveText([/Glurak Figure.*2 sold.*60,00/, /Pikachu Keychain.*6 sold.*11,00/])
    await expect(rowsOf(page, 'Top categories')).toHaveText([/Big Figure.*2 sold.*60,00/, /Keychain.*6 sold.*11,00/])
    await expect(rowsOf(page, 'Deals used')).toHaveText([/Keychain 2 for 7.*1×.*1,00/])
    await expect(page.getByText("1 older sales aren't split by article")).toBeVisible()
  })

  test('Sort by Units reorders the tables', async ({ page, api }) => {
    await openReports(page, api)
    await page.getByRole('radiogroup', { name: 'Sort by' }).getByRole('radio', { name: 'Units' }).click()
    await expect(rowsOf(page, 'Top articles')).toHaveText([/Pikachu Keychain/, /Glurak Figure/])
    await expect(rowsOf(page, 'Top categories')).toHaveText([/Keychain/, /Big Figure/])
  })

  test('the period picker changes the figures', async ({ page, api }) => {
    await openReports(page, api)
    await expect(rowsOf(page, 'Top articles').first()).toContainText('60,00')
    await periodChip(page, 'Week').click()
    await expect(periodChip(page, 'Week')).toHaveAttribute('aria-pressed', 'true')
    await expect(rowsOf(page, 'Top articles')).toHaveText([/Glurak Figure.*1 sold.*30,00/, /Pikachu Keychain.*3 sold.*11,00/])
    await expect(page.getByText(/older sales aren't split by article/)).toHaveCount(0)
  })

  test('the Market day tab shows the latest market day, per hour, against the days before', async ({ page, api }) => {
    await openReports(page, api)
    await reportChip(page, 'Market day').click()
    const picker = page.getByRole('combobox', { name: 'Market day' })
    await expect(picker).toHaveValue('2026-10-14')
    await expect(picker.locator('option')).toHaveCount(3)
    await expect(page.getByTestId('market-takings')).toContainText('41,00')
    await expect(page.getByTestId('market-items')).toHaveText('4')
    await expect(page.getByTestId('market-sales')).toHaveText('2')
    // 10:30 and 11:10 in Berlin
    await expect(page.getByRole('img', { name: /Takings per hour: busiest 10:00 with 37,00/ })).toBeVisible()
    // The previous three market days average 30 € takings, 0.3 items and a 30 € sale
    await expect(page.getByTestId('compare-takings')).toContainText('+11,00')
    await expect(page.getByTestId('compare-items')).toHaveText('+3,7')
    await expect(page.getByTestId('compare-average')).toContainText('-9,50')

    await picker.selectOption('2026-10-10')
    await expect(page.getByTestId('market-takings')).toContainText('30,00')
    await expect(page.getByTestId('market-items')).toHaveText('1')
    await expect(page.getByTestId('market-sales')).toHaveText('1')
  })

  test('the Money tab shows income, expenses, profit, Japan and two charts', async ({ page, api }) => {
    await openReports(page, api)
    await reportChip(page, 'Money').click()
    await expect(page.getByTestId('money-income')).toContainText('83,00')
    await expect(page.getByTestId('money-expenses')).toContainText('20,00')
    await expect(page.getByTestId('money-profit')).toContainText('63,00')
    await expect(page.getByTestId('money-japan')).toContainText('8,30')
    await expect(page.getByRole('img', { name: /Income and expenses per week/ })).toBeVisible()
    await expect(page.getByRole('img', { name: /Balance from 60,00.* to 111,00/ })).toBeVisible()
    await expect(rowsOf(page, 'Breakdown')).toHaveCount(5)

    await periodChip(page, 'Year').click()
    await expect(page.getByRole('img', { name: /Income and expenses per month/ })).toBeVisible()
    await expect(rowsOf(page, 'Breakdown')).toHaveCount(12)
    await expect(page.getByTestId('money-income')).toContainText('131,00')
  })

  test('the Stock tab shows stock value, what runs out first, printed vs sold and commissions', async ({ page, api }) => {
    await openReports(page, api)
    await reportChip(page, 'Stock').click()
    // 10 × 4 € + 3 × 30 €
    await expect(page.getByTestId('stock-value')).toContainText('130,00')
    // 6 keychains and 2 figures sold in the last 30 days
    await expect(rowsOf(page, 'Runs out soonest')).toHaveText([/Glurak Figure.*~45 days/, /Pikachu Keychain.*~50 days/])
    await expect(rowsOf(page, 'Printed vs sold')).toHaveText([/Pikachu Keychain.*0 printed.*6 sold/, /Glurak Figure.*2 printed.*2 sold/])
    await expect(page.getByTestId('commissions-open')).toContainText('25,00')
    await expect(page.getByTestId('commissions-delivered')).toContainText('30,00')
    await expect(page.getByTestId('commissions-days')).toHaveText('10 days')
  })

  test('offline, Sales, Market day and Stock need a connection while Money works from the cached transactions', async ({ page, api, context }) => {
    await openReports(page, api)
    await expect(rowsOf(page, 'Top articles')).toHaveCount(2)
    await context.setOffline(true)
    await expect(page.getByText('Needs a connection')).toBeVisible()
    await expect(rowsOf(page, 'Top articles')).toHaveCount(0)
    await reportChip(page, 'Market day').click()
    await expect(page.getByText('Needs a connection')).toBeVisible()
    await reportChip(page, 'Money').click()
    await expect(page.getByTestId('money-income')).toContainText('83,00')
    await reportChip(page, 'Stock').click()
    await expect(page.getByText('Needs a connection')).toBeVisible()
    // Back online the figures load again
    await context.setOffline(false)
    await expect(page.getByTestId('stock-value')).toContainText('130,00')
  })

  test('a request that drops while online shows Needs a connection with Try Again, which loads the figures', async ({ page, api }) => {
    await openReports(page, api, { before: api => { api.failReads('stock_movements', 'drop') } })
    await expect(page.getByText('Needs a connection')).toBeVisible()
    const retry = page.getByRole('button', { name: 'Try Again' })
    expect((await retry.boundingBox()).height).toBeGreaterThanOrEqual(44)
    await retry.click()
    await expect(rowsOf(page, 'Top articles').first()).toContainText('60,00')
    await expect(page.getByText('Needs a connection')).toHaveCount(0)
  })

  test('a real failure after a dropped request replaces Needs a connection', async ({ page, api }) => {
    await openReports(page, api, { before: api => { api.failReads('stock_movements', 'drop') } })
    await expect(page.getByText('Needs a connection')).toBeVisible()
    api.failReads('stock_movements', 500)
    await page.getByRole('button', { name: 'Try Again' }).click()
    await expect(page.getByText('Could not load the report. Check your connection and try again.')).toBeVisible()
    await expect(page.getByText('Needs a connection')).toHaveCount(0)
  })

  test('a locked or missing collection reports as empty instead of failing', async ({ page, api }) => {
    await openReports(page, api, {
      before (api) {
        // Commissions still locked to admins (403), deals not migrated yet (404)
        api.failReads('commissions', 403)
        api.dropCollection('deals')
      }
    })
    await expect(rowsOf(page, 'Top articles').first()).toContainText('60,00')
    await expect(rowsOf(page, 'Deals used')).toHaveText([/Keychain 2 for 7/])
    await reportChip(page, 'Stock').click()
    await expect(page.getByTestId('stock-value')).toContainText('130,00')
    await expect(page.getByTestId('commissions-open')).toContainText('0,00')
  })

  test('an empty period shows a friendly empty state on every tab', async ({ page, api }) => {
    await openReports(page, api)
    await periodChip(page, 'Custom').click()
    await page.getByLabel('Start Date').fill('2025-01-01')
    await page.getByLabel('End Date').fill('2025-01-31')
    await expect(page.getByText('No sales in this period')).toBeVisible()
    await reportChip(page, 'Market day').click()
    await expect(page.getByText('No market days in this period')).toBeVisible()
    await reportChip(page, 'Money').click()
    await expect(page.getByText('No transactions in this period')).toBeVisible()
    await reportChip(page, 'Stock').click()
    await expect(page.getByText('Nothing printed or sold in this period')).toBeVisible()
  })

  test('Export downloads the current tab as CSV for the period', async ({ page, api }) => {
    await openReports(page, api)
    await expect(rowsOf(page, 'Top articles')).toHaveCount(2)
    const [sales] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
    expect(sales.suggestedFilename()).toBe('report-sales-2026-10-01-2026-10-31.csv')
    expect(readFileSync(await sales.path(), 'utf8').split('\n')).toEqual([
      '"Article","Units","Revenue"',
      '"Glurak Figure","2","60.00"',
      '"Pikachu Keychain","6","11.00"'
    ])

    await reportChip(page, 'Money').click()
    await periodChip(page, 'Week').click()
    await expect(page.getByTestId('money-income')).toContainText('41,00')
    const [money] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export', exact: true }).click()])
    expect(money.suggestedFilename()).toBe('report-money-2026-10-12-2026-10-18.csv')
    expect(readFileSync(await money.path(), 'utf8').split('\n')).toEqual([
      '"Period","Income","Expenses","Profit","Balance"',
      '"12 Oct","41.00","0.00","41.00","111.00"'
    ])
  })

  test('Export is off while a tab needs a connection', async ({ page, api, context }) => {
    await openReports(page, api)
    await expect(rowsOf(page, 'Top articles')).toHaveCount(2)
    await context.setOffline(true)
    await expect(page.getByText('Needs a connection')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeDisabled()
    await reportChip(page, 'Money').click()
    await expect(page.getByRole('button', { name: 'Export', exact: true })).toBeEnabled()
  })
})
