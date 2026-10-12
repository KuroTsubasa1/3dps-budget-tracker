import { test, expect, gotoReady } from './fixtures.js'

const PAGES = [
  '/',
  '/catalog',
  '/business-card',
  '/reports',
  '/settings',
  '/settings#account',
  '/settings#api',
  '/settings#display',
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

  for (const path of PAGES) {
    test(`${path} tap targets are at least 44px`, async ({ page, api }) => {
      await api.mockCatalog()
      await gotoReady(page, path)
      await page.waitForLoadState('networkidle')

      // Controls inside a <label> (switches) use the whole label row as their target
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('a[href], button, input, select, textarea')]
          .filter(el => !el.closest('label'))
          .map(el => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          .filter(({ box }) => box.width < 44 || box.height < 44)
          .map(({ el, box }) => `${el.tagName.toLowerCase()} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}" ${Math.round(box.width)}×${Math.round(box.height)}`)
      )
      expect(small).toEqual([])
    })
  }
})
