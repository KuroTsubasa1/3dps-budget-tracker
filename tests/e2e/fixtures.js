import { test as base, expect } from '@playwright/test'
import { createFakePocketBase, FAKE_TOKEN, OWNER } from './fake-pocketbase.js'

const API_HOST = 'https://pocket.lasseharm.space/**'
const isApiRequest = url => url.startsWith('https://pocket.lasseharm.space/')
// Akinai's own server routes for push and the calendar link. The tests never reach the real ones
// (they would ask PocketBase): the `api` fixture answers them from `api.notifier`.
const NOTIFIER_ROUTES = /\/api\/(push\/(status|test)|calendar\/link)$/
// The card routes, answered from `api.card`: the tests never reach SumUp
const CARD_ROUTES = /\/api\/card\/(terminal|pair|unpair|charge|cancel|refresh)$/
// A real P-256 public key (made for the tests, its private half thrown away): subscribe() needs a valid one
export const TEST_VAPID_KEY = 'BGHxbo5dwKMN5gGwSeCpYcjC_YxtaoR14Ex7zi3-5eL0L3yRPC3xJTnR-dV6QBszCl30NysrCA9zjmyfeZjmXhQ'

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
      seed ({ categories = SAMPLE_CATEGORIES, articles = [], deals = [], commissions = [], printJobs = [], conventions = [], pushSubscriptions = [] } = {}) {
        api.enable()
        fake.db.categories.push(...structuredClone(categories))
        fake.db.deals.push(...structuredClone(deals))
        fake.db.commissions.push(...structuredClone(commissions))
        fake.db.print_jobs.push(...structuredClone(printJobs))
        fake.db.conventions.push(...structuredClone(conventions))
        fake.db.push_subscriptions.push(...structuredClone(pushSubscriptions))
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
          prize_categories: [],
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
      // The collection lacks these fields (not migrated yet): writes drop them, reads and replies leave them out
      dropFields (collection, fields) { fake.missingFields[collection] = fields },
      // The next write to the collection succeeds but answers only after `ms`
      delayNext (collection, ms) { fake.delays[collection] = ms },
      // What the server's push routes answer: unconfigured by default, like `nuxt dev` without the env file.
      // `tests` collects the bodies sent to /api/push/test; `testStatus` is its answer.
      // `devices` is the server's count of devices with notifications on (null: it could not tell), and
      // `lastProblem` the reminder job's last delivery problem.
      notifier: { configured: false, feed: false, publicKey: TEST_VAPID_KEY, lastRun: null, lastError: null, lastProblem: null, devices: null, secret: 'feedsecret', testStatus: 200, tests: [] },
      // What the server's card routes answer: unconfigured by default. `charges`, `pairs` and `cancels` collect
      // the bodies sent; a charge creates its card_payments record in the fake PocketBase, as the server would.
      // A status other than 200 answers with `message`, like the server's errors.
      card: {
        configured: false,
        paired: false,
        reader: { id: 'rdr_3MSAFM23CK82VSTT4BN6RWSQ65', name: 'Akinai', status: 'online' },
        pairStatus: 200,
        chargeStatus: 200,
        cancelStatus: 200,
        refreshStatus: 200,
        message: '',
        cancelResult: 'cancelled',
        charges: [],
        pairs: [],
        cancels: [],
        unpairs: 0,
        refreshes: 0,
        // What SumUp would answer when the server refreshes a payment: (payment) => changes it, or null
        onRefresh: null
      },
      // A configured server with a paired Solo
      pairTerminal () {
        api.card.configured = true
        api.card.paired = true
      },
      // SumUp's result for the latest card payment, as the callback or the poll would record it
      settleCard (status, sumupTransaction = '') {
        const payment = fake.db.card_payments.at(-1)
        payment.status = status
        if (sumupTransaction) payment.sumup_transaction = sumupTransaction
      }
    }

    await context.route(NOTIFIER_ROUTES, (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const state = api.notifier
      const json = (status, body) => route.fulfill({ status, json: body })
      if (path === '/api/push/status' && !state.configured) return json(200, { configured: false, feed: state.feed })
      if (request.headers().authorization !== FAKE_TOKEN) return json(401, { statusCode: 401, message: 'Log in again' })
      if (path === '/api/push/status') {
        return json(200, { configured: true, feed: state.feed, publicKey: state.publicKey, lastRun: state.lastRun, lastError: state.lastError, lastProblem: state.lastProblem, devices: state.devices })
      }
      if (path === '/api/calendar/link') {
        return state.feed ? json(200, { path: `/api/calendar/${state.secret}.ics` }) : json(503, { statusCode: 503, message: "The calendar feed isn't configured on the server" })
      }
      state.tests.push(request.postDataJSON())
      return json(state.testStatus, state.testStatus === 200 ? { sent: true } : { statusCode: state.testStatus, message: `Push server answered ${state.testStatus}` })
    })
    await context.route(CARD_ROUTES, (route) => {
      const request = route.request()
      const path = new URL(request.url()).pathname
      const state = api.card
      const json = (status, body) => route.fulfill({ status, json: body })
      const failed = status => json(status, { statusCode: status, message: state.message })
      if (path === '/api/card/terminal' && !state.configured) return json(200, { configured: false, paired: false, reader: null })
      if (!state.configured) return json(503, { statusCode: 503, message: "Card payments aren't configured on the server" })
      if (request.headers().authorization !== FAKE_TOKEN) return json(401, { statusCode: 401, message: 'Log in again' })
      const body = request.postDataJSON() ?? {}
      if (path === '/api/card/terminal') return json(200, { configured: true, paired: state.paired, reader: state.paired ? state.reader : null })
      if (path === '/api/card/pair') {
        state.pairs.push(body)
        if (state.pairStatus !== 200) return failed(state.pairStatus)
        state.paired = true
        return json(200, { paired: true, reader: { ...state.reader, status: 'unknown' } })
      }
      if (path === '/api/card/unpair') {
        state.unpairs++
        state.paired = false
        return json(200, { paired: false, reader: null })
      }
      if (path === '/api/card/charge') {
        state.charges.push(body)
        if (state.chargeStatus !== 200) return failed(state.chargeStatus)
        const id = `pay${String(state.charges.length).padStart(12, '0')}`
        fake.db.card_payments.push({
          id,
          collectionName: 'card_payments',
          amount: body.amount,
          description: 'Akinai sale',
          source: body.source,
          cart: body.cart,
          status: 'pending',
          sumup_checkout: '',
          sumup_transaction: '',
          booked_transaction: '',
          callback_token: '0'.repeat(64),
          created: new Date().toISOString().replace('T', ' ')
        })
        return json(200, { id })
      }
      if (path === '/api/card/refresh') {
        // The server would ask SumUp here; the fake answers what api.settleCard() or onRefresh recorded
        state.refreshes++
        if (state.refreshStatus !== 200) return failed(state.refreshStatus)
        const found = fake.db.card_payments.find(item => item.id === body.id)
        if (!found) return json(404, { statusCode: 404, message: 'Unknown payment' })
        if (found.status === 'pending' && state.onRefresh) state.onRefresh(found)
        const { callback_token: secret, ...visible } = found
        return json(200, { payment: visible })
      }
      state.cancels.push(body.id)
      if (state.cancelStatus !== 200) return failed(state.cancelStatus)
      const payment = fake.db.card_payments.find(item => item.id === body.id)
      if (payment?.status === 'pending') payment.status = state.cancelResult
      return json(200, { status: payment?.status ?? 'cancelled' })
    })
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
