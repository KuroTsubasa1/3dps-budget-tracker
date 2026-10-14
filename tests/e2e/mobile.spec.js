import { test, expect, gotoReady } from './fixtures.js'
import { openReports } from './report-data.js'
import { CONVENTIONS, convention, openCalendar } from './calendar-data.js'
import { GATCHA, GATCHA_CATEGORIES, checkout, prizeSheet } from './gatcha-data.js'

const PAGES = [
  '/',
  '/catalog',
  '/business-card',
  '/reports',
  '/commissions',
  '/print-board',
  '/calendar',
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
  // The 44px check measures the sheet: without motion it is already settled
  test.use({ reducedMotion: 'reduce' })

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
    await gotoReady(page, '/catalog')
    await page.locator('h3', { hasText: longProducts[0].name }).click()
    await page.locator('h3', { hasText: 'Phone Stand' }).click()
    await page.getByRole('button', { name: /View cart/ }).click()
    await page.getByRole('button', { name: 'Commission', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
    const dialog = page.getByRole('dialog', { name: 'New commission' })
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

  for (const dark of [false, true]) {
    test(`every report tab fits at 375px with 44px targets${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
      await page.addInitScript((dark) => {
        localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
      }, dark)
      await openReports(page, api, {
        before (api) {
          // Worst case: an unbroken article name and a seven-digit sale
          api.db.budget_tracker_transactions.push({
            id: 'tx0000000000009',
            collectionName: 'budget_tracker_transactions',
            description: 'Big order',
            amount: 1234567.89,
            notes: '',
            date: '2026-10-13',
            created: '2026-10-13 10:00:01.000Z',
            updated: '2026-10-13 10:00:01.000Z',
            sold_at: '2026-10-13 10:00:00.000Z',
            items: [{ article: 'p1', name: longTransaction.description, category: '', categoryName: '', quantity: 1, unitPrice: 1234567.89, lineTotal: 1234567.89, discount: 0, deal: '', dealName: '' }]
          })
        }
      })
      const tabs = page.getByRole('group', { name: 'Report' })
      const shown = {
        Sales: page.getByRole('heading', { name: 'Top articles', exact: true }),
        'Market day': page.getByRole('combobox', { name: 'Market day' }),
        Money: page.getByTestId('money-income'),
        Stock: page.getByTestId('stock-value')
      }
      for (const [name, content] of Object.entries(shown)) {
        await tabs.getByRole('button', { name, exact: true }).click()
        await expect(content).toBeVisible()
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth, name).toBeLessThanOrEqual(page.viewportSize().width)
        expect(await smallTargets(page), name).toEqual([])
      }
    })
  }

  for (const dark of [false, true]) {
    test(`the gatcha prize picker and its banner fit at 375px with long names${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
      await page.addInitScript((dark) => {
        localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
      }, dark)
      const long = 'Supercalifragilisticexpialidocious-Keychain-With-A-Very-Long-Unbroken-Name'
      api.seed({
        categories: GATCHA_CATEGORIES,
        articles: [GATCHA, { id: 'k1', name: long, category: 'cat-keychain', stock: 1234567 }]
      })
      await gotoReady(page, '/catalog')
      const fits = async (label) => {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth, label).toBeLessThanOrEqual(page.viewportSize().width)
        expect(await smallTargets(page), label).toEqual([])
      }
      await checkout(page, { GatchaPon: 2 })
      const picker = prizeSheet(page)
      await picker.getByRole('button', { name: new RegExp(`^${long}`) }).click()
      await expect(picker.getByRole('button', { name: `Undo ${long}` })).toBeVisible()
      await fits('picker')
      expect(await picker.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
      await picker.getByRole('button', { name: 'Later' }).click()
      await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')
      await fits('banner')
    })
  }
  for (const dark of [false, true]) {
    test(`the calendar fits at 375px with long names, in Upcoming, Month and the sheet${dark ? ' (dark)' : ''}`, async ({ page, api }) => {
      await page.addInitScript((dark) => {
        localStorage.setItem('budget-tracker-settings', JSON.stringify({ display: { darkMode: dark } }))
      }, dark)
      const long = 'Supercalifragilisticexpialidocious-International-Convention-Of-Very-Long-Names'
      await openCalendar(page, api, {
        conventions: [
          ...CONVENTIONS,
          convention('long00000000001', {
            name: long,
            city: long,
            venue: long,
            hall: long,
            table: 'B12',
            status: 'booked',
            starts_on: '2026-10-30 00:00:00.000Z',
            ends_on: '2026-11-01 00:00:00.000Z',
            stand_fee: 1234567.89,
            reminders: [{ id: 'custom-1', kind: 'custom', at: '2026-10-20T07:00:00.000Z', text: long, auto: false }]
          })
        ]
      })
      const fits = async (label) => {
        const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth)
        expect(scrollWidth, label).toBeLessThanOrEqual(page.viewportSize().width)
        expect(await smallTargets(page), label).toEqual([])
      }
      await page.getByRole('button', { name: 'Past (2)' }).click()
      await fits('Upcoming')
      await page.getByRole('radiogroup', { name: 'View' }).getByRole('radio', { name: 'Month' }).click()
      await page.getByRole('button', { name: `Fri 30 Oct: ${long}` }).click()
      await fits('Month')
      await page.getByTestId('day-entries').getByRole('button').first().click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByRole('button', { name: 'Mark fee paid' })).toBeVisible()
      await fits('sheet')
      expect(await dialog.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false)
    })
  }
})
