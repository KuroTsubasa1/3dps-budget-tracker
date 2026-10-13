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

test.describe('managing deals', () => {
  const editor = page => page.getByRole('dialog')
  const dealList = page => page.getByRole('list', { name: 'Deals' })

  test.beforeEach(async ({ page, api }) => {
    api.seed({ categories: DEAL_CATEGORIES, articles: [], deals: DEALS })
    await gotoReady(page, '/settings#deals')
  })

  test('lists deals with their terms and categories', async ({ page }) => {
    await expect(dealList(page)).toContainText('Keychain 2 for 7')
    await expect(dealList(page)).toContainText('2 for 7,00')
    await expect(dealList(page)).toContainText('Big Figure, Pokeball')
  })

  test('creating an "N for X" deal shows a live example', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Coaster 2 for 15')
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('15')
    await expect(editor(page).getByTestId('deal-example')).toContainText('3 items')
    await expect(editor(page).getByTestId('deal-example')).toContainText('23,00')
    await editor(page).getByRole('button', { name: 'Save' }).click()

    await expect(dealList(page)).toContainText('Coaster 2 for 15')
    expect(api.db.deals.find(deal => deal.name === 'Coaster 2 for 15'))
      .toMatchObject({ type: 'bundle', categories: ['cat-coaster'], min_qty: 2, price: 15 })
  })

  test('a category can only be in one deal', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Second keychain deal')
    await editor(page).getByLabel('Keychain').check()
    await editor(page).getByLabel('Number of items (N)').fill('3')
    await editor(page).getByLabel('Price', { exact: true }).fill('10')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Keychain is already in the deal "Keychain 2 for 7"')
    expect(api.db.deals).toHaveLength(2)
  })

  test('an "N for X" deal needs exactly one category', async ({ page }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Paper goods')
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Bookmark').check()
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('12')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Choose exactly one category for an "N for X €" deal')
  })

  test('a group deal can span categories', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByLabel('Name').fill('Paper goods')
    await editor(page).getByRole('radio', { name: 'Each X € from N' }).click()
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Bookmark').check()
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('4')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(dealList(page)).toContainText('Paper goods')
    expect(api.db.deals.find(deal => deal.name === 'Paper goods'))
      .toMatchObject({ type: 'group', categories: ['cat-coaster', 'cat-bookmark'], min_qty: 2, price: 4 })
  })

  test('editing a deal price keeps its categories', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Big items' }).click()
    await editor(page).getByLabel('Price', { exact: true }).fill('24')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(dealList(page)).toContainText('24,00')
    expect(api.db.deals.find(deal => deal.name === 'Big items')).toMatchObject({ price: 24, categories: ['cat-figure', 'cat-pokeball'] })
  })

  test('deleting a deal', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Keychain 2 for 7' }).click()
    await editor(page).getByRole('button', { name: 'Delete deal' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(dealList(page)).not.toContainText('Keychain 2 for 7')
    expect(api.db.deals.map(deal => deal.name)).toEqual(['Big items'])
  })

  test('validation names the missing piece', async ({ page }) => {
    await page.getByRole('button', { name: 'Add deal' }).click()
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Enter a name')
    await editor(page).getByLabel('Name').fill('Nothing')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Choose a category')
    await editor(page).getByLabel('Coaster').check()
    await editor(page).getByLabel('Number of items (N)').fill('1')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('N must be a whole number of 2 or more')
    await editor(page).getByLabel('Number of items (N)').fill('2')
    await editor(page).getByLabel('Price', { exact: true }).fill('0')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Price must be above 0')
  })
})
