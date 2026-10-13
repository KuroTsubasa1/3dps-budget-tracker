import { test, expect, gotoReady } from './fixtures.js'

export const DEAL_CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 },
  { id: 'cat-pokeball', name: 'Pokeball', base_price: 30, sort_order: 2 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 3 },
  { id: 'cat-bookmark', name: 'Bookmark', base_price: 5, sort_order: 4 }
]

export const DEALS = [
  { id: 'deal-keychain00', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 },
  { id: 'deal-bigitems00', name: 'Big items', type: 'group', categories: ['cat-figure', 'cat-pokeball'], min_qty: 2, price: 25 }
]

const ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' },
  { id: 'p1', name: 'Master Ball', category: 'cat-pokeball' },
  { id: 'p2', name: 'Golden Pokeball', category: 'cat-pokeball', price: 45 }
]

const card = (page, name) => page.locator('h3', { hasText: name })
const isCompact = page => page.viewportSize().width < 1024
const cart = page => (isCompact(page) ? page.getByRole('dialog', { name: 'Cart' }) : page.locator('aside'))

const addToCart = async (page, name, times = 1) => {
  for (let i = 0; i < times; i++) await card(page, name).click()
}

const openCart = async (page) => {
  if (isCompact(page)) await page.getByRole('button', { name: /View cart/ }).click()
}

test.describe('cart deals', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ categories: DEAL_CATEGORIES, articles: ARTICLES, deals: DEALS })
    await api.mockTransactions()
    await gotoReady(page, '/catalog')
  })

  test('cards show the deal their article belongs to', async ({ page }) => {
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('2 for 7,00')
    await expect(page.locator('article', { hasText: 'Glurak Figure' })).toContainText('25,00 € each from 2')
    await expect(page.locator('article', { hasText: 'Golden Pokeball' })).not.toContainText('each from')
  })

  test('three keychains cost one pair plus a single', async ({ page, api }) => {
    await addToCart(page, 'Pikachu Keychain', 3)
    await openCart(page)
    await expect(cart(page).getByRole('list', { name: 'Deals applied' })).toContainText('Keychain 2 for 7')
    await expect(cart(page).getByTestId('cart-total')).toContainText('11,00')
    await cart(page).getByRole('button', { name: 'Add to Balance' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(11)
    expect(api.posted[0].description).toContain('Deals: Keychain 2 for 7')
  })

  test('mixed big items unlock the group price', async ({ page, api }) => {
    await addToCart(page, 'Glurak Figure')
    await addToCart(page, 'Master Ball')
    await openCart(page)
    await expect(cart(page).getByTestId('cart-total')).toContainText('50,00')
    await cart(page).getByRole('button', { name: 'Add to Balance' }).click()
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(50)
  })

  test('an overridden article neither gets nor unlocks a deal', async ({ page }) => {
    await addToCart(page, 'Master Ball')
    await addToCart(page, 'Golden Pokeball')
    await openCart(page)
    await expect(cart(page).getByTestId('cart-total')).toContainText('75,00')
    await expect(cart(page).getByRole('list', { name: 'Deals applied' })).toHaveCount(0)
  })
})
