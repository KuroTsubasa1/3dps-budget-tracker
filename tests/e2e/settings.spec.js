import { test, expect, gotoReady } from './fixtures.js'

const categoryButton = (page, name) => page.getByRole('button', { name: new RegExp(`^${name}`) })

test.describe('settings', () => {
  test('phones drill from the group list into a section and back', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await gotoReady(page, '/settings')
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toHaveCount(0)

    await categoryButton(page, 'Display Settings').click()
    await expect(page).toHaveURL(/#display$/)
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toBeVisible()
    await expect(categoryButton(page, 'Account Settings')).toHaveCount(0)

    await page.getByRole('button', { name: 'All settings' }).click()
    await expect(categoryButton(page, 'Account Settings')).toBeVisible()
  })

  test('deep link opens a section and back returns to the list', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await gotoReady(page, '/settings#display')
    await expect(page.getByRole('heading', { name: 'Display Settings' })).toBeVisible()

    await page.getByRole('button', { name: 'All settings' }).click()
    await expect(categoryButton(page, 'Display Settings')).toBeVisible()
    await expect(page).not.toHaveURL(/#display$/)
  })

  test('larger screens show the list and a section side by side', async ({ page, isMobile }) => {
    test.skip(isMobile, 'Desktop layout only')
    await gotoReady(page, '/settings')
    await expect(categoryButton(page, 'Display Settings')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Account Settings' })).toBeVisible()
  })

  test('dark mode survives saving and reloading', async ({ page }) => {
    await gotoReady(page, '/settings#display')
    const html = page.locator('html')

    await page.getByRole('switch', { name: /Dark Mode/ }).click()
    await expect(html).toHaveClass(/dark/)

    await page.getByRole('button', { name: 'Save Display Settings' }).click()
    await expect(page.getByText('Display settings saved successfully')).toBeVisible()
    await expect(html).toHaveClass(/dark/)

    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect(html).toHaveClass(/dark/)
  })

  test('clearing data asks for confirmation in a sheet', async ({ page }) => {
    await gotoReady(page, '/settings#data')
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    const dialog = page.getByRole('dialog', { name: 'Clear All Data' })
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toHaveCount(0)
  })
})
