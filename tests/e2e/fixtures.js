import { test as base, expect } from '@playwright/test'
import { createFakePocketBase, FAKE_TOKEN, OWNER } from './fake-pocketbase.js'

const API_HOST = 'https://pocket.lasseharm.space/**'
const isApiRequest = url => url.startsWith('https://pocket.lasseharm.space/')

export const SAMPLE_CATEGORIES = [
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 0 },
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 1 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 2 }
]

export const sampleProducts = [
  { id: 'p1', name: 'Dragon Figure', description: 'Articulated dragon', price: 12.5 },
  { id: 'p2', name: 'Phone Stand', description: 'Adjustable desk stand', price: 4 },
  { id: 'p3', name: 'Cable Clip', description: 'Pack of cable organisers', price: 1.5 }
]

// Every test starts with the backend unreachable (requests abort), so nothing can hit
// production data. Calling seed/mockCatalog/mockTransactions/enable switches on an
// in-memory PocketBase for that test. `auto` applies the block to every test.
export const test = base.extend({
  // Against `nuxt dev` the devtools launcher floats over the bottom tab bar and swallows taps
  hideDevtools: [async ({ context }, use) => {
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const style = document.createElement('style')
        style.textContent = '#nuxt-devtools-container { display: none !important; }'
        document.head.appendChild(style)
      })
    })
    await use()
  }, { auto: true }],

  // Logged in as the owner unless a test calls test.use({ owner: false })
  owner: [true, { option: true }],
  ownerSession: [async ({ context, owner }, use) => {
    if (owner) {
      // Seed once per tab so a test that logs out stays logged out across reloads
      await context.addInitScript(({ token, model }) => {
        if (sessionStorage.getItem('owner-seeded')) return
        localStorage.setItem('pocketbase_auth', JSON.stringify({ token, model }))
        sessionStorage.setItem('owner-seeded', '1')
      }, { token: FAKE_TOKEN, model: OWNER })
    }
    await use()
  }, { auto: true }],

  api: [async ({ context }, use) => {
    const fake = createFakePocketBase()
    const handled = new Set()
    const seen = []
    context.on('request', req => { if (isApiRequest(req.url())) seen.push(req) })
    await context.route(API_HOST, (route) => {
      handled.add(route.request())
      return fake.state.enabled ? fake.handle(route) : route.abort()
    })

    const api = {
      db: fake.db,
      requests: fake.requests,
      get posted () { return fake.db.budget_tracker_transactions },
      enable () { fake.state.enabled = true },
      seed ({ categories = SAMPLE_CATEGORIES, articles = [], deals = [], commissions = [], printJobs = [], conventions = [] } = {}) {
        api.enable()
        fake.db.categories.push(...structuredClone(categories))
        fake.db.deals.push(...structuredClone(deals))
        fake.db.commissions.push(...structuredClone(commissions))
        fake.db.print_jobs.push(...structuredClone(printJobs))
        fake.db.conventions.push(...structuredClone(conventions))
        fake.db.budget_tracket_catalog.push(...articles.map(article => ({
          collectionId: 'articles0000001',
          active: true,
          stock: 10,
          low_stock_threshold: 2,
          target_stock: 0,
          images: [],
          description: '',
          price: 0,
          category: 'cat-figure',
          ...article
        })))
        // Stock is derived from the movement log, so seeded stock needs a real opening movement
        for (const article of fake.db.budget_tracket_catalog) {
          if (article.stock > 0 && !fake.db.stock_movements.some(m => m.id === `open-${article.id}`)) {
            fake.db.stock_movements.push({
              id: `open-${article.id}`,
              collectionName: 'stock_movements',
              article: article.id,
              change: article.stock,
              reason: 'correction',
              note: 'opening stock',
              created: '2020-01-01 00:00:00.000Z'
            })
          }
        }
      },
      async mockCatalog (items = sampleProducts) { api.seed({ articles: items }) },
      async mockTransactions ({ status = 200 } = {}) {
        api.enable()
        if (status !== 200) fake.failures.budget_tracker_transactions = status
      },
      // The fake answers 404 for a collection that is gone, like a deploy before the migration
      dropCollection (name) { delete fake.db[name] },
      fail (collection, status, data) { fake.failures[collection] = data ? { status, data } : status },
      // Only the next write to the collection fails; later ones succeed
      failOnce (collection, status) { fake.failures[collection] = { status, once: true } },
      // Every read of the collection answers `status` (a collection whose listRule is still locked)
      failReads (collection, status) { fake.readFailures[collection] = status },
      // Write replies for the collection come back without `items` (a server that is not migrated yet)
      stripItems (collection) { fake.stripItems.add(collection) },
      // The next write to the collection succeeds but answers only after `ms`
      delayNext (collection, ms) { fake.delays[collection] = ms }
    }
    await use(api)

    // Fail loudly if anything reached the real backend without being intercepted
    const leaked = seen.filter(req => !handled.has(req)).map(req => `${req.method()} ${req.url()}`)
    expect(leaked, 'requests escaped the API mocks').toEqual([])
  }, { auto: true }]
})

// Layouts switch (sheet vs inline, tab bar vs rail) once the client has mounted;
// app.vue marks <html data-hydrated> in its onMounted, which runs after every child
export async function gotoReady (page, path) {
  await page.goto(path)
  await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
  // NuxtLink prefetches route modules once idle; against `nuxt dev` a prefetch that lands after a
  // test goes offline poisons that module for the rest of the page's life
  await page.waitForLoadState('networkidle')
}

// Below lg the add-transaction form lives in a bottom sheet behind the floating + button
export async function openTransactionForm (page) {
  if (page.viewportSize().width < 1024) {
    await page.getByRole('button', { name: 'Add transaction', exact: true }).click()
  }
}

export { expect, FAKE_TOKEN }
