import { test, expect, gotoReady } from './fixtures.js'

// Booking approved card payments (useCardPayments) against the faked routes. Home and the catalog book them
// when they open; what no screen can trigger (a throwing watch callback, two starts at the same moment) is
// started from the loaded app's module.
const PAYMENT_ID = 'pay000000000001'
const CART = { description: 'Card sale', amount: 12, date: '2026-10-16', items: [], sold_at: '2026-10-16T10:00:00.000Z', stockMovements: [], prizes: { count: 1, categories: ['cat-figure'] } }

const approved = (extra = {}) => ({
  id: PAYMENT_ID,
  collectionName: 'card_payments',
  amount: 12,
  source: 'cart',
  status: 'approved',
  cart: CART,
  sumup_transaction: 'txn1',
  booked_transaction: '',
  callback_token: '0'.repeat(64),
  created: '2026-10-16 10:00:00.000Z',
  ...extra
})

const posts = api => api.requests.filter(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records') && request.body.id === PAYMENT_ID)
const openPrizes = page => page.evaluate(() => JSON.parse(localStorage.getItem('akinai-gatcha-open') || '{"count":0}').count)

test.describe('Booking approved card payments', () => {
  test('a cached history entry with the payment id does not stop the booking', async ({ page, api }) => {
    api.enable()
    api.pairTerminal()
    api.db.card_payments.push(approved())
    await page.addInitScript((id) => {
      localStorage.setItem('budget-tracker-transactions', JSON.stringify([{ id: 1, recordId: id, description: 'Card sale', amount: 12, date: '2026-10-16', notes: '' }]))
    }, PAYMENT_ID)
    // The app's first list read is lost, so the cached history stays as it was (a reload mid-booking)
    api.failReads('budget_tracker_transactions', 'drop')
    await gotoReady(page, '/')
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe(PAYMENT_ID)
    expect(posts(api)).toHaveLength(1)
    // The owner's mark never sends the status
    const marks = api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/card_payments/'))
    expect(marks.every(request => !('status' in request.body))).toBe(true)
  })

  test('the device that charged gets the prizes, another device books the sale without them', async ({ page, api }) => {
    api.enable()
    api.pairTerminal()
    api.db.card_payments.push(approved())
    await gotoReady(page, '/catalog')
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe(PAYMENT_ID)
    expect(posts(api)).toHaveLength(1)
    expect(await openPrizes(page)).toBe(0)
    await expect(page.getByTestId('gatcha-banner')).toHaveCount(0)
  })

  test('the charging device books its prizes once and forgets the payment', async ({ page, api }) => {
    api.enable()
    api.pairTerminal()
    api.db.card_payments.push(approved())
    await page.addInitScript((id) => {
      if (!sessionStorage.getItem('charged-seeded')) {
        localStorage.setItem('akinai-card-charged', JSON.stringify([id]))
        sessionStorage.setItem('charged-seeded', '1')
      }
    }, PAYMENT_ID)
    await gotoReady(page, '/catalog')
    await expect(page.getByTestId('gatcha-banner')).toContainText('1 gatcha prize to pick')
    expect(posts(api)).toHaveLength(1)
    expect(await openPrizes(page)).toBe(1)
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('akinai-card-charged') || '[]'))).toEqual([])
  })

  test('a throwing watch callback does not stop the watch', async ({ page, api }) => {
    api.enable()
    api.pairTerminal()
    api.db.card_payments.push(approved({ status: 'pending', booked_transaction: '' }))
    await gotoReady(page, '/settings#card')
    const calls = await page.evaluate(async (id) => {
      const module = await import(location.origin + '/_nuxt/composables/useCardPayments.js')
      let count = 0
      const stop = module.useCardPayments().watch(id, () => { count++; throw new Error('boom') })
      await new Promise(resolve => setTimeout(resolve, 4500))
      stop()
      return count
    }, PAYMENT_ID)
    expect(calls).toBeGreaterThan(1)
  })

  test('the sheet\'s booking and a start at the same moment post the sale once', async ({ page, api }) => {
    api.enable()
    api.pairTerminal()
    await gotoReady(page, '/settings#card')
    api.db.card_payments.push(approved())
    await page.evaluate(async (payment) => {
      const module = await import(location.origin + '/_nuxt/composables/useCardPayments.js')
      const cards = module.useCardPayments()
      await Promise.all([cards.bookPayment(payment), cards.bookApproved()])
    }, approved())
    expect(posts(api)).toHaveLength(1)
    expect(api.db.card_payments[0].booked_transaction).toBe(PAYMENT_ID)
  })

  test('two starts at once refresh each pending payment once', async ({ page, api }) => {
    api.enable()
    api.pairTerminal()
    api.db.card_payments.push(approved({ status: 'pending' }))
    await gotoReady(page, '/settings#card')
    const before = api.card.refreshes
    await page.evaluate(async () => {
      const module = await import(location.origin + '/_nuxt/composables/useCardPayments.js')
      const cards = module.useCardPayments()
      await Promise.all([cards.bookApproved(), cards.bookApproved()])
    })
    expect(api.card.refreshes - before).toBe(1)
  })
})

test('the faked charge route refuses like the server', async ({ page, api }) => {
  api.enable()
  api.card.configured = true
  await gotoReady(page, '/settings#card')
  const charge = body => page.evaluate(async (payload) => {
    const response = await fetch('/api/card/charge', { method: 'POST', headers: { Authorization: JSON.parse(localStorage.getItem('pocketbase_auth')).token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    return [response.status, (await response.json()).message ?? '']
  }, body)
  expect(await charge({ source: 'cart', amount: 5, cart: { amount: 5 } })).toEqual([409, 'No terminal is paired'])
  api.pairTerminal()
  expect(await charge({ source: 'cart', amount: 5, cart: { amount: 6 } })).toEqual([400, "The cart total doesn't match the amount"])
  expect((await charge({ source: 'cart', amount: 5, cart: { amount: 5 } }))[0]).toBe(200)
  expect(await charge({ source: 'cart', amount: 5, cart: { amount: 5 } })).toEqual([409, 'A card payment is already waiting on the terminal'])
})
