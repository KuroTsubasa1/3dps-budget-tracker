import { test, expect, gotoReady } from './fixtures.js'

export const COMMISSION_CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 },
  { id: 'cat-mini', name: 'Mini Figure', base_price: 8, sort_order: 2 }
]
export const COMMISSION_DEALS = [
  { id: 'deal-keychain00', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }
]
export const COMMISSION_ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' },
  { id: 't1', name: 'Totoro', category: 'cat-mini' }
]

const sheet = page => page.getByRole('dialog')
const addArticle = (page, name) => sheet(page).getByLabel('Add article').selectOption({ label: name })
// A form line is found by its quantity stepper, a group labelled "Quantity of <name>"
const line = (page, name) => sheet(page).getByRole('group', { name: `Quantity of ${name}` })
const card = (page, name) => page.locator('h3', { hasText: name })
const isCompact = page => page.viewportSize().width < 1024
const addToCart = async (page, name, times = 1) => {
  for (let i = 0; i < times; i++) await card(page, name).click()
}
// Below lg the cart is a sheet behind the "View cart" bar
const openCart = async (page) => {
  if (isCompact(page)) await page.getByRole('button', { name: /View cart/ }).click()
}
const monthsAgo = (months) => {
  const date = new Date()
  date.setMonth(date.getMonth() - months)
  return date.toISOString().replace('T', ' ')
}
export const commission = overrides => ({
  id: 'c1',
  customer_name: 'Ash Ketchum',
  customer_email: 'ash@example.com',
  fulfilment: 'pickup',
  address: '',
  article: 'f1',
  quantity: 1,
  agreed_price: 30,
  notes: '',
  status: 'open',
  created: '2026-10-01 10:00:00.000Z',
  delivered_at: '',
  cancelled_at: '',
  anonymised_at: '',
  ...overrides
})

const TWO_LINES = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }]

const seedWith = (api, commissions = []) =>
  api.seed({ categories: COMMISSION_CATEGORIES, articles: COMMISSION_ARTICLES, deals: COMMISSION_DEALS, commissions })

test.describe('the commissions page', () => {
  test('a new commission pre-fills the deal price and saves its lines', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await addArticle(page, 'Pikachu Keychain')
    await addArticle(page, 'Pikachu Keychain')
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await addArticle(page, 'Totoro')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('15,00')
    await sheet(page).getByLabel('Notes').fill('Shiny colours')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()

    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({
      customer_name: 'Misty', customer_email: 'misty@example.com', fulfilment: 'pickup', address: '',
      items: TWO_LINES, agreed_price: 15, notes: 'Shiny colours', status: 'open'
    })
    const created = api.requests.find(request => request.method === 'POST' && request.path.endsWith('/commissions/records')).body
    expect(created).not.toHaveProperty('article')
    expect(created).not.toHaveProperty('quantity')
    await expect(page.getByRole('button', { name: /Misty/ })).toContainText('Pikachu Keychain × 2, Totoro · Pickup')
  })

  test('stepping and removing lines updates the price until it is edited', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const price = sheet(page).getByLabel('Agreed price')
    await addArticle(page, 'Pikachu Keychain')
    await expect(price).toHaveValue('4,00')
    await addArticle(page, 'Glurak Figure')
    await expect(price).toHaveValue('34,00')
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(price).toHaveValue('37,00')
    await sheet(page).getByRole('button', { name: 'Remove Glurak Figure', exact: true }).click()
    await expect(line(page, 'Glurak Figure')).toHaveCount(0)
    await expect(price).toHaveValue('7,00')
    // The stepper never goes below 1
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('1')
    await expect(price).toHaveValue('4,00')
    await price.fill('9,50')
    await addArticle(page, 'Glurak Figure')
    await expect(price).toHaveValue('9,50')
  })

  test('saving while offline says so and keeps the form open', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await addArticle(page, 'Glurak Figure')
    api.fail('commissions', 'drop')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText("You're offline — commissions need a connection")
    await expect(sheet(page).getByLabel('Customer name')).toHaveValue('Misty')
  })

  test('an anonymised open commission can still be edited', async ({ page, api }) => {
    seedWith(api, [commission()])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Delete customer data' }).click()
    await sheet(page).getByRole('button', { name: 'Delete data' }).click()
    await expect.poll(() => api.db.commissions[0].anonymised_at).toBeTruthy()
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(sheet(page).getByText('Customer data deleted')).toBeVisible()
    await sheet(page).getByLabel('Notes').fill('Gold paint')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Gold paint')
    expect(api.db.commissions[0]).toMatchObject({ customer_name: '—', customer_email: '' })
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
    const patches = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/commissions/records/c1'))
    const update = patches.at(-1).body
    expect(update).toMatchObject({ notes: 'Gold paint' })
    for (const key of ['customer_name', 'customer_email', 'address', 'fulfilment']) expect(update).not.toHaveProperty(key)
  })

  test('the address is only asked for, and required, when shipping', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Brock')
    await sheet(page).getByLabel('Email').fill('brock@example.com')
    await addArticle(page, 'Glurak Figure')
    await expect(sheet(page).getByLabel('Address')).toHaveCount(0)
    await sheet(page).getByRole('radio', { name: 'Shipping' }).click()
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter an address for shipping')
    await sheet(page).getByLabel('Address').fill('Pewter City Gym')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page)).toHaveCount(0)
    expect(api.db.commissions[0]).toMatchObject({ fulfilment: 'shipping', address: 'Pewter City Gym', agreed_price: 30 })
  })

  test('validation names the problem', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    const save = () => sheet(page).getByRole('button', { name: 'Create commission' }).click()
    const alert = sheet(page).getByRole('alert')
    await save()
    await expect(alert).toHaveText("Enter the customer's name")
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('nope')
    await save()
    await expect(alert).toHaveText('Enter a valid email address')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await save()
    await expect(alert).toHaveText('Add at least one article')
    await addArticle(page, 'Glurak Figure')
    await sheet(page).getByRole('button', { name: 'Remove Glurak Figure', exact: true }).click()
    await save()
    await expect(alert).toHaveText('Add at least one article')
    await addArticle(page, 'Glurak Figure')
    await sheet(page).getByLabel('Agreed price').fill('0')
    await save()
    await expect(alert).toHaveText('Agreed price must be above 0')
    expect(api.db.commissions).toHaveLength(0)
  })

  test('a commission moves from open to delivered and books its income', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Start printing' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    await sheet(page).getByRole('button', { name: 'Mark ready' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('ready')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 30, description: 'Commission: Glurak Figure × 1 (Ash Ketchum)' })
    expect(api.db.commissions[0].status).toBe('delivered')
    expect(api.db.commissions[0].delivered_at).toBeTruthy()
    await expect(page.getByText(/added to balance/)).toBeVisible()
    expect(api.posted).toHaveLength(1)
  })

  test('a failed delivery update books no income', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'ready' })])
    await api.mockTransactions()
    api.fail('commissions', 500)
    await gotoReady(page, '/commissions')
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Ready/ }).click()
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()
    await expect(sheet(page).getByRole('alert')).toBeVisible()
    expect(api.posted).toHaveLength(0)
    expect(api.db.commissions[0].status).toBe('ready')
  })

  test('a stale Ready screen does not book a delivery another device already made', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'ready' })])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Ready/ }).click()
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    api.db.commissions[0].status = 'delivered'
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('This commission was already updated — check its status')
    expect(api.posted).toHaveLength(0)
  })

  test('a lost reply on the delivery update still books the income once', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'ready' })])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Ready/ }).click()
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    api.fail('commissions', 'drop')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()
    await expect(page.getByText(/added to balance/)).toBeVisible()
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 30 })
    expect(api.db.commissions[0].status).toBe('delivered')
  })

  test('a step back, a cancellation and the Done chip', async ({ page, api }) => {
    seedWith(api, [commission()])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Start printing' }).click()
    await sheet(page).getByRole('button', { name: 'Back to Open' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('open')
    await sheet(page).getByRole('button', { name: 'Cancel commission' }).click()
    await sheet(page).getByRole('button', { name: 'Yes, cancel' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('cancelled')
    expect(api.db.commissions[0].cancelled_at).toBeTruthy()
    await page.keyboard.press('Escape')

    const chips = page.getByRole('group', { name: 'Commission status' })
    await expect(chips.getByRole('button', { name: /Done/ })).toHaveText(/Done\s*1$/)
    await chips.getByRole('button', { name: /Done/ }).click()
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toBeVisible()
  })

  test('editing a legacy commission keeps the price and its article, and saves it as a line', async ({ page, api }) => {
    seedWith(api, [commission({ article: 'k1', quantity: 2, agreed_price: 6.5 })])
    await gotoReady(page, '/commissions')
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toContainText('Pikachu Keychain × 2 · Pickup')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(sheet(page)).toContainText('Pikachu Keychain × 2')
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('6,50')
    await sheet(page).getByLabel('Notes').fill('Gold paint')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Gold paint')
    expect(api.db.commissions[0]).toMatchObject({
      agreed_price: 6.5,
      article: 'k1',
      quantity: 2,
      items: [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }]
    })
    const update = api.requests.filter(request => request.method === 'PATCH' && request.path.endsWith('/commissions/records/c1')).at(-1).body
    expect(update).not.toHaveProperty('article')
    expect(update).not.toHaveProperty('quantity')
  })

  test('finished commissions older than six months lose their customer data on load', async ({ page, api }) => {
    seedWith(api, [
      commission({ id: 'old', customer_name: 'Old Customer', status: 'delivered', delivered_at: monthsAgo(7), address: 'Somewhere 1', fulfilment: 'shipping' }),
      commission({ id: 'new', customer_name: 'Recent Customer', status: 'delivered', delivered_at: monthsAgo(5) })
    ])
    await gotoReady(page, '/commissions')
    await expect.poll(() => api.db.commissions.find(c => c.id === 'old').anonymised_at).toBeTruthy()
    expect(api.db.commissions.find(c => c.id === 'old')).toMatchObject({ customer_name: '—', customer_email: '', address: '—', status: 'delivered', agreed_price: 30 })
    expect(api.db.commissions.find(c => c.id === 'new')).toMatchObject({ customer_name: 'Recent Customer', anonymised_at: '' })

    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Done/ }).click()
    await expect(page.getByRole('button', { name: /Anonymised/ })).toBeVisible()
  })

  test('the dashboard also anonymises finished commissions older than six months', async ({ page, api }) => {
    seedWith(api, [commission({ id: 'old', status: 'delivered', delivered_at: monthsAgo(7) })])
    await gotoReady(page, '/')
    await expect.poll(() => api.db.commissions[0].customer_name).toBe('—')
    expect(api.db.commissions[0].anonymised_at).toBeTruthy()
  })

  test('cancelling an edit returns to the read view without saving', async ({ page, api }) => {
    seedWith(api, [commission({ notes: 'Old notes' })])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(sheet(page).getByText('Old notes')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await sheet(page).getByLabel('Notes').fill('New notes')
    await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(sheet(page).getByRole('button', { name: 'Edit' })).toBeVisible()
    await expect(sheet(page).getByText('Old notes')).toBeVisible()
    await expect(sheet(page).getByText('New notes')).toHaveCount(0)
    expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
    // The discarded draft does not come back on the next edit
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(sheet(page).getByLabel('Notes')).toHaveValue('Old notes')
  })

  test('a new commission has no Cancel button in its form', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await expect(sheet(page).getByRole('button', { name: 'Create commission' })).toBeVisible()
    await expect(sheet(page).getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)
  })

  test('one failed anonymise does not block the page or the others', async ({ page, api }) => {
    seedWith(api, [
      commission({ id: 'old1', customer_name: 'First Customer', status: 'delivered', delivered_at: monthsAgo(7) }),
      commission({ id: 'old2', customer_name: 'Second Customer', status: 'delivered', delivered_at: monthsAgo(8) })
    ])
    api.failOnce('commissions', 500)
    await gotoReady(page, '/commissions')
    await expect(page.getByText('Some customer data could not be anonymised — it will be retried next time')).toBeVisible()
    await expect(page.getByText('Could not load commissions')).toHaveCount(0)
    await expect.poll(() => api.db.commissions.filter(item => item.anonymised_at).length).toBe(1)
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Done/ }).click()
    await expect(page.getByRole('button', { name: /Anonymised/ })).toHaveCount(1)
    await expect(page.getByRole('button', { name: /Customer/ })).toHaveCount(1)
  })

  test('an email the server rejects shows the email message and keeps the form open', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await addArticle(page, 'Glurak Figure')
    api.fail('commissions', 400, { customer_email: { code: 'validation_is_email', message: 'Must be a valid email address.' } })
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter a valid email address')
    await expect(sheet(page).getByLabel('Customer name')).toHaveValue('Misty')
  })

  test('a commission for an archived article can still be edited', async ({ page, api }) => {
    api.seed({
      categories: COMMISSION_CATEGORIES,
      articles: [...COMMISSION_ARTICLES, { id: 'old1', name: 'Retired Dino', category: 'cat-figure', active: false }],
      commissions: [commission({ article: 'old1' })]
    })
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(sheet(page)).toContainText('Retired Dino × 1')
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(line(page, 'Retired Dino')).toHaveText('1')
    await expect(sheet(page).getByLabel('Add article').locator('option', { hasText: 'Retired Dino' })).toHaveCount(0)
    await sheet(page).getByLabel('Notes').fill('Still the dino')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Still the dino')
    expect(api.db.commissions[0]).toMatchObject({ article: 'old1', items: [{ article: 'old1', name: 'Retired Dino', quantity: 1 }] })
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
  })

  test('customer data can be deleted on request', async ({ page, api }) => {
    seedWith(api, [commission()])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Delete customer data' }).click()
    await sheet(page).getByRole('button', { name: 'Delete data' }).click()
    await expect.poll(() => api.db.commissions[0].customer_name).toBe('—')
    expect(api.db.commissions[0]).toMatchObject({ customer_email: '', status: 'open' })
    await expect(sheet(page).getByRole('button', { name: 'Delete customer data' })).toHaveCount(0)
  })

  test('a multi-line commission lists its lines and books one income naming them', async ({ page, api }) => {
    seedWith(api, [commission({ article: '', quantity: 0, items: TWO_LINES, agreed_price: 15, status: 'ready' })])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Ready/ }).click()
    const row = page.getByRole('button', { name: /Ash Ketchum/ })
    await expect(row).toContainText('Pikachu Keychain × 2, Totoro · Pickup')
    await row.click()
    await expect(sheet(page)).toContainText('Pikachu Keychain × 2')
    await expect(sheet(page)).toContainText('Totoro × 1')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 15, description: 'Commission: Pikachu Keychain × 2, Totoro × 1 (Ash Ketchum)' })
    expect(api.db.commissions[0].status).toBe('delivered')
    await expect(page.getByText(/added to balance/)).toBeVisible()
    expect(api.posted).toHaveLength(1)
  })

  test('a row folds more than two lines into "+n more"', async ({ page, api }) => {
    seedWith(api, [commission({ article: '', quantity: 0, items: [...TWO_LINES, { article: 'f1', name: 'Glurak Figure', quantity: 1 }] })])
    await gotoReady(page, '/commissions')
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toContainText('Pikachu Keychain × 2, Totoro +1 more · Pickup')
  })
})

test.describe('entry points', () => {
  test('the cart becomes a new commission with every line and the deal price', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: /^Commission / })).toHaveCount(0)
    await addToCart(page, 'Pikachu Keychain', 2)
    await addToCart(page, 'Totoro')
    await openCart(page)
    await page.getByRole('button', { name: 'Commission', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/commissions')

    const form = page.getByRole('dialog', { name: 'New commission' })
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(line(page, 'Totoro')).toHaveText('1')
    await expect(form.getByLabel('Agreed price')).toHaveValue('15,00')
    await form.getByLabel('Customer name').fill('Misty')
    await form.getByLabel('Email').fill('misty@example.com')
    await form.getByRole('button', { name: 'Create commission' }).click()
    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions).toHaveLength(1)
    expect(api.db.commissions[0]).toMatchObject({ items: TWO_LINES, agreed_price: 15, status: 'open' })
    expect(api.db.stock_movements.filter(movement => movement.note !== 'opening stock')).toHaveLength(0)
  })

  test('the cart lines open the form only once', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await addToCart(page, 'Totoro')
    await openCart(page)
    await page.getByRole('button', { name: 'Commission', exact: true }).click()
    await expect(line(page, 'Totoro')).toHaveText('1')
    await page.keyboard.press('Escape')
    await expect(sheet(page)).toHaveCount(0)

    // Away and back inside the app (no reload): the draft has been used up
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/')
    await page.goBack()
    await page.waitForURL(url => url.pathname === '/commissions')
    await expect(page.getByText('No commissions here')).toBeVisible()
    await expect(sheet(page)).toHaveCount(0)

    // A commission started by hand begins with no lines
    await page.getByRole('button', { name: '+ New commission' }).click()
    await expect(sheet(page).getByRole('group', { name: /^Quantity of / })).toHaveCount(0)
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('')
  })

  test('an empty cart cannot become a commission', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    test.skip(isCompact(page), 'The phone cart only opens once it holds something')
    await expect(page.getByRole('button', { name: 'Commission', exact: true })).toBeDisabled()
  })

  test('the catalog header links to the commissions page', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Commissions' }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
  })

  test('the dashboard counts open commissions and links to them', async ({ page, api }) => {
    seedWith(api, [
      commission({ id: 'a', status: 'open' }),
      commission({ id: 'b', status: 'printing' }),
      commission({ id: 'c', status: 'delivered', delivered_at: '2026-10-02 10:00:00.000Z' })
    ])
    await gotoReady(page, '/')
    await page.getByRole('link', { name: /2 open commissions/ }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
  })

  test('the dashboard says "1 open commission" in the singular', async ({ page, api }) => {
    seedWith(api, [commission({ id: 'a', status: 'printing' })])
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 open commission(?!s)/ })).toBeVisible()
  })

  test('the dashboard hides the card when nothing is open', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'cancelled', cancelled_at: '2026-10-02 10:00:00.000Z' })])
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /open commission/ })).toHaveCount(0)
  })
})

test.describe('visitors cannot reach commissions', () => {
  test.use({ owner: false })

  test('no commission buttons and the page redirects to login', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: /^Commission/ })).toHaveCount(0)
    await page.goto('/commissions')
    await page.waitForURL(url => url.pathname === '/login')
  })
})
