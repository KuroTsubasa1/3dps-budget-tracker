import { test, expect, gotoReady } from './fixtures.js'
import { GATCHA, GATCHA_ARTICLES, card, checkout, openGatchaShop, prizeMovements, prizeSheet, stockOf } from './gatcha-data.js'

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

test.describe('picking gatcha prizes', () => {
  test('the picker opens after the checkout and each pick is a sale of one prize', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    const picker = prizeSheet(page)
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    // In stock, from the prize categories, by category and then by name; never the gatcha itself
    await expect(picker.getByRole('region', { name: 'Keychain' }).getByRole('button')).toHaveText([/^Pikachu Keychain\s*2 left$/, /^Zubat Keychain\s*1 left$/])
    await expect(picker.getByRole('region', { name: 'Mini Figure' }).getByRole('button')).toHaveText([/^Totoro Mini\s*3 left$/])
    await expect(picker.getByText('Evoli Keychain')).toHaveCount(0)
    await expect(picker.getByText('Glurak Figure')).toHaveCount(0)
    await expect(picker.getByRole('button', { name: /^GatchaPon/ })).toHaveCount(0)

    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 1 of 2')
    await expect(picker.getByRole('button', { name: /^Pikachu Keychain/ })).toContainText('1 left')
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Pikachu Keychain')
    await expect(picker.getByRole('button', { name: 'Undo Pikachu Keychain' })).toBeVisible()
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change, m.reason, m.note])).toEqual([['k1', -1, 'sale', 'Gatcha prize']])
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)

    await picker.getByRole('button', { name: /^Totoro Mini/ }).click()
    await expect(picker.getByRole('status')).toHaveText('All prizes picked')
    await expect(picker).toHaveCount(0)
    await expect(page.getByTestId('gatcha-banner')).toHaveCount(0)
    await expect.poll(() => prizeMovements(api).length).toBe(2)
    // The gatcha's own stock never moved
    expect(stockOf(api, 'g1')).toBe(7)
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('1 left')
  })

  test('the search filters the prizes by name', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    const picker = prizeSheet(page)
    await picker.getByRole('textbox', { name: 'Search prizes' }).fill('zu')
    await expect(picker.getByRole('button', { name: /left$/ })).toHaveText([/^Zubat Keychain/])
    await picker.getByRole('textbox', { name: 'Search prizes' }).fill('nothing')
    await expect(picker.getByText('No prizes match your search')).toBeVisible()
  })

  test('several gatchas list the union of their prize categories, and every pick counts', async ({ page, api }) => {
    await openGatchaShop(page, api, {
      articles: [
        ...GATCHA_ARTICLES,
        { id: 'g2', name: 'Coaster Gatcha', category: 'cat-gatcha', stock: 0, prize_categories: ['cat-coaster'] },
        { id: 'c1', name: 'Moon Coaster', category: 'cat-coaster', stock: 4 }
      ]
    })
    await checkout(page, { GatchaPon: 1, 'Coaster Gatcha': 1 })
    const picker = prizeSheet(page)
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await expect(picker.getByRole('region')).toHaveCount(3)
    await picker.getByRole('button', { name: /^Moon Coaster/ }).click()
    await picker.getByRole('button', { name: /^Moon Coaster/ }).click()
    await expect(picker.getByRole('status')).toHaveText('All prizes picked')
    await expect.poll(() => prizeMovements(api).map(m => m.article)).toEqual(['c1', 'c1'])
  })

  test('Later keeps the open prizes in a banner, Pick now reopens them, and a second checkout adds up', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(prizeSheet(page)).toHaveCount(0)
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')

    await checkout(page, { GatchaPon: 1 })
    await expect(prizeSheet(page)).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await prizeSheet(page).getByRole('button', { name: /^Zubat Keychain/ }).click()
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')

    // Kept on the device across a reload
    await page.reload()
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')
    await page.getByTestId('gatcha-banner').getByRole('button', { name: 'Pick now' }).click()
    await expect(prizeSheet(page)).toHaveAccessibleName('Gatcha prizes · 0 of 1')
  })

  test('undo before the pick synced drops it; after it synced it records a correction', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    const picker = prizeSheet(page)

    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect.poll(() => prizeMovements(api).length).toBe(1)
    await expect(picker.getByText('Waiting to sync')).toHaveCount(0)
    await picker.getByRole('button', { name: 'Undo Pikachu Keychain' }).click()
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await expect(picker.getByRole('button', { name: /^Pikachu Keychain/ })).toContainText('2 left')
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change, m.reason, m.note])).toEqual([
      ['k1', -1, 'sale', 'Gatcha prize'],
      ['k1', 1, 'correction', 'Gatcha prize undone']
    ])
    await expect.poll(() => stockOf(api, 'k1')).toBe(2)

    await context.setOffline(true)
    await picker.getByRole('button', { name: /^Zubat Keychain/ }).click()
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    await picker.getByRole('button', { name: 'Undo Zubat Keychain' }).click()
    await expect(picker.getByRole('region', { name: 'Picked' })).toHaveCount(0)
    await context.setOffline(false)
    await picker.getByRole('button', { name: /^Totoro Mini/ }).click()
    await expect.poll(() => prizeMovements(api).map(m => m.article)).toEqual(['k1', 'k1', 'm1'])
    expect(stockOf(api, 'k2')).toBe(1)
  })

  test('an offline checkout opens the picker, and its picks sync when the connection returns', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await context.setOffline(true)
    await checkout(page, { GatchaPon: 1, 'Totoro Mini': 1 })
    const picker = prizeSheet(page)
    await expect(picker).toHaveAccessibleName('Gatcha prizes · 0 of 1')
    // The checkout's own sale already counts in the stock the picker shows
    await expect(picker.getByRole('button', { name: /^Totoro Mini/ })).toContainText('2 left')
    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    expect(prizeMovements(api)).toEqual([])

    await context.setOffline(false)
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1]])
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0].items.map(line => line.article)).toEqual(['g1', 'm1'])
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)
    expect(stockOf(api, 'g1')).toBe(7)
  })

  test('a pick whose reply was lost is sent again once, and an undo meanwhile still balances it', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await expect.poll(() => api.posted.length).toBe(1)
    // The movement is stored, then recomputing the stock fails: the pick stays queued as tried
    api.fail('budget_tracket_catalog', 500)
    const picker = prizeSheet(page)
    await picker.getByRole('button', { name: /^Pikachu Keychain/ }).click()
    await expect.poll(() => prizeMovements(api).length).toBe(1)
    await expect(picker.getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    await picker.getByRole('button', { name: 'Undo Pikachu Keychain' }).click()

    api.fail('budget_tracket_catalog', 0)
    await context.setOffline(true)
    await context.setOffline(false)
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1], ['k1', 1]])
    await expect.poll(() => stockOf(api, 'k1')).toBe(2)
  })

  test('logging out clears the open prizes from the device', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(page.getByTestId('gatcha-banner')).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    await gotoReady(page, '/settings#api')
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL(url => url.pathname === '/login')
    expect(await page.evaluate(() => localStorage.getItem('akinai-gatcha-open'))).toBeNull()
  })
})

test.describe('visitors', () => {
  test.use({ owner: false })

  test('see no banner, even with prizes left on the device', async ({ page, api }) => {
    await page.addInitScript(() => localStorage.setItem('akinai-gatcha-open', JSON.stringify({ count: 2, categories: ['cat-keychain'] })))
    await openGatchaShop(page, api)
    await expect(page.getByRole('heading', { name: 'GatchaPon' })).toBeVisible()
    await expect(page.getByTestId('gatcha-banner')).toHaveCount(0)
  })
})

test.describe('prize sync and its bookkeeping', () => {
  const pickByName = (page, name) => prizeSheet(page).getByRole('button', { name: new RegExp(`^${name}`) }).click()
  const waiting = page => page.getByTestId('prize-waiting')

  test('a failed send is tried again when the tab comes back to the foreground', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await expect.poll(() => api.posted.length).toBe(1)
    api.failOnce('stock_movements', 500)
    const failed = page.waitForResponse(response => response.url().includes('stock_movements') && response.status() === 500)
    await pickByName(page, 'Pikachu Keychain')
    await failed
    await expect(prizeSheet(page).getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')
    expect(prizeMovements(api)).toEqual([])

    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1]])
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)
    await expect(waiting(page)).toHaveCount(0)
  })

  test('a failed send is tried again every minute while it waits', async ({ page, api }) => {
    await page.clock.install()
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await expect.poll(() => api.posted.length).toBe(1)
    api.failOnce('stock_movements', 500)
    const failed = page.waitForResponse(response => response.url().includes('stock_movements') && response.status() === 500)
    await pickByName(page, 'Pikachu Keychain')
    await failed
    await expect(prizeSheet(page).getByRole('region', { name: 'Picked' })).toContainText('Waiting to sync')

    await page.clock.runFor(61000)
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1]])
    await expect.poll(() => stockOf(api, 'k1')).toBe(1)
  })

  test('waiting prize changes show on the catalog, also after the round ended', async ({ page, api, context }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    await expect(waiting(page)).toHaveCount(0)
    await context.setOffline(true)
    await pickByName(page, 'Pikachu Keychain')
    await expect(waiting(page)).toHaveText('1 prize change waiting to sync')
    await pickByName(page, 'Totoro Mini')
    await expect(prizeSheet(page)).toHaveCount(0)
    await expect(page.getByTestId('gatcha-banner')).toHaveCount(0)
    await expect(waiting(page)).toHaveText('2 prize changes waiting to sync')
    await context.setOffline(false)
    await expect(waiting(page)).toHaveCount(0)
    await expect.poll(() => prizeMovements(api).length).toBe(2)
  })

  test('the catalog takes the stock the server answers after a send', async ({ page, api }) => {
    await openGatchaShop(page, api)
    // Someone else sold the keychain meanwhile: the server's stock is lower than the catalog shows
    api.db.stock_movements.push({ id: 'other0000000001', collectionName: 'stock_movements', article: 'k1', change: -1, reason: 'sale', note: '', created: '2999-01-01 00:00:00.000Z' })
    await checkout(page, { GatchaPon: 1 })
    await pickByName(page, 'Pikachu Keychain')
    await expect.poll(() => stockOf(api, 'k1')).toBe(0)
    await expect(page.locator('article', { hasText: 'Pikachu Keychain' })).toContainText('Out of stock')
  })

  test('two gatchas make a plural banner', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    await prizeSheet(page).getByRole('button', { name: 'Later' }).click()
    await expect(page.getByTestId('gatcha-banner')).toContainText('2 gatcha prizes to pick')
  })

  test('an undo of a pick queued behind one in flight drops it without a correction', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    api.delayNext('stock_movements', 1500)
    await pickByName(page, 'Pikachu Keychain')
    await pickByName(page, 'Zubat Keychain')
    await prizeSheet(page).getByRole('button', { name: 'Undo Zubat Keychain' }).click()
    await expect.poll(() => prizeMovements(api).length).toBe(1)
    await expect(waiting(page)).toHaveCount(0)
    await expect(prizeSheet(page).getByRole('region', { name: 'Picked' })).not.toContainText('Waiting to sync')
    expect(prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1]])
    expect(stockOf(api, 'k2')).toBe(1)
  })

  test('a pick made while another send is in flight is still sent', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 2 })
    api.delayNext('stock_movements', 1500)
    await pickByName(page, 'Pikachu Keychain')
    await pickByName(page, 'Totoro Mini')
    await expect.poll(() => prizeMovements(api).map(m => m.article).sort()).toEqual(['k1', 'm1'])
    await expect(waiting(page)).toHaveCount(0)
  })

  test('a new round after a finished one starts at zero picked', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await pickByName(page, 'Pikachu Keychain')
    await expect(prizeSheet(page)).toHaveCount(0)
    await checkout(page, { GatchaPon: 2 })
    await expect(prizeSheet(page)).toHaveAccessibleName('Gatcha prizes · 0 of 2')
    await expect(prizeSheet(page).getByRole('region', { name: 'Picked' })).toHaveCount(0)
  })

  test('logging out keeps a waiting prize change and sends it after the next login', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    await expect.poll(() => api.posted.length).toBe(1)
    api.fail('stock_movements', 500)
    await pickByName(page, 'Pikachu Keychain')
    await expect(waiting(page)).toHaveText('1 prize change waiting to sync')
    await gotoReady(page, '/settings#api')
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL(url => url.pathname === '/login')
    expect(await page.evaluate(() => localStorage.getItem('akinai-gatcha-outbox'))).not.toBeNull()
    expect(prizeMovements(api)).toEqual([])

    api.fail('stock_movements', 0)
    await page.getByLabel('Email').fill('owner@example.com')
    await page.getByLabel('Password').fill('correct-horse')
    await page.getByRole('button', { name: 'Log in' }).click()
    await page.waitForURL(url => url.pathname !== '/login')
    // Client-side navigation: the state the logout left in memory must still be sent, not only what storage holds
    await page.evaluate(() => window.useNuxtApp().$router.push('/catalog'))
    await expect.poll(() => prizeMovements(api).map(m => [m.article, m.change])).toEqual([['k1', -1]])
  })

  test('Clear All Local Data drops a waiting prize change', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    api.fail('stock_movements', 500)
    await pickByName(page, 'Pikachu Keychain')
    await expect(waiting(page)).toHaveCount(1)
    await gotoReady(page, '/settings#data')
    expect(await page.evaluate(() => localStorage.getItem('akinai-gatcha-outbox'))).not.toBeNull()
    await page.getByRole('button', { name: 'Clear All Local Data' }).click()
    await page.getByRole('button', { name: 'Delete All Data' }).click()
    await expect.poll(() => page.evaluate(() => localStorage.getItem('akinai-gatcha-outbox'))).toBeNull()
  })

  test('the picker keeps its live region mounted and announces the count', async ({ page, api }) => {
    await openGatchaShop(page, api)
    await checkout(page, { GatchaPon: 1 })
    const picker = prizeSheet(page)
    await expect(picker.getByRole('status')).toHaveCount(1)
    await expect(picker.getByRole('status')).toHaveText('')
    await expect(picker.locator('[aria-live="polite"]')).toHaveText('0 of 1 prizes picked')
    await pickByName(page, 'Pikachu Keychain')
    await expect(picker.getByRole('status')).toHaveText('All prizes picked')
  })
})
