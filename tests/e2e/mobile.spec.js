import { test, expect, gotoReady } from './fixtures.js'

const PAGES = [
  '/',
  '/catalog',
  '/business-card',
  '/reports',
  '/commissions',
  '/print-board',
  '/login',
  '/settings',
  '/settings#account',
  '/settings#api',
  '/settings#display',
  '/settings#categories',
  '/settings#deals',
  '/settings#notifications',
  '/settings#data'
]

// Worst-case content: unbroken words, seven-digit amounts, long notes
const longTransaction = {
  id: 1,
  description: 'Supercalifragilisticexpialidocious-commission-for-a-very-large-custom-print-job',
  amount: 1234567.89,
  date: '2026-10-12',
  notes: 'Delivered in three batches; '.repeat(6)
}
const longProducts = [
  { id: 'p1', collectionId: 'c1', name: 'Extremely Long Articulated Dragon Figure With Movable Wings And Tail', description: 'A '.repeat(150), price: 123456.78, images: [] },
  { id: 'p2', collectionId: 'c1', name: 'Phone Stand', description: 'Adjustable desk stand', price: 4, images: [] },
  { id: 'p3', collectionId: 'c1', name: 'Cable Clip', description: 'Pack of cable organisers', price: 1.5, images: [] }
]

const seed = async (page, { dark }) => {
  await page.addInitScript(({ dark, transaction }) => {
    localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
    localStorage.setItem('budget-tracker-transactions', JSON.stringify([transaction]))
  }, { dark, transaction: longTransaction })
}

// Controls inside a <label> (switches) use the whole label row as their target
const smallTargets = page => page.evaluate(() =>
  [...document.querySelectorAll('a[href], button, input, select, textarea')]
    .filter(el => !el.closest('label'))
    .map(el => ({ el, box: el.getBoundingClientRect() }))
    .filter(({ box }) => box.width > 0 && box.height > 0)
    .filter(({ box }) => box.width < 44 || box.height < 44)
    .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`)
)

test.describe('phone layout sweep', () => {
  test.beforeEach(async ({ page, isMobile }) => {
    test.skip(!isMobile, 'Runs on the mobile project')
    await page.setViewportSize({ width: 375, height: 812 })
  })

  for (const dark of [false, true]) {
    for (const path of PAGES) {
      test(`${path} has no horizontal scroll at 375px${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
        await api.mockCatalog(longProducts)
        await seed(page, { dark })
        await gotoReady(page, path)
        await page.waitForLoadState('networkidle')

        // Compare with the emulated device width: mobile Chrome widens innerWidth to fit oversized content
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
      })
    }
  }

  test('segmented options show their full label at 375px', async ({ page }) => {
    await gotoReady(page, '/settings#display')
    const clipped = await page.getByRole('radio').evaluateAll(radios =>
      radios.filter(radio => radio.scrollWidth > radio.clientWidth).map(radio => radio.textContent.trim())
    )
    expect(clipped).toEqual([])
  })

  for (const path of PAGES) {
    test(`${path} tap targets are at least 44px`, async ({ page, api }) => {
      await api.mockCatalog()
      await gotoReady(page, path)
      await page.waitForLoadState('networkidle')

      const small = await smallTargets(page)
      expect(small).toEqual([])
    })
  }

  test('the article editor fits at 375px', async ({ page, api }) => {
    await api.mockCatalog(longProducts)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3').first().click()
    await expect(page.getByRole('dialog')).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    const clipped = await page.getByRole('dialog').evaluate(dialog => dialog.scrollWidth > dialog.clientWidth)
    expect(clipped).toBe(false)
  })

  test('the print board fits at 375px with long cards', async ({ page, api }) => {
    api.seed({
      articles: [{ ...longProducts[0], stock: 1, low_stock_threshold: 5 }],
      commissions: [{
        id: 'c1',
        customer_name: 'Supercalifragilisticexpialidocious-customer-name',
        customer_email: 'a@example.com',
        fulfilment: 'pickup',
        address: '',
        article: 'p1',
        quantity: 12,
        agreed_price: 30,
        notes: 'Unbroken-colour-notes-'.repeat(8),
        status: 'open',
        created: '2026-10-01 10:00:00.000Z',
        delivered_at: '',
        cancelled_at: '',
        anonymised_at: '',
        ready_at: ''
      }]
    })
    await gotoReady(page, '/print-board')
    await expect(page.getByRole('button', { name: 'Print 9' })).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    expect(await smallTargets(page)).toEqual([])
  })

  test('the commission form fits at 375px with long lines', async ({ page, api }) => {
    api.seed({ articles: longProducts })
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByLabel('Add article').selectOption({ label: longProducts[0].name })
    await dialog.getByLabel('Add article').selectOption({ label: 'Phone Stand' })
    await expect(dialog.getByRole('group', { name: `Quantity of ${longProducts[0].name}` })).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
    expect(await smallTargets(page)).toEqual([])
  })

  test('the More sheet fits at 375px with 44px targets', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('button', { name: 'More', exact: true }).click()
    await expect(page.getByRole('dialog', { name: 'More' })).toBeVisible()
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize().width)
    expect(await smallTargets(page)).toEqual([])
  })
})
