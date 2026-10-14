import { test, expect, gotoReady } from './fixtures.js'

// Variant classes must reach the stylesheet: Tailwind drops classes it cannot find written out in the code
const backgroundOf = locator => locator.evaluate(element => getComputedStyle(element).backgroundColor)

test.describe('button styles', () => {
  test.use({ owner: false })

  test('a primary button is filled with the accent colour', async ({ page }) => {
    await gotoReady(page, '/login')
    await page.evaluate(() => document.documentElement.classList.remove('dark'))
    expect(await backgroundOf(page.getByRole('button', { name: 'Log in' }))).toBe('rgb(37, 99, 235)')
  })

  test('every button variant has its own style rule', async ({ page }) => {
    await gotoReady(page, '/login')
    const missing = await page.evaluate(() => {
      const selectors = new Set()
      for (const sheet of document.styleSheets) {
        let rules
        try { rules = sheet.cssRules } catch { continue }
        const walk = list => { for (const rule of list) { if (rule.selectorText) selectors.add(rule.selectorText); if (rule.cssRules) walk(rule.cssRules) } }
        walk(rules)
      }
      const all = [...selectors].join(' ')
      return ['btn-primary', 'btn-secondary', 'btn-ghost', 'btn-danger', 'btn-link', 'btn-danger-ghost', 'btn-lg']
        .filter(name => !new RegExp(`\\.${name}(?![\\w-])`).test(all))
    })
    expect(missing).toEqual([])
  })
})
