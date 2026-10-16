import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'
import { GATCHA_CATEGORIES, GATCHA, prizeSheet } from './gatcha-data.js'

// Pay by card against the faked /api/card/* routes (api.card): a charge creates its card_payments record
// in the fake PocketBase, and api.settleCard() records SumUp's result as the server would. SumUp is never contacted.
const card = (page, name) => page.locator('h3', { hasText: name })
const sheet = page => page.getByRole('dialog', { name: 'Card payment' })
const state = page => sheet(page).getByTestId('card-payment-state')
const isPhone = page => page.viewportSize().width < 1024
const openCart = async (page) => {
  if (isPhone(page)) await page.getByRole('button', { name: /View cart/ }).click()
}
const payByCard = page => page.getByRole('button', { name: /^Pay by card/ })

async function cartWithTwoArticles (page, api) {
  await api.mockCatalog()
  api.pairTerminal()
  await gotoReady(page, '/catalog')
  await card(page, 'Dragon Figure').click()
  await card(page, 'Dragon Figure').click()
  await card(page, 'Phone Stand').click()
  await openCart(page)
}

test.describe('Pay by card in the cart', () => {
  test('the button shows only with a paired Solo', async ({ page, api }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    await card(page, 'Dragon Figure').click()
    await openCart(page)
    await expect(page.getByRole('button', { name: 'Add to Balance' })).toBeVisible()
    await expect(payByCard(page)).toHaveCount(0)

    api.pairTerminal()
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await card(page, 'Dragon Figure').click()
    await openCart(page)
    await expect(payByCard(page)).toHaveText(/Pay by card · 12,50/)
  })

  test('approved: books exactly what Add to Balance would, as a card sale with the payment\'s id, once', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card · 29,00/)
    // Nothing closes the sheet while the terminal has the payment
    await expect(sheet(page).getByRole('button', { name: 'Close' })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeVisible()

    expect(api.card.charges).toHaveLength(1)
    const charged = api.card.charges[0]
    expect(charged).toMatchObject({ source: 'cart', amount: 29, description: 'Akinai sale' })
    expect(charged.cart.items.map(line => [line.article, line.quantity])).toEqual([['p1', 2], ['p2', 1]])
    expect(charged.cart.stockMovements.map(movement => [movement.article, movement.change])).toEqual([['p1', -2], ['p2', -1]])
    expect(api.posted).toHaveLength(0)

    api.settleCard('approved', 'TEENSK4W2K')
    await expect(state(page)).toHaveText('Paid ✓')
    // The sheet asked the server to refresh the payment (no return URL needed)
    expect(api.card.refreshes).toBeGreaterThan(0)
    await expect.poll(() => api.posted.length).toBe(1)
    const sale = api.posted[0]
    expect(sale).toMatchObject({ id: 'pay000000000001', amount: 29, payment_method: 'card', sumup_transaction: 'TEENSK4W2K', description: charged.cart.description, date: charged.cart.date })
    expect(sale.items).toEqual(charged.cart.items)
    expect(sale.sold_at).toBe(charged.cart.sold_at)
    // The stored booking's movements, with their ids: the same stock change as a cash checkout
    await expect.poll(() => api.db.stock_movements.filter(movement => movement.reason === 'sale').map(movement => movement.id)).toEqual(charged.cart.stockMovements.map(movement => movement.id))
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000001')

    await sheet(page).getByRole('button', { name: 'Done' }).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /View cart/ })).toHaveCount(0)
    if (!isPhone(page)) await expect(page.getByText('0 items')).toBeVisible()
    // Booked once: a later start finds it booked
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await page.waitForLoadState('networkidle')
    expect(api.posted).toHaveLength(1)
  })

  test('when the refresh fails (SumUp did not answer) the sheet reads the payment itself', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.refreshStatus = 502
    api.card.message = "SumUp didn't answer. Try again."
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('approved', 'TXREAD')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.map(sale => sale.sumup_transaction)).toEqual(['TXREAD'])
  })

  test('declined: nothing is booked and the cart stays', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('declined')
    await expect(state(page)).toHaveText('Card declined')
    await expect(sheet(page)).toContainText('Nothing was booked')
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()
    await expect(sheet(page)).toHaveCount(0)
    await openCart(page)
    await expect(page.getByText('2 items').first()).toBeVisible()
    expect(api.posted).toHaveLength(0)
    expect(api.db.stock_movements.filter(movement => movement.reason === 'sale')).toHaveLength(0)
  })

  test('Cancel on terminal cancels, and a payment the terminal cancels shows Cancelled', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await sheet(page).getByRole('button', { name: 'Cancel on terminal' }).click()
    await expect(state(page)).toHaveText('Cancelled')
    expect(api.card.cancels).toEqual(['pay000000000001'])
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()

    await openCart(page)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('cancelled')
    await expect(state(page)).toHaveText('Cancelled')
    expect(api.posted).toHaveLength(0)
  })

  test('a terminal that does not answer: the server\'s message, nothing booked; failed shows its own line', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.chargeStatus = 502
    api.card.message = "The terminal didn't answer. Check that it's on and online."
    await payByCard(page).click()
    await expect(state(page)).toHaveText("The terminal didn't answer. Check that it's on and online.")
    // The server marked it failed before answering: certain
    await expect(sheet(page)).toContainText('Nothing was booked')
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()

    api.card.chargeStatus = 200
    await openCart(page)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('failed')
    await expect(state(page)).toHaveText("The payment didn't go through")
    expect(api.posted).toHaveLength(0)
  })

  test('after 120 s without a result it asks; Keep waiting waits on and the payment still lands', async ({ page, api }) => {
    await page.clock.install()
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await page.clock.runFor(121_000)
    await expect(state(page)).toHaveText('Still waiting for the terminal')
    await expect(sheet(page).getByRole('button', { name: 'Cancel on terminal' })).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Keep waiting' }).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('approved', 'TX2')
    await page.clock.runFor(2_100)
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.length).toBe(1)
  })

  test('offline the button is disabled with Needs a connection', async ({ page, api, context }) => {
    await cartWithTwoArticles(page, api)
    await context.setOffline(true)
    await expect(payByCard(page)).toBeDisabled()
    await expect(page.getByText('Needs a connection')).toBeVisible()
    await context.setOffline(false)
    await expect(payByCard(page)).toBeEnabled()
    expect(api.card.charges).toHaveLength(0)
  })

  test('a gatcha paid by card asks for its prizes once the card sheet closes', async ({ page, api }) => {
    api.seed({ categories: GATCHA_CATEGORIES, articles: [GATCHA, { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2 }] })
    api.pairTerminal()
    await gotoReady(page, '/catalog')
    await card(page, 'GatchaPon').click()
    await openCart(page)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    expect(api.card.charges[0].cart.prizes).toEqual({ count: 1, categories: ['cat-keychain', 'cat-mini'] })
    expect(api.card.charges[0].cart.stockMovements).toEqual([])
    api.settleCard('approved', 'TX3')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect(prizeSheet(page)).toHaveCount(0)
    await sheet(page).getByRole('button', { name: 'Done' }).click()
    await expect(prizeSheet(page)).toBeVisible()
  })
})

// An approved payment the app never saw (closed or offline while the customer paid)
const approvedPayment = (id, extra = {}) => ({
  id,
  collectionName: 'card_payments',
  amount: 12.5,
  description: 'Akinai sale',
  source: 'home',
  cart: { description: 'Print at the stall', amount: 12.5, notes: '', date: '2026-10-16' },
  status: 'approved',
  sumup_checkout: 'ctx-1',
  sumup_transaction: 'TXLATE',
  booked_transaction: '',
  callback_token: '0'.repeat(64),
  created: '2026-10-16 10:00:00.000Z',
  ...extra
})

test.describe('approved payments booked later', () => {
  test('the next start books it once, with a toast, and marks it booked', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.card_payments.push(approvedPayment('pay000000000077'))
    await gotoReady(page, '/')
    // Paid from Home's form: there is no cart to tidy
    await expect(page.getByText(/^Card payment of 12,50\s€ booked$/)).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ id: 'pay000000000077', description: 'Print at the stall', amount: 12.5, date: '2026-10-16', payment_method: 'card', sumup_transaction: 'TXLATE' })
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000077')
    await gotoReady(page, '/catalog')
    expect(api.posted).toHaveLength(1)
  })

  test('a payment whose sale is already on the server is only marked booked', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.budget_tracker_transactions.push({ id: 'pay000000000078', collectionName: 'budget_tracker_transactions', description: 'Print at the stall', amount: 12.5, notes: '', date: '2026-10-16', created: '2026-10-16 10:00:05.000Z', payment_method: 'card' })
    api.db.card_payments.push(approvedPayment('pay000000000078'))
    await gotoReady(page, '/')
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000078')
    expect(api.db.budget_tracker_transactions).toHaveLength(1)
    await expect(page.getByText(/Card payment of .* booked/)).toHaveCount(0)
  })

  test('one left pending (no return URL, no poll) is refreshed on the next start and booked once', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    api.db.card_payments.push(approvedPayment('pay000000000080', { status: 'pending', sumup_transaction: '' }))
    api.card.onRefresh = (payment) => Object.assign(payment, { status: 'approved', sumup_transaction: 'TXLAPTOP' })
    await gotoReady(page, '/')
    await expect(page.getByText(/Card payment of 12,50.* booked/)).toBeVisible()
    await expect.poll(() => api.posted.map(sale => [sale.id, sale.sumup_transaction])).toEqual([['pay000000000080', 'TXLAPTOP']])
  })

  test('one approved while offline is booked when the connection returns', async ({ page, api, context }) => {
    await api.mockCatalog()
    await gotoReady(page, '/catalog')
    await context.setOffline(true)
    api.db.card_payments.push(approvedPayment('pay000000000079'))
    await context.setOffline(false)
    await expect.poll(() => api.posted.map(sale => sale.id)).toEqual(['pay000000000079'])
  })
})

test.describe('Pay by card on Home', () => {
  test('books the typed income as card; the form clears and closes on Done', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Pay by card' }).click()
    await expect(state(page)).toHaveText(/Waiting for card · 25,00/)
    // Escape belongs to the top sheet, which cannot be closed now: the form's sheet underneath stays too
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toBeVisible()
    if (isPhone(page)) await expect(page.getByRole('dialog', { name: 'Add Transaction' })).toBeVisible()
    expect(api.card.charges[0]).toMatchObject({ source: 'home', amount: 25, description: 'Akinai sale', cart: { description: 'Market sale', amount: 25, notes: '' } })
    api.settleCard('approved', 'TXHOME')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ id: 'pay000000000001', description: 'Market sale', amount: 25, payment_method: 'card', sumup_transaction: 'TXHOME' })
    await sheet(page).getByRole('button', { name: 'Done' }).click()
    if (isPhone(page)) await expect(page.getByRole('dialog', { name: 'Add Transaction' })).toHaveCount(0)
    await openTransactionForm(page)
    await expect(page.getByPlaceholder('What is this transaction for?')).toHaveValue('')
  })

  test('declined keeps the form; an expense has no Pay by card; the form checks its fields first', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByRole('button', { name: 'Pay by card' }).click()
    await expect(page.getByText('Please enter a description for the transaction')).toBeVisible()
    expect(api.card.charges).toHaveLength(0)

    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('25')
    await page.getByRole('button', { name: 'Pay by card' }).click()
    api.settleCard('declined')
    await expect(state(page)).toHaveText('Card declined')
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()
    await expect(sheet(page)).toHaveCount(0)
    // The form's own sheet is still open on a phone, and still holds the page still behind it
    if (isPhone(page)) expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await expect(page.getByPlaceholder('What is this transaction for?')).toHaveValue('Market sale')
    await expect(page.getByPlaceholder('0.00')).toHaveValue('25')
    expect(api.posted).toHaveLength(0)

    await page.getByText('Expense', { exact: true }).click()
    await expect(page.getByRole('button', { name: 'Pay by card' })).toHaveCount(0)
  })
})

// What the reviews asked to pin beyond the brief: the booking happens exactly once, and only for an approved payment
const marks = api => api.requests.filter(request => request.method === 'PATCH' && request.path.includes('/card_payments/'))
const queued = page => page.evaluate(() => JSON.parse(localStorage.getItem('budget-tracker-offline-queue') || '[]'))

test.describe('booking exactly once', () => {
  test('only an approved payment is booked; declined, cancelled and failed ones are left alone', async ({ page, api }) => {
    await api.mockTransactions()
    for (const [id, status] of [['pay000000000091', 'declined'], ['pay000000000092', 'cancelled'], ['pay000000000093', 'failed']]) {
      api.db.card_payments.push(approvedPayment(id, { status }))
    }
    await gotoReady(page, '/')
    await gotoReady(page, '/catalog')
    expect(api.posted).toHaveLength(0)
    expect(marks(api)).toEqual([])
  })

  test('the mark sends only booked_transaction, never the status', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.card_payments.push(approvedPayment('pay000000000077'))
    await gotoReady(page, '/')
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000077')
    expect(marks(api).map(request => request.body)).toEqual([{ booked_transaction: 'pay000000000077' }])
  })

  test('a sale still queued on this device whose mark was lost is only marked on the next start', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.card_payments.push(approvedPayment('pay000000000081'))
    // The sale cannot reach the server (it stays queued here) and the mark fails once
    api.fail('budget_tracker_transactions', 500)
    api.failOnce('card_payments', 500)
    await gotoReady(page, '/')
    await expect(page.getByText(/Card payment of 12,50.* booked/)).toBeVisible()
    await expect.poll(async () => (await queued(page)).map(item => item.recordId)).toEqual(['pay000000000081'])
    expect(api.db.card_payments[0].booked_transaction).toBe('')

    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000081')
    await expect(page.getByText(/Card payment of .* booked/)).toHaveCount(0)
    expect((await queued(page)).map(item => item.recordId)).toEqual(['pay000000000081'])
  })

  test('a server that already holds the sale\'s id (the duplicate answer) counts as booked', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.budget_tracker_transactions.push({ id: 'pay000000000082', collectionName: 'budget_tracker_transactions', description: 'Print at the stall', amount: 12.5, notes: '', date: '2026-10-16', created: '2026-10-16 10:00:05.000Z', payment_method: 'card' })
    api.db.card_payments.push(approvedPayment('pay000000000082'))
    // The lookup misses the sale (as if it landed just after), so the app posts it and the server refuses the twin
    api.failReads('budget_tracker_transactions', 404)
    await gotoReady(page, '/')
    await expect.poll(() => api.db.card_payments[0].booked_transaction).toBe('pay000000000082')
    expect(api.posted).toHaveLength(1)
    expect(await queued(page)).toEqual([])
  })

  test('a re-post after a reload replaces the cached history entry instead of adding a second', async ({ page, api }) => {
    await api.mockTransactions()
    api.db.card_payments.push(approvedPayment('pay000000000083'))
    // This device's history still lists the sale from a booking cut short by a reload; the server has none
    await page.addInitScript(() => {
      if (sessionStorage.getItem('history-seeded')) return
      localStorage.setItem('budget-tracker-transactions', JSON.stringify([{ id: 1, recordId: 'pay000000000083', description: 'Print at the stall', amount: 12.5, date: '2026-10-16', notes: '' }]))
      sessionStorage.setItem('history-seeded', '1')
    })
    // The history is never read back from the server here, so nothing else would hide a second entry
    api.failListReads('budget_tracker_transactions', 500)
    await gotoReady(page, '/')
    await expect.poll(() => api.posted.map(sale => sale.id)).toEqual(['pay000000000083'])
    const history = await page.evaluate(() => JSON.parse(localStorage.getItem('budget-tracker-transactions')))
    expect(history.filter(entry => entry.recordId === 'pay000000000083')).toEqual([expect.objectContaining({ payment_method: 'card', sumup_transaction: 'TXLATE' })])
    await expect(page.getByText('Print at the stall')).toHaveCount(1)
  })
})

test.describe('watching the payment', () => {
  test('the watch stops once the payment settles', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    api.settleCard('approved', 'TXSTOP')
    await expect(state(page)).toHaveText('Paid ✓')
    const refreshes = api.card.refreshes
    await page.waitForTimeout(4500)
    expect(api.card.refreshes).toBe(refreshes)
  })

  test('a slow refresh is never overlapped by the next one', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.refreshDelay = 3000
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await expect.poll(() => api.card.refreshes, { timeout: 15_000 }).toBeGreaterThanOrEqual(3)
    expect(api.card.refreshesAtOnce).toBe(1)
    api.card.refreshDelay = 0
    api.settleCard('approved', 'TXSLOW')
    await expect(state(page)).toHaveText('Paid ✓', { timeout: 10_000 })
    await expect.poll(() => api.posted.length).toBe(1)
  })
})

test.describe('the terminal state', () => {
  test('only the two flags are kept, and with the server unreachable the last known ones show the button', async ({ page, api }) => {
    await api.mockCatalog()
    api.pairTerminal()
    await gotoReady(page, '/catalog')
    await expect.poll(() => page.evaluate(() => localStorage.getItem('akinai-card-terminal'))).toBe(JSON.stringify({ configured: true, paired: true }))

    // A fresh tab: the terminal route fails, so the stored flags decide
    api.card.terminalStatus = 502
    api.card.message = "SumUp didn't answer. Try again."
    const other = await page.context().newPage()
    await gotoReady(other, '/catalog')
    await card(other, 'Dragon Figure').click()
    await openCart(other)
    await expect(payByCard(other)).toBeEnabled()
    await other.close()
  })
})

const UNCERTAIN = 'The terminal may still show the amount. Check the Solo before taking cash.'
const wayOut = page => sheet(page).getByRole('button', { name: 'Close, book it when it lands' })
const cartIsEmpty = async (page) => {
  await expect(page.getByRole('button', { name: /View cart/ })).toHaveCount(0)
  if (!isPhone(page)) await expect(page.getByText('0 items')).toBeVisible()
}
const lookedForApproved = api => api.requests.filter(request => request.method === 'GET' && request.path.endsWith('/card_payments/records') && /approved/.test(request.filter)).length

test.describe('when the charge\'s answer is uncertain', () => {
  test('a lost answer after the Solo got the amount: the sheet finds the payment and books it once', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.chargeLost = 'after'
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card · 29,00/)
    expect(api.card.charges).toHaveLength(1)
    api.settleCard('approved', 'TXLOST')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.map(sale => [sale.id, sale.sumup_transaction])).toEqual([['pay000000000001', 'TXLOST']])
    await sheet(page).getByRole('button', { name: 'Done' }).click()
    await cartIsEmpty(page)
    expect(api.posted).toHaveLength(1)
  })

  test('a lost answer and no payment found: the Solo may still show it, never "Nothing was booked"', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.chargeLost = 'before'
    await payByCard(page).click()
    await expect(state(page)).toHaveText(UNCERTAIN)
    await expect(sheet(page)).not.toContainText('Nothing was booked')
    // Closing looks for approved payments to book
    const before = lookedForApproved(api)
    await sheet(page).getByRole('button', { name: 'Close' }).last().click()
    await expect(sheet(page)).toHaveCount(0)
    await expect.poll(() => lookedForApproved(api)).toBeGreaterThan(before)
    expect(api.posted).toHaveLength(0)
  })

  test('a 5xx without the server\'s message is uncertain too', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.chargeStatus = 500
    api.card.message = ''
    await payByCard(page).click()
    await expect(state(page)).toHaveText(UNCERTAIN)
    await expect(sheet(page)).not.toContainText('Nothing was booked')
  })

  test('"already waiting on the terminal": the sheet takes over that payment', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.db.card_payments.push({
      id: 'pay000000000050',
      collectionName: 'card_payments',
      amount: 29,
      description: 'Akinai sale',
      source: 'cart',
      cart: { description: 'Akinai sale', amount: 29, notes: '', date: '2026-10-16', items: [], sold_at: '2026-10-16T10:00:00.000Z', stockMovements: [], prizes: { count: 0, categories: [] } },
      status: 'pending',
      sumup_checkout: '',
      sumup_transaction: '',
      booked_transaction: '',
      callback_token: '0'.repeat(64),
      created: new Date().toISOString().replace('T', ' ')
    })
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card · 29,00/)
    api.settleCard('approved', 'TXTAKEN')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect.poll(() => api.posted.map(sale => sale.id)).toEqual(['pay000000000050'])
  })
})

test.describe('a way out while the terminal has the payment', () => {
  test('still waiting: Close, book it when it lands closes the sheet, and the next start books it once', async ({ page, api }) => {
    await page.clock.install()
    await cartWithTwoArticles(page, api)
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await expect(wayOut(page)).toHaveCount(0)
    await page.clock.runFor(121_000)
    await expect(state(page)).toHaveText('Still waiting for the terminal')
    const before = lookedForApproved(api)
    await wayOut(page).click()
    await expect(sheet(page)).toHaveCount(0)
    await expect.poll(() => lookedForApproved(api)).toBeGreaterThan(before)
    // The watch stopped with the sheet
    const refreshes = api.card.refreshes
    await page.clock.runFor(10_000)
    expect(api.card.refreshes).toBe(refreshes)

    api.settleCard('approved', 'TXLANDED')
    await gotoReady(page, '/catalog')
    // The cart may still hold what was paid for
    await expect(page.getByText(/^Card payment of 29,00\s€ booked\. Remove those items from the cart if it still holds them\.$/)).toBeVisible()
    await expect.poll(() => api.posted.map(sale => sale.id)).toEqual(['pay000000000001'])
  })

  test('a failed cancel offers the way out, and its alert goes once the payment settles', async ({ page, api }) => {
    await cartWithTwoArticles(page, api)
    api.card.cancelStatus = 502
    api.card.message = "The terminal didn't answer. Check that it's on and online."
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await sheet(page).getByRole('button', { name: 'Cancel on terminal' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText("The terminal didn't answer. Check that it's on and online.")
    await expect(wayOut(page)).toBeVisible()
    api.settleCard('approved', 'TXAFTER')
    await expect(state(page)).toHaveText('Paid ✓')
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
    await expect(wayOut(page)).toHaveCount(0)
  })

  test('a cancel that leaves the payment pending asks again 120 s later', async ({ page, api }) => {
    await page.clock.install()
    await cartWithTwoArticles(page, api)
    api.card.cancelResult = 'pending'
    api.card.cancelDelay = 1500
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await page.clock.runFor(110_000)
    await sheet(page).getByRole('button', { name: 'Cancel on terminal' }).click()
    // The 120 s mark passes while the cancel is out (well within its own 20 s), and it answers pending
    await page.clock.runFor(11_000)
    await expect.poll(() => api.card.cancels.length).toBe(1)
    await page.waitForTimeout(2500)
    await expect(state(page)).toHaveText(/Waiting for card/)
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
    await page.clock.runFor(121_000)
    await expect(state(page)).toHaveText('Still waiting for the terminal')
  })

  test('a cancel that hangs gives up after 20 s with the terminal message', async ({ page, api }) => {
    await page.clock.install()
    await cartWithTwoArticles(page, api)
    api.card.cancelDelay = 4000
    await payByCard(page).click()
    await expect(state(page)).toHaveText(/Waiting for card/)
    await sheet(page).getByRole('button', { name: 'Cancel on terminal' }).click()
    await expect.poll(() => api.card.cancels.length).toBe(1)
    await page.clock.runFor(21_000)
    await expect(sheet(page).getByRole('alert')).toHaveText("The terminal didn't answer. Check that it's on and online.")
    await expect(state(page)).toHaveText(/Waiting for card/)
    // Let the fake's late answer go before the page closes
    await page.waitForTimeout(4500)
  })
})

test('a gatcha whose card booking could not be made yet opens no empty prize picker', async ({ page, api }) => {
  api.seed({ categories: GATCHA_CATEGORIES, articles: [GATCHA, { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2 }] })
  api.pairTerminal()
  await gotoReady(page, '/catalog')
  await card(page, 'GatchaPon').click()
  await openCart(page)
  await payByCard(page).click()
  await expect(state(page)).toHaveText(/Waiting for card/)
  // The booking cannot tell whether the sale exists, so it waits for the next start
  api.failReads('budget_tracker_transactions', 500)
  api.settleCard('approved', 'TXLATER')
  await expect(state(page)).toHaveText('Paid ✓')
  await sheet(page).getByRole('button', { name: 'Done' }).click()
  await page.waitForTimeout(1000)
  await expect(prizeSheet(page)).toHaveCount(0)
  expect(api.posted).toHaveLength(0)
})

test.describe('whole cents only', () => {
  test('Home refuses 1.005 before anything reaches the terminal, for Pay by card and Add to Balance', async ({ page, api }) => {
    await api.mockTransactions()
    api.pairTerminal()
    await gotoReady(page, '/')
    await openTransactionForm(page)
    await page.getByPlaceholder('What is this transaction for?').fill('Market sale')
    await page.getByPlaceholder('0.00').fill('1.005')
    await page.getByRole('button', { name: 'Pay by card' }).click()
    await expect(page.getByText('Enter the amount in whole cents')).toBeVisible()
    expect(api.card.charges).toHaveLength(0)
    await page.getByRole('button', { name: 'Add to Balance' }).click()
    await expect(page.getByText('Enter the amount in whole cents')).toBeVisible()
    expect(api.posted).toHaveLength(0)
  })
})
