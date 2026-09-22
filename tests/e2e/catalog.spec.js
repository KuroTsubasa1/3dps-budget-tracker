import { test, expect } from './fixtures.js'

// The cart sidebar repeats product names, so target the catalog card heading
const card = (page, name) => page.locator('h3', { hasText: name })

test.describe('product catalog', () => {
  test('lists products from the API', async ({ page, api }) => {
    await api.mockCatalog()
    await page.goto('/catalog')

    for (const name of ['Dragon Figure', 'Phone Stand', 'Cable Clip']) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
  })

  test('shows an error with retry when the catalog fails to load', async ({ page }) => {
    await page.goto('/catalog')
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible()
  })

  test('filters products by search query', async ({ page, api }) => {
    await api.mockCatalog()
    await page.goto('/catalog')

    await page.getByPlaceholder('Search products...').fill('stand')
    await expect(page.getByRole('heading', { name: 'Phone Stand' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dragon Figure' })).toHaveCount(0)

    await page.getByPlaceholder('Search products...').fill('nothing-matches')
    await expect(page.getByText('No products match your search')).toBeVisible()
    await page.getByRole('button', { name: 'Clear Search' }).click()
    await expect(page.getByRole('heading', { name: 'Cable Clip' })).toBeVisible()
  })

  test('adds selected products to the balance as one transaction', async ({ page, api }) => {
    await api.mockCatalog()
    await api.mockTransactions()
    await page.goto('/catalog')

    const submit = page.getByRole('button', { name: 'Add to Balance' })
    await expect(submit).toBeDisabled()

    // Clicking a card adds one of that product to the cart
    await card(page, 'Dragon Figure').click()
    await card(page, 'Dragon Figure').click()
    await card(page, 'Phone Stand').click()
    await expect(page.getByText('2 items')).toBeVisible()

    await submit.click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(29) // 2 × 12.50 + 1 × 4.00
    expect(api.posted[0].description).toContain('Dragon Figure')
    expect(api.posted[0].description).toContain('Phone Stand')

    // Cart is cleared afterwards
    await expect(page.getByText('0 items')).toBeVisible()
    await expect(submit).toBeDisabled()
  })
})
