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
// Articles are only picked in the catalog: fill the cart (a name repeats for more of it) and tap Commission
const startCommission = async (page, ...names) => {
  await gotoReady(page, '/catalog')
  for (const name of names) await addToCart(page, name)
  await openCart(page)
  await page.getByRole('button', { name: 'Commission', exact: true }).click()
  await page.waitForURL(url => url.pathname === '/commissions')
  await expect(sheet(page).getByRole('button', { name: 'Create commission' })).toBeVisible()
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
  customer_phone: '',
  paid_at: '',
  payment_transaction: '',
  ...overrides
})

const TWO_LINES = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 't1', name: 'Totoro', quantity: 1 }]

const seedWith = (api, commissions = []) =>
  api.seed({ categories: COMMISSION_CATEGORIES, articles: COMMISSION_ARTICLES, deals: COMMISSION_DEALS, commissions })

test.describe('the commissions page', () => {
  test('a new commission pre-fills the deal price and saves its lines', async ({ page, api }) => {
    seedWith(api)
    await startCommission(page, 'Pikachu Keychain', 'Pikachu Keychain', 'Totoro')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
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
    await startCommission(page, 'Pikachu Keychain', 'Glurak Figure')
    const price = sheet(page).getByLabel('Agreed price')
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
    await line(page, 'Pikachu Keychain').getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await expect(line(page, 'Pikachu Keychain')).toHaveText('2')
    await expect(price).toHaveValue('9,50')
  })

  test('saving while offline says so and keeps the form open', async ({ page, api }) => {
    seedWith(api)
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
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
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Brock')
    await sheet(page).getByLabel('Email').fill('brock@example.com')
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
    await startCommission(page, 'Glurak Figure')
    const save = () => sheet(page).getByRole('button', { name: 'Create commission' }).click()
    const alert = sheet(page).getByRole('alert')
    await save()
    await expect(alert).toHaveText("Enter the customer's name")
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('nope')
    await save()
    await expect(alert).toHaveText('Enter a valid email address')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await sheet(page).getByLabel('Agreed price').fill('0')
    await save()
    await expect(alert).toHaveText('Agreed price must be above 0')
    await sheet(page).getByRole('button', { name: 'Remove Glurak Figure', exact: true }).click()
    await save()
    await expect(alert).toHaveText('Add at least one article')
    expect(api.db.commissions).toHaveLength(0)
  })

  test('a commission moves from open to delivered and books nothing', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Start printing' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    await sheet(page).getByRole('button', { name: 'Mark ready' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('ready')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()

    await expect.poll(() => api.db.commissions[0].status).toBe('delivered')
    expect(api.db.commissions[0].delivered_at).toBeTruthy()
    await expect(sheet(page).getByRole('listitem').filter({ hasText: 'Delivered' })).toHaveAttribute('aria-current', 'step')
    await expect(sheet(page).getByRole('switch', { name: 'Paid' })).toHaveAttribute('aria-checked', 'false')
    await page.waitForLoadState('networkidle')
    expect(api.posted).toHaveLength(0)
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    await expect(page.getByText(/added to balance/)).toHaveCount(0)
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

  test('a lost reply on the delivery update still shows it delivered and books nothing', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'ready' })])
    await api.mockTransactions()
    await gotoReady(page, '/commissions')
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Ready/ }).click()
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    api.fail('commissions', 'drop')
    await sheet(page).getByRole('button', { name: 'Mark delivered' }).click()
    await expect(sheet(page).getByRole('listitem').filter({ hasText: 'Delivered' })).toHaveAttribute('aria-current', 'step')
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
    expect(api.db.commissions[0].status).toBe('delivered')
    await page.waitForLoadState('networkidle')
    expect(api.posted).toHaveLength(0)
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
    await startCommission(page, 'Glurak Figure')
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
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
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
    await expect(sheet(page).getByLabel('Add article')).toHaveCount(0)
    await sheet(page).getByLabel('Notes').fill('Still the dino')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Still the dino')
    expect(api.db.commissions[0]).toMatchObject({ article: 'old1', items: [{ article: 'old1', name: 'Retired Dino', quantity: 1 }] })
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
  })

  test('a commission can be created without an email', async ({ page, api }) => {
    seedWith(api)
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({ customer_name: 'Misty', customer_email: '' })
  })

  test('a server that is not migrated yet is reported, not saved silently', async ({ page, api }) => {
    seedWith(api)
    api.stripItems('commissions')
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('The server needs updating — run the migration first')
    await expect(sheet(page).getByLabel('Customer name')).toHaveValue('Misty')
    await expect(page.getByText('Commission created')).toHaveCount(0)
  })

  test('a create the server rejects for the required article asks for the migration', async ({ page, api }) => {
    seedWith(api)
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    api.fail('commissions', 400, { article: { code: 'validation_required', message: 'Cannot be blank.' } })
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('The server needs updating — run the migration first')
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
    await sheet(page).getByRole('switch', { name: 'Paid' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 15, description: 'Commission: Pikachu Keychain × 2, Totoro × 1 (Ash Ketchum)' })
    // The agreed 15 € spread by list value: 2 × 4 € keychains and an 8 € Totoro weigh the same
    expect(api.posted[0].items).toEqual([
      { article: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', categoryName: 'Keychain', quantity: 2, unitPrice: 3.75, lineTotal: 7.5, discount: 0, deal: '', dealName: '' },
      { article: 't1', name: 'Totoro', category: 'cat-mini', categoryName: 'Mini Figure', quantity: 1, unitPrice: 7.5, lineTotal: 7.5, discount: 0, deal: '', dealName: '' }
    ])
    expect(Number.isNaN(Date.parse(api.posted[0].sold_at))).toBe(false)
    expect(api.db.commissions[0].status).toBe('ready')
    await expect(page.getByText(/Paid — 15,00\s€ added to balance/)).toBeVisible()
    expect(api.posted).toHaveLength(1)
  })

  test('a row folds more than two lines into "+n more"', async ({ page, api }) => {
    seedWith(api, [commission({ article: '', quantity: 0, items: [...TWO_LINES, { article: 'f1', name: 'Glurak Figure', quantity: 1 }] })])
    await gotoReady(page, '/commissions')
    await expect(page.getByRole('button', { name: /Ash Ketchum/ })).toContainText('Pikachu Keychain × 2, Totoro +1 more · Pickup')
  })
})

const PAID_AT = '2026-10-10 10:00:00.000Z'
// Payments are tracked from 2026-10-16: PAID_AT is before that, so a delivery then booked its income
const DELIVERED_TRACKED = '2026-10-16 00:00:00.000Z'
const TX_ID = 'txpaid000000001'
const income = overrides => ({
  id: TX_ID,
  collectionName: 'budget_tracker_transactions',
  description: 'Commission: Glurak Figure × 1 (Ash Ketchum)',
  amount: 30,
  notes: '',
  date: '2026-10-10',
  created: PAID_AT,
  updated: PAID_AT,
  ...overrides
})
const paidSwitch = page => sheet(page).getByRole('switch', { name: 'Paid' })
const openAsh = async (page, tab) => {
  await gotoReady(page, '/commissions')
  if (tab) await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: new RegExp(tab) }).click()
  await page.getByRole('button', { name: /Ash Ketchum/ }).click()
}
const PAYMENT_FAILED = 'Could not change the payment. Check your connection and try again.'
const NOT_MIGRATED = 'The server needs updating — run the migration first'
const posts = api => api.requests.filter(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records'))
const stored = (page, key) => page.evaluate(name => JSON.parse(localStorage.getItem(name) || '[]'), key)

test.describe('phone and payment', () => {
  test('the phone is saved trimmed, shown as a tel: link and removed with the customer data', async ({ page, api }) => {
    seedWith(api)
    await startCommission(page, 'Glurak Figure')
    await sheet(page).getByLabel('Customer name').fill('Misty')
    const phone = sheet(page).getByLabel('Phone', { exact: true })
    await expect(phone).toHaveAttribute('type', 'tel')
    await expect(phone).toHaveAttribute('inputmode', 'tel')
    await expect(phone).toHaveAttribute('autocomplete', 'off')
    await phone.fill('  +49 151 2345678 ')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()
    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0].customer_phone).toBe('+49 151 2345678')

    await page.getByRole('button', { name: /Misty/ }).click()
    const link = sheet(page).getByRole('link', { name: '+49 151 2345678' })
    await expect(link).toHaveAttribute('href', 'tel:+491512345678')
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(sheet(page).getByLabel('Phone', { exact: true })).toHaveValue('+49 151 2345678')
    await sheet(page).getByRole('button', { name: 'Cancel', exact: true }).click()

    await sheet(page).getByRole('button', { name: 'Delete customer data' }).click()
    await expect(sheet(page).getByText('Remove the name, email, phone and address for good? The article, price and status stay.')).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Delete data' }).click()
    await expect.poll(() => api.db.commissions[0].anonymised_at).toBeTruthy()
    expect(api.db.commissions[0].customer_phone).toBe('')
    await expect(sheet(page).getByRole('link', { name: /\+49/ })).toHaveCount(0)
    await expect(sheet(page).getByText('Phone', { exact: true })).toHaveCount(0)
  })

  test('a commission without a phone shows no Phone row', async ({ page, api }) => {
    seedWith(api, [commission()])
    await openAsh(page)
    await expect(sheet(page).getByText('ash@example.com')).toBeVisible()
    await expect(sheet(page).getByText('Phone', { exact: true })).toHaveCount(0)
  })

  test('Paid books one income with the customer name, its lines and time, and stores its id', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await paidSwitch(page).click()

    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 30, description: 'Commission: Glurak Figure × 1 (Ash Ketchum)' })
    expect(api.posted[0].items).toEqual([
      { article: 'f1', name: 'Glurak Figure', category: 'cat-figure', categoryName: 'Big Figure', quantity: 1, unitPrice: 30, lineTotal: 30, discount: 0, deal: '', dealName: '' }
    ])
    expect(Number.isNaN(Date.parse(api.posted[0].sold_at))).toBe(false)
    expect(api.posted[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(api.db.commissions[0].paid_at).toBeTruthy()
    // The income's record id is the commission's own id, so two devices can never book it twice
    expect(api.posted[0].id).toBe('c1')
    expect(api.db.commissions[0].payment_transaction).toBe('c1')
    expect(api.db.commissions[0].status).toBe('open')
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(page.getByText(/Paid — 30,00\s€ added to balance/)).toBeVisible()
    // The commission is updated before the income is booked
    const order = api.requests.filter(request => request.method !== 'GET' && /commissions|budget_tracker_transactions/.test(request.path)).map(request => request.path.split('/')[3])
    expect(order).toEqual(['commissions', 'budget_tracker_transactions'])
  })

  test('Unpaid deletes the income on the server and clears the payment', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    api.db.budget_tracker_transactions.push(income())
    await openAsh(page)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.posted).toHaveLength(0)
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    expect(api.requests.some(request => request.method === 'DELETE' && request.path.endsWith(`/budget_tracker_transactions/records/${TX_ID}`))).toBe(true)
    expect((await stored(page, 'budget-tracker-transactions')).filter(entry => entry.recordId === TX_ID || entry.id === TX_ID)).toEqual([])
  })

  test('Unpaid on an income the server no longer has still clears the payment', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    // Reads of the income fail, so opening the sheet cannot tell it is missing and books nothing
    api.failReads('budget_tracker_transactions', 500)
    await openAsh(page)
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
    expect(posts(api)).toHaveLength(0)
  })

  test('Unpaid on an income still waiting in the queue drops it from the queue and the list', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions({ status: 500 })
    await openAsh(page)
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    const recordId = api.db.commissions[0].payment_transaction
    expect(recordId).toBeTruthy()
    await expect.poll(async () => (await stored(page, 'budget-tracker-offline-queue')).map(item => item.recordId)).toEqual([recordId])

    api.fail('budget_tracker_transactions', 0)
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    expect(await stored(page, 'budget-tracker-offline-queue')).toEqual([])
    expect((await stored(page, 'budget-tracker-transactions')).filter(entry => entry.recordId === recordId)).toEqual([])
    // The server is asked too, in case the queued POST landed: it never did, so the 404 counts as done
    expect(api.requests.filter(request => request.method === 'DELETE' && request.path.endsWith(`/budget_tracker_transactions/records/${recordId}`))).toHaveLength(1)
    expect(api.posted).toHaveLength(0)
  })

  test('Unpaid on a queued income whose POST landed with a lost reply deletes it on the server', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    api.fail('budget_tracker_transactions', 'drop')
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await stored(page, 'budget-tracker-offline-queue')).map(item => item.recordId)).toEqual(['c1'])
    expect(api.posted.map(entry => entry.id)).toEqual(['c1'])

    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.posted).toEqual([])
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    expect(await stored(page, 'budget-tracker-offline-queue')).toEqual([])
  })

  test('a refresh while Unpaid waits for the server never turns the income into an orphan', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    // The POST lands but its reply is lost: the income is on the server and still queued here
    api.fail('budget_tracker_transactions', 'drop')
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await stored(page, 'budget-tracker-offline-queue')).map(item => item.recordId)).toEqual(['c1'])
    await page.waitForLoadState('networkidle')

    // The delete goes through at once, its reply comes late; a refresh lands in between
    api.delayNext('budget_tracker_transactions', 1500)
    await paidSwitch(page).click()
    await expect.poll(() => api.requests.some(request => request.method === 'DELETE')).toBe(true)
    await page.evaluate(() => window.dispatchEvent(new Event('online')))
    await expect.poll(() => api.requests.filter(request => request.method === 'GET' && request.path.endsWith('/budget_tracker_transactions/records')).length).toBeGreaterThan(0)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await page.waitForLoadState('networkidle')

    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    expect(api.posted).toEqual([])
    expect(await stored(page, 'budget-tracker-orphans')).toEqual([])
    expect((await stored(page, 'budget-tracker-transactions')).filter(entry => entry.recordId === 'c1')).toEqual([])
    await page.keyboard.press('Escape')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText(/not on the server/)).toHaveCount(0)
  })

  test('Unpaid tapped while the open sheet is still checking a missing income books nothing', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    await api.mockTransactions()
    // The check whether the income exists is slow; its answer is "not found"
    let slowed = false
    await page.route(`**/api/collections/budget_tracker_transactions/records/${TX_ID}*`, async (route) => {
      if (route.request().method() === 'GET' && !slowed) {
        slowed = true
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
      await route.fallback()
    })
    await openAsh(page)
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    await expect.poll(() => slowed).toBe(true)
    await page.waitForTimeout(2000)
    await page.waitForLoadState('networkidle')
    expect(posts(api)).toHaveLength(0)
    expect(api.posted).toEqual([])
  })

  test('a failed server delete puts the queued income back and keeps the switch on', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions({ status: 500 })
    await openAsh(page)
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(async () => (await stored(page, 'budget-tracker-offline-queue')).map(item => item.recordId)).toEqual(['c1'])

    await paidSwitch(page).click()
    await expect(sheet(page).getByRole('alert')).toHaveText(PAYMENT_FAILED)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    expect(api.db.commissions[0]).toMatchObject({ payment_transaction: 'c1' })
    expect((await stored(page, 'budget-tracker-offline-queue')).map(item => item.recordId)).toEqual(['c1'])
  })

  test('Unpaid while the income is still being sent is refused and keeps it', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    api.delayNext('budget_tracker_transactions', 1500)
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await paidSwitch(page).click()
    await expect(sheet(page).getByRole('alert')).toHaveText(PAYMENT_FAILED)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => api.posted.map(entry => entry.id)).toEqual(['c1'])
    await page.waitForTimeout(1600)
    expect(api.posted.map(entry => entry.id)).toEqual(['c1'])
    expect(api.db.commissions[0]).toMatchObject({ payment_transaction: 'c1' })
    expect(api.db.commissions[0].paid_at).toBeTruthy()
  })

  test('a failed Unpaid keeps the switch on and the income', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    api.db.budget_tracker_transactions.push(income())
    await openAsh(page)
    api.fail('budget_tracker_transactions', 500)
    await paidSwitch(page).click()
    await expect(sheet(page).getByRole('alert')).toHaveText(PAYMENT_FAILED)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    expect(api.db.commissions[0]).toMatchObject({ paid_at: PAID_AT, payment_transaction: TX_ID })
    expect(api.posted).toHaveLength(1)
  })

  test('a lost reply on the payment update books nothing; tapping again books exactly one income with the stored id', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    api.fail('commissions', 'drop')
    await paidSwitch(page).click()
    await expect(sheet(page).getByRole('alert')).toHaveText(PAYMENT_FAILED)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    const recordId = api.db.commissions[0].payment_transaction
    expect(recordId).toBeTruthy()
    expect(api.posted).toHaveLength(0)

    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ id: recordId, amount: 30 })
    await expect(sheet(page).getByRole('alert')).toHaveCount(0)
  })

  test('a commission another device already paid is shown paid and books nothing', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    Object.assign(api.db.commissions[0], { paid_at: PAID_AT, payment_transaction: TX_ID })
    api.db.budget_tracker_transactions.push(income())
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await page.waitForLoadState('networkidle')
    expect(api.posted).toHaveLength(1)
    expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
    expect(posts(api)).toHaveLength(0)
  })

  test('two devices booking the same commission end with one income', async ({ page, api }) => {
    seedWith(api, [commission()])
    await api.mockTransactions()
    await openAsh(page)
    await paidSwitch(page).click()
    await expect.poll(() => api.posted.map(entry => entry.id)).toEqual(['c1'])
    // A second device read the commission before the first one's update and books it as well
    Object.assign(api.db.commissions[0], { paid_at: '', payment_transaction: '' })
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => posts(api).length).toBe(2)
    await page.waitForLoadState('networkidle')
    expect(api.posted.map(entry => entry.id)).toEqual(['c1'])
    expect(api.db.commissions[0].payment_transaction).toBe('c1')
  })

  test('opening a paid commission whose income is missing books it once with the stored id', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    await api.mockTransactions()
    await openAsh(page)
    await expect.poll(() => api.posted.map(entry => entry.id)).toEqual([TX_ID])
    expect(api.posted[0]).toMatchObject({ amount: 30, description: 'Commission: Glurak Figure × 1 (Ash Ketchum)' })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await page.waitForLoadState('networkidle')
    expect(posts(api)).toHaveLength(1)
  })

  test('opening a paid commission books nothing when its income cannot be checked', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    await api.mockTransactions()
    api.failReads('budget_tracker_transactions', 500)
    await openAsh(page)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await page.waitForLoadState('networkidle')
    await page.waitForTimeout(500)
    expect(posts(api)).toHaveLength(0)
  })

  test('a server without the payment fields is reported and books nothing', async ({ page, api }) => {
    seedWith(api, [commission()])
    api.dropFields('commissions', ['customer_phone', 'paid_at', 'payment_transaction'])
    await api.mockTransactions()
    await openAsh(page)
    await paidSwitch(page).click()
    await expect(sheet(page).getByRole('alert')).toHaveText(NOT_MIGRATED)
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    await page.waitForLoadState('networkidle')
    expect(posts(api)).toHaveLength(0)
  })

  test('the price lock follows the server: a commission paid on another device refuses a new price', async ({ page, api }) => {
    seedWith(api, [commission()])
    await openAsh(page)
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    Object.assign(api.db.commissions[0], { paid_at: PAID_AT, payment_transaction: 'c1' })
    await sheet(page).getByLabel('Agreed price').fill('35')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Switch to Unpaid to change the price')
    expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
  })

  test('an old delivered commission asks first; Only mark paid books nothing', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'delivered', delivered_at: PAID_AT })])
    await api.mockTransactions()
    await openAsh(page, 'Done')
    await paidSwitch(page).click()
    await expect(sheet(page).getByText('This commission was delivered before payments were tracked, so its income may already be in your balance.')).toBeVisible()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.db.commissions[0].paid_at).toBe('')
    await sheet(page).getByRole('button', { name: 'Only mark paid' }).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    expect(api.db.commissions[0].paid_at).toBeTruthy()
    expect(api.db.commissions[0].payment_transaction).toBe('')
    await page.waitForLoadState('networkidle')
    expect(api.posted).toHaveLength(0)

    // Unpaid only clears paid_at: there is no income of its own to remove
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'false')
    expect(api.db.commissions[0]).toMatchObject({ paid_at: '', payment_transaction: '' })
    expect(api.requests.filter(request => request.method === 'DELETE')).toHaveLength(0)
  })

  test('an old delivered commission asks first; Book income again books one income', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'delivered', delivered_at: PAID_AT })])
    await api.mockTransactions()
    await openAsh(page, 'Done')
    await paidSwitch(page).click()
    await sheet(page).getByRole('button', { name: 'Book income again' }).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 30, description: 'Commission: Glurak Figure × 1 (Ash Ketchum)' })
    expect(api.db.commissions[0].payment_transaction).toBe(api.posted[0].id)
    await expect(sheet(page).getByText('This commission was delivered before payments were tracked, so its income may already be in your balance.')).toHaveCount(0)
  })

  test('a commission delivered once payments were tracked books on Paid without asking', async ({ page, api }) => {
    seedWith(api, [commission({ status: 'delivered', delivered_at: DELIVERED_TRACKED })])
    await api.mockTransactions()
    await openAsh(page, 'Done')
    await paidSwitch(page).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect.poll(() => api.posted.length).toBe(1)
    expect(api.posted[0]).toMatchObject({ amount: 30, description: 'Commission: Glurak Figure × 1 (Ash Ketchum)' })
    expect(api.db.commissions[0].payment_transaction).toBe(api.posted[0].id)
    await expect(sheet(page).getByText(/delivered before payments were tracked/)).toHaveCount(0)
    await expect(sheet(page).getByRole('button', { name: 'Only mark paid' })).toHaveCount(0)
  })

  test('offline the switch is disabled and says it needs a connection', async ({ page, api, context }) => {
    seedWith(api, [commission()])
    await openAsh(page)
    await expect(paidSwitch(page)).toBeEnabled()
    await context.setOffline(true)
    await expect(paidSwitch(page)).toBeDisabled()
    await expect(sheet(page).getByText('Needs a connection')).toBeVisible()
    await context.setOffline(false)
    await expect(paidSwitch(page)).toBeEnabled()
  })

  test('while paid the price cannot change, other fields can', async ({ page, api }) => {
    seedWith(api, [commission({ paid_at: PAID_AT, payment_transaction: TX_ID })])
    await openAsh(page)
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await sheet(page).getByLabel('Agreed price').fill('35')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Switch to Unpaid to change the price')
    expect(api.requests.filter(request => request.method === 'PATCH')).toHaveLength(0)
    await sheet(page).getByLabel('Agreed price').fill('30,00')
    await sheet(page).getByLabel('Notes').fill('Gold paint')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Gold paint')
    expect(api.db.commissions[0]).toMatchObject({ agreed_price: 30, paid_at: PAID_AT, payment_transaction: TX_ID })
  })

  test('list rows show Paid or Unpaid, and a cancelled commission keeps the switch', async ({ page, api }) => {
    seedWith(api, [
      commission({ id: 'p1', customer_name: 'Paid Customer', paid_at: PAID_AT, payment_transaction: TX_ID }),
      commission({ id: 'u1', customer_name: 'Open Customer' }),
      commission({ id: 'x1', customer_name: 'Ash Ketchum', status: 'cancelled', cancelled_at: PAID_AT, paid_at: PAID_AT })
    ])
    await gotoReady(page, '/commissions')
    await expect(page.getByRole('button', { name: /Paid Customer/ }).getByText('Paid', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /Paid Customer/ }).getByText('Unpaid', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Open Customer/ }).getByText('Unpaid', { exact: true })).toBeVisible()
    await page.getByRole('group', { name: 'Commission status' }).getByRole('button', { name: /Done/ }).click()
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await expect(paidSwitch(page)).toHaveAttribute('aria-checked', 'true')
    await expect(paidSwitch(page)).toBeEnabled()
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
  })

  test('New commission on the Commissions page goes to the catalog and the hint explains why', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await expect(page.getByText('To start a commission, pick the articles in the catalog and tap Commission in the cart.')).toBeVisible()
    await page.getByRole('button', { name: 'New commission' }).click()
    await page.waitForURL(url => url.pathname === '/catalog')
    await expect(sheet(page)).toHaveCount(0)
  })

  test('the commission form has no Add article field and the catalog offers only active articles', async ({ page, api }) => {
    api.seed({
      categories: COMMISSION_CATEGORIES,
      articles: [...COMMISSION_ARTICLES, { id: 'old1', name: 'Retired Dino', category: 'cat-figure', active: false }]
    })
    await startCommission(page, 'Totoro')
    await expect(sheet(page).getByLabel('Add article')).toHaveCount(0)
    await expect(sheet(page).getByText('Add article')).toHaveCount(0)
    await expect(line(page, 'Totoro')).toHaveText('1')
    await page.keyboard.press('Escape')
    await page.goto('/catalog')
    await expect(card(page, 'Totoro')).toBeVisible()
    await expect(card(page, 'Retired Dino')).toHaveCount(0)
  })

  test('a cart draft is not kept when the list fails to load', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await addToCart(page, 'Totoro')
    await openCart(page)
    api.failReads('commissions', 500)
    await page.getByRole('button', { name: 'Commission', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
    await expect(page.getByText('Could not load commissions')).toBeVisible()
    await expect(sheet(page)).toHaveCount(0)

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Dashboard', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/')
    api.failReads('commissions', 0)
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Commissions', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/commissions')
    await expect(page.getByText('No commissions here')).toBeVisible()
    await expect(sheet(page)).toHaveCount(0)
  })

  test('an empty cart cannot become a commission', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    test.skip(isCompact(page), 'The phone cart only opens once it holds something')
    await expect(page.getByRole('button', { name: 'Commission', exact: true })).toBeDisabled()
  })

  test('the Commissions tab opens the commissions page', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Commissions', exact: true }).click()
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
