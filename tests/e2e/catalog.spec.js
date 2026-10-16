import { test, expect, gotoReady } from './fixtures.js'

// The cart repeats product names, so target the catalog card heading
const card = (page, name) => page.locator('h3', { hasText: name })

test.describe('product catalog', () => {
  test('lists products from the API', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')

    for (const name of ['Dragon Figure', 'Phone Stand', 'Cable Clip']) {
      await expect(page.getByRole('heading', { name })).toBeVisible()
    }
  })

  test('shows an error with retry when the catalog fails to load', async ({ page }) => {
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: 'Try Again' })).toBeVisible()
  })

  test('filters products by search query', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')

    await page.getByPlaceholder('Search products...').fill('stand')
    await expect(page.getByRole('heading', { name: 'Phone Stand' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Dragon Figure' })).toHaveCount(0)

    await page.getByPlaceholder('Search products...').fill('nothing-matches')
    await expect(page.getByText('No products match your search')).toBeVisible()
    await page.getByRole('button', { name: 'Clear Search' }).click()
    await expect(page.getByRole('heading', { name: 'Cable Clip' })).toBeVisible()
  })

  test('adds selected products to the balance as one transaction', async ({ page, api, isMobile }) => {
    test.skip(isMobile, 'Phones check out through the cart sheet (next test)')
    await api.mockCatalog()
    await api.mockTransactions()
    await gotoReady(page, '/catalog')

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
    // Add to Balance is a cash sale
    expect(api.posted[0].payment_method).toBe('cash')
    expect(api.posted[0].sumup_transaction).toBeUndefined()

    // Cart is cleared afterwards
    await expect(page.getByText('0 items')).toBeVisible()
    await expect(submit).toBeDisabled()
  })

  test('checks out from the cart sheet on phones', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await api.mockCatalog()
    await api.mockTransactions()
    await gotoReady(page, '/catalog')

    const cartBar = page.getByRole('button', { name: /View cart/ })
    await expect(cartBar).toHaveCount(0)

    await card(page, 'Dragon Figure').click()
    await card(page, 'Dragon Figure').click()
    await card(page, 'Phone Stand').click()
    await expect(cartBar).toContainText('2 items')
    await expect(cartBar).toContainText('29,00')

    await cartBar.click()
    const sheet = page.getByRole('dialog', { name: 'Cart' })
    await expect(sheet.getByText('Dragon Figure')).toBeVisible()
    await sheet.getByRole('button', { name: 'Add to Balance' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(29)
    expect(api.posted[0].payment_method).toBe('cash')
    await expect(sheet).toHaveCount(0)
    await expect(cartBar).toHaveCount(0)
    await expect(page.getByText(/Added 29,00/)).toBeVisible()
  })

  test('product cards fit two per row on phones', async ({ page, api, isMobile }) => {
    test.skip(!isMobile, 'Phone layout only')
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    const first = await card(page, 'Cable Clip').boundingBox()
    const second = await card(page, 'Dragon Figure').boundingBox()
    expect(Math.abs(first.y - second.y)).toBeLessThan(2)
  })

  test('category chips filter the grid', async ({ page, api }) => {
    api.seed({
      articles: [
        { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
        { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' }
      ]
    })
    await gotoReady(page, '/catalog')
    const chips = page.getByRole('group', { name: 'Categories' })
    await chips.getByRole('button', { name: 'Keychain' }).click()
    await expect(page.getByRole('heading', { name: 'Pikachu Keychain' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Glurak Figure' })).toHaveCount(0)
    await chips.getByRole('button', { name: 'All' }).click()
    await expect(page.getByRole('heading', { name: 'Glurak Figure' })).toBeVisible()
  })

  test('articles without their own price use the category price', async ({ page, api }) => {
    api.seed({
      articles: [
        { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0 },
        { id: 'k2', name: 'Golden Keychain', category: 'cat-keychain', price: 6 }
      ]
    })
    await gotoReady(page, '/catalog')
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('4,00')
    await expect(page.locator('article', { hasText: 'Golden Keychain' })).toContainText('6,00')
  })

  test('cards show stock badges', async ({ page, api }) => {
    api.seed({
      articles: [
        { id: 'a1', name: 'Empty One', stock: 0 },
        { id: 'a2', name: 'Low One', stock: 1, low_stock_threshold: 2 },
        { id: 'a3', name: 'Plenty One', stock: 5 }
      ]
    })
    await gotoReady(page, '/catalog')
    await expect(page.locator('article', { hasText: 'Empty One' })).toContainText('Out of stock')
    await expect(page.locator('article', { hasText: 'Low One' })).toContainText('Low · 1 left')
    await expect(page.locator('article', { hasText: 'Plenty One' })).toContainText('5 left')
  })

  test('soft-deleted articles are not listed', async ({ page, api }) => {
    api.seed({ articles: [{ id: 'a1', name: 'Hidden One', active: false }, { id: 'a2', name: 'Visible One' }] })
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Visible One' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Hidden One' })).toHaveCount(0)
  })
})
