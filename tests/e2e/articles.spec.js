import { test, expect, gotoReady } from './fixtures.js'

const sheet = page => page.getByRole('dialog')
const loggedMovements = api => api.db.stock_movements.filter(m => m.note !== 'opening stock')

test.describe('managing articles', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, stock: 5 }] })
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
  })

  test('creating an article with starting stock', async ({ page, api }) => {
    await page.getByRole('button', { name: '+ New article' }).click()
    await sheet(page).getByLabel('Name').fill('Evoli Keychain')
    await sheet(page).getByLabel('Category').selectOption({ label: 'Keychain' })
    await sheet(page).getByLabel('Starting stock').fill('3')
    await sheet(page).getByRole('button', { name: 'Create article' }).click()

    await expect(sheet(page)).toHaveCount(0)
    const created = page.locator('article', { hasText: 'Evoli Keychain' })
    await expect(created).toContainText('4,00')
    await expect(created).toContainText('3 left')
    const record = api.db.budget_tracket_catalog.find(article => article.name === 'Evoli Keychain')
    expect(record).toMatchObject({ category: 'cat-keychain', stock: 3, active: true })
    expect(loggedMovements(api)).toEqual([expect.objectContaining({ article: record.id, change: 3, reason: 'correction', note: 'starting stock' })])
  })

  test('a failed starting stock still keeps the new article', async ({ page, api }) => {
    api.fail('stock_movements', 500)
    await page.getByRole('button', { name: '+ New article' }).click()
    await sheet(page).getByLabel('Name').fill('Evoli Keychain')
    await sheet(page).getByLabel('Category').selectOption({ label: 'Keychain' })
    await sheet(page).getByLabel('Starting stock').fill('3')
    await sheet(page).getByRole('button', { name: 'Create article' }).click()

    await expect(sheet(page)).toHaveCount(0)
    const created = page.locator('article', { hasText: 'Evoli Keychain' })
    await expect(created).toBeVisible()
    await expect(created).toContainText('Out of stock')
    await expect(page.getByText(/starting stock could not be saved/)).toBeVisible()
    expect(api.db.budget_tracket_catalog.filter(article => article.name === 'Evoli Keychain')).toHaveLength(1)
  })

  test('validation names the missing field', async ({ page }) => {
    await page.getByRole('button', { name: '+ New article' }).click()
    await sheet(page).getByRole('button', { name: 'Create article' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter a name')
    await sheet(page).getByLabel('Name').fill('Nameless')
    await sheet(page).getByRole('button', { name: 'Create article' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Choose a category')
  })

  test('editing sets a price override', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByLabel('Price override').fill('6')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('6,00')
    expect(api.db.budget_tracket_catalog[0].price).toBe(6)
  })

  test('adding printed items and correcting the count are logged', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByLabel('Add printed').fill('2')
    await sheet(page).getByRole('button', { name: 'Add', exact: true }).click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('7')

    await sheet(page).getByLabel('Correct count').fill('1')
    await sheet(page).getByLabel('Correction note').fill('recount')
    await sheet(page).getByRole('button', { name: 'Set' }).click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('1')
    await expect(sheet(page).getByText('recount')).toBeVisible()

    expect(loggedMovements(api).map(m => [m.reason, m.change, m.note])).toEqual([
      ['printed', 2, ''],
      ['correction', -6, 'recount']
    ])
    expect(api.db.budget_tracket_catalog[0].stock).toBe(1)
  })

  test('deleting hides the article but keeps the record', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByRole('button', { name: 'Delete article' }).click()
    await sheet(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pikachu Keychain' })).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].active).toBe(false)
  })

  test('uploading an image attaches it to the article', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    await sheet(page).getByLabel('Add images').setInputFiles({ name: 'pikachu.png', mimeType: 'image/png', buffer: Buffer.from('89504e47', 'hex') })
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].images).toEqual(['pikachu.png'])
  })
})

test.describe('visitors', () => {
  test.use({ owner: false })

  test('cannot see the manage button', async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain' }] })
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('heading', { name: 'Pikachu Keychain' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Manage' })).toHaveCount(0)
  })
})
