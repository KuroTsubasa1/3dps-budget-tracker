import { test, expect, gotoReady } from './fixtures.js'

test.describe('reports', () => {
  test('period chips toggle and custom range reveals date inputs', async ({ page }) => {
    await gotoReady(page, '/reports')
    const periods = page.getByRole('group', { name: 'Time period' })
    await expect(periods.getByRole('button', { name: 'This Month' })).toHaveAttribute('aria-pressed', 'true')

    await periods.getByRole('button', { name: 'Custom Range' }).click()
    await expect(periods.getByRole('button', { name: 'Custom Range' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByLabel('Start Date')).toBeVisible()
    await expect(page.getByLabel('End Date')).toBeVisible()
  })

  test('tables become lists on phones', async ({ page, isMobile }) => {
    await gotoReady(page, '/reports')
    await expect(page.getByRole('table')).toHaveCount(isMobile ? 0 : 2)
    // Both layouts are in the DOM (one display:none), so only assert on the visible copy
    await expect(page.getByText('PLA Filament Purchase').filter({ visible: true })).toHaveCount(1)
  })
})
