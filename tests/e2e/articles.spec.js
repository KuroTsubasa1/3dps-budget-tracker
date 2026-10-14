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
    await page.getByRole('button', { name: 'New article' }).click()
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
    await page.getByRole('button', { name: 'New article' }).click()
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
    await page.getByRole('button', { name: 'New article' }).click()
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

  test('Stock now records a higher count as printed and a lower one as a correction', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const stockNow = sheet(page).getByLabel('Stock now')
    const save = sheet(page).getByRole('button', { name: 'Save', exact: true })
    await expect(stockNow).toHaveValue('5')
    await expect(save).toHaveClass(/btn-primary/)
    await stockNow.fill('7')
    await save.click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('7')
    await expect(stockNow).toHaveValue('7')

    await stockNow.fill('1')
    await save.click()
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('1')

    expect(loggedMovements(api).map(m => [m.reason, m.change, m.note])).toEqual([
      ['printed', 2, ''],
      ['correction', -6, '']
    ])
    expect(api.db.budget_tracket_catalog[0].stock).toBe(1)
    // One field: no Add printed, no Set, no note
    await expect(sheet(page).getByLabel('Add printed')).toHaveCount(0)
    await expect(sheet(page).getByLabel('Correction note')).toHaveCount(0)
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('1 left')
  })

  test('Stock now says when nothing changed and refuses what is not a count', async ({ page, api }) => {
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const stockNow = sheet(page).getByLabel('Stock now')
    const save = sheet(page).getByRole('button', { name: 'Save', exact: true })
    await save.click()
    await expect(sheet(page).getByRole('status')).toHaveText('Stock unchanged')

    for (const value of ['', '-1', '2.5', 'abc']) {
      await stockNow.fill(value)
      await save.click()
      await expect(sheet(page).getByRole('alert')).toHaveText('Enter how many are in stock now')
      await expect(sheet(page).getByRole('status')).toHaveCount(0)
    }
    expect(loggedMovements(api)).toEqual([])
    await expect(sheet(page).getByTestId('article-stock')).toHaveText('5')
  })

  test('the starting stock of a new article and the history list stay as they were', async ({ page, api }) => {
    api.db.stock_movements.push({ id: 'mv0000000000001', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: 'Gatcha prize', created: '2026-10-14 10:00:00.000Z' })
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const history = sheet(page).getByRole('list')
    await expect(history.getByText('Sold')).toBeVisible()
    await expect(history.getByText(/Gatcha prize/)).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Close' }).click()

    await page.getByRole('button', { name: 'New article' }).click()
    await expect(sheet(page).getByLabel('Starting stock')).toBeVisible()
    await expect(sheet(page).getByLabel('Stock now')).toHaveCount(0)
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

test.describe('target stock', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', price: 0, stock: 5, low_stock_threshold: 5 }] })
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
  })

  test('the target stock is saved and drives the print board suggestion', async ({ page, api }) => {
    await expect(sheet(page).getByText('Empty = 2× low-stock threshold')).toBeVisible()
    await sheet(page).getByLabel('Target stock').fill('12')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(12)

    await gotoReady(page, '/print-board')
    const card = page.getByRole('region', { name: 'To print' }).getByRole('article', { name: 'Pikachu Keychain' })
    await expect(card).toContainText('5 left · target 12')
    await expect(card.getByRole('button', { name: 'Print 7' })).toBeVisible()
  })

  test('a target stock at or below the low-stock threshold is refused', async ({ page, api }) => {
    await sheet(page).getByLabel('Target stock').fill('5')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Target stock must be above the low-stock threshold')
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(0)

    await sheet(page).getByLabel('Target stock').fill('6')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(6)
  })

  test('an empty target stock saves 0 and a negative one is refused', async ({ page, api }) => {
    await sheet(page).getByLabel('Target stock').fill('-1')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Target stock must be a whole number of 0 or more')
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(0)

    await sheet(page).getByLabel('Target stock').fill('')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].target_stock).toBe(0)
  })
})
