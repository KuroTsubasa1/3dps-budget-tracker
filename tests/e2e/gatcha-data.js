// A shop with a gatcha: GatchaPon (category GatchaPon, 4 €) whose prizes come from Keychain and Mini Figure
import { SAMPLE_CATEGORIES, gotoReady } from './fixtures.js'

export const GATCHA_CATEGORIES = [
  ...SAMPLE_CATEGORIES,
  { id: 'cat-gatcha', name: 'GatchaPon', base_price: 4, sort_order: 3 },
  { id: 'cat-mini', name: 'Mini Figure', base_price: 8, sort_order: 4 }
]

export const GATCHA = { id: 'g1', name: 'GatchaPon', category: 'cat-gatcha', stock: 7, prize_categories: ['cat-keychain', 'cat-mini'] }
export const GATCHA_ARTICLES = [
  GATCHA,
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2 },
  { id: 'k2', name: 'Zubat Keychain', category: 'cat-keychain', stock: 1 },
  { id: 'k3', name: 'Evoli Keychain', category: 'cat-keychain', stock: 0 },
  { id: 'm1', name: 'Totoro Mini', category: 'cat-mini', stock: 3 },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure', stock: 5 }
]

export const card = (page, name) => page.locator('h3', { hasText: name })
export const prizeSheet = page => page.getByRole('dialog', { name: /^Gatcha prizes/ })
export const prizeMovements = api => api.db.stock_movements.filter(movement => /^Gatcha prize/.test(movement.note))
export const stockOf = (api, id) => api.db.budget_tracket_catalog.find(article => article.id === id).stock

export async function openGatchaShop (page, api, { articles = GATCHA_ARTICLES, deals = [] } = {}) {
  api.seed({ categories: GATCHA_CATEGORIES, articles, deals })
  await gotoReady(page, '/catalog')
}

// Adds each article the given number of times and checks out (through the cart sheet on phones)
export async function checkout (page, cart) {
  for (const [name, times] of Object.entries(cart)) {
    for (let i = 0; i < times; i++) await card(page, name).click()
  }
  if (page.viewportSize().width < 1024) await page.getByRole('button', { name: /View cart/ }).click()
  await page.getByRole('button', { name: 'Add to Balance' }).click()
}
