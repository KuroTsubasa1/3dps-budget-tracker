import { test as base, expect } from '@playwright/test'

const API_HOST = 'https://pocket.lasseharm.space/**'
const isApiRequest = url => url.startsWith('https://pocket.lasseharm.space/')

export const sampleProducts = [
  { id: 'p1', collectionId: 'c1', name: 'Dragon Figure', description: 'Articulated dragon', price: 12.5, images: [] },
  { id: 'p2', collectionId: 'c1', name: 'Phone Stand', description: 'Adjustable desk stand', price: 4, images: [] },
  { id: 'p3', collectionId: 'c1', name: 'Cable Clip', description: 'Pack of cable organisers', price: 1.5, images: [] }
]

// Every test starts with the real backend unreachable, so nothing can hit
// production data. Tests opt in to specific responses via the `api` fixture.
// `auto` makes the block apply even to tests that don't ask for `api`.
export const test = base.extend({
  api: [async ({ page, context }, use) => {
    const posted = []
    const handled = new Set()
    const seen = []
    context.on('request', req => { if (isApiRequest(req.url())) seen.push(req) })
    await context.route(API_HOST, route => {
      handled.add(route.request())
      return route.abort()
    })

    await use({
      posted,
      async mockCatalog (items = sampleProducts) {
        await page.route('**/collections/budget_tracket_catalog/records*', route => {
          handled.add(route.request())
          return route.fulfill({ json: { items } })
        })
      },
      async mockTransactions ({ status = 200 } = {}) {
        await page.route('**/collections/budget_tracker_transactions/records*', route => {
          handled.add(route.request())
          if (route.request().method() === 'POST') posted.push(route.request().postDataJSON())
          return route.fulfill({ status, json: { id: `rec${posted.length}` } })
        })
      }
    })

    // Fail loudly if anything reached the real backend without being intercepted
    const leaked = seen.filter(req => !handled.has(req)).map(req => `${req.method()} ${req.url()}`)
    expect(leaked, 'requests escaped the API mocks').toEqual([])
  }, { auto: true }]
})

export { expect }
