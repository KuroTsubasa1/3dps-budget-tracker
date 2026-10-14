import { test, expect } from './fixtures.js'
import { GATCHA, card, checkout, openGatchaShop, stockOf } from './gatcha-data.js'

const sheet = page => page.getByRole('dialog')

test.describe('the gatcha article', () => {
  test('Prize categories lists every category, and ticking one makes the article a gatcha', async ({ page, api }) => {
    await openGatchaShop(page, api, { articles: [{ ...GATCHA, prize_categories: [] }] })
    await expect(page.locator('article', { hasText: 'GatchaPon' })).toContainText('7 left')
    await page.getByRole('button', { name: 'Manage' }).click()
    await card(page, 'GatchaPon').click()
    const prizes = sheet(page).getByRole('group', { name: 'Prize categories' })
    await expect(prizes.getByRole('checkbox')).toHaveCount(5)
    await prizes.getByLabel('Keychain').check()
    await prizes.getByLabel('Mini Figure').check()
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()

    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].prize_categories).toEqual(['cat-keychain', 'cat-mini'])
    await expect(page.locator('article', { hasText: 'GatchaPon' })).toContainText('Gatcha')
    await expect(page.locator('article', { hasText: 'GatchaPon' })).not.toContainText('7 left')

    // Unticking all of them makes it an ordinary article again
    await card(page, 'GatchaPon').click()
    await expect(prizes.getByLabel('Keychain')).toBeChecked()
    await prizes.getByLabel('Keychain').uncheck()
    await prizes.getByLabel('Mini Figure').uncheck()
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.budget_tracket_catalog[0].prize_categories).toEqual([])
    await expect(page.locator('article', { hasText: 'GatchaPon' })).toContainText('7 left')
  })

  test('a gatcha sells at its category price with a sale line and no stock movement', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2, 'Pikachu Keychain': 1 })

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(12)
    expect(api.posted[0].items.map(line => [line.article, line.quantity, line.lineTotal])).toEqual([
      ['g1', 2, 8],
      ['k1', 1, 4]
    ])
    await expect.poll(() => api.db.stock_movements.filter(movement => movement.id.length === 15).map(movement => movement.article)).toEqual(['k1'])
    expect(stockOf(api, 'g1')).toBe(7)
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)
  })

  test('a deal on the gatcha category applies as for any article', async ({ page, api }) => {
    await openGatchaShop(page, api, {
      deals: [{ id: 'deal-gatcha', name: 'GatchaPon 2 for 7', type: 'bundle', categories: ['cat-gatcha'], min_qty: 2, price: 7 }]
    })
    await checkout(page, { GatchaPon: 2 })
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].amount).toBe(7)
    expect(api.posted[0].items[0]).toMatchObject({ article: 'g1', quantity: 2, lineTotal: 8, discount: 1, dealName: 'GatchaPon 2 for 7' })
  })

  test('the cart does not warn about the gatcha\'s own stock', async ({ page, api }) => {
    await openGatchaShop(page, api, { articles: [{ ...GATCHA, stock: 0 }] })
    for (let i = 0; i < 2; i++) await card(page, 'GatchaPon').click()
    if (page.viewportSize().width < 1024) await page.getByRole('button', { name: /View cart/ }).click()
    await expect(page.getByText(/in stock/)).toHaveCount(0)
  })
})
