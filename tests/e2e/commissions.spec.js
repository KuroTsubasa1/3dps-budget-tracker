import { test, expect, gotoReady } from './fixtures.js'

export const COMMISSION_CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 }
]
export const COMMISSION_DEALS = [
  { id: 'deal-keychain00', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }
]
export const COMMISSION_ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure' }
]

const sheet = page => page.getByRole('dialog')
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

const seedWith = (api, commissions = []) =>
  api.seed({ categories: COMMISSION_CATEGORIES, articles: COMMISSION_ARTICLES, deals: COMMISSION_DEALS, commissions })

test.describe('the commissions page', () => {
  test('a new commission pre-fills the deal price and saves', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Pikachu Keychain' })
    await sheet(page).getByLabel('Quantity').fill('2')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('7,00')
    await sheet(page).getByLabel('Notes').fill('Shiny colours')
    await sheet(page).getByRole('button', { name: 'Create commission' }).click()

    await expect(page.getByText('Commission created')).toBeVisible()
    expect(api.db.commissions[0]).toMatchObject({
      customer_name: 'Misty', customer_email: 'misty@example.com', fulfilment: 'pickup', address: '',
      article: 'k1', quantity: 2, agreed_price: 7, notes: 'Shiny colours', status: 'open'
    })
    await expect(page.getByRole('button', { name: /Misty/ })).toBeVisible()
  })

  test('the price stops following the suggestion once edited', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Article').selectOption({ label: 'Pikachu Keychain' })
    await sheet(page).getByLabel('Agreed price').fill('9,50')
    await sheet(page).getByLabel('Quantity').fill('3')
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('9,50')
  })

  test('saving while offline says so and keeps the form open', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Glurak Figure' })
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
  })

  test('the address is only asked for, and required, when shipping', async ({ page, api }) => {
    seedWith(api)
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: '+ New commission' }).click()
    await sheet(page).getByLabel('Customer name').fill('Brock')
    await sheet(page).getByLabel('Email').fill('brock@example.com')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Glurak Figure' })
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
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText("Enter the customer's name")
    await sheet(page).getByLabel('Customer name').fill('Misty')
    await sheet(page).getByLabel('Email').fill('nope')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter a valid email address')
    await sheet(page).getByLabel('Email').fill('misty@example.com')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Choose an article')
    await sheet(page).getByLabel('Article').selectOption({ label: 'Glurak Figure' })
    await sheet(page).getByLabel('Quantity').fill('0')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Quantity must be a whole number of 1 or more')
    await sheet(page).getByLabel('Quantity').fill('1')
    await sheet(page).getByLabel('Agreed price').fill('0')
    await save()
    await expect(sheet(page).getByRole('alert')).toHaveText('Agreed price must be above 0')
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

  test('editing keeps the agreed price', async ({ page, api }) => {
    seedWith(api, [commission({ article: 'k1', quantity: 2, agreed_price: 6.5 })])
    await gotoReady(page, '/commissions')
    await page.getByRole('button', { name: /Ash Ketchum/ }).click()
    await sheet(page).getByRole('button', { name: 'Edit' }).click()
    await expect(sheet(page).getByLabel('Agreed price')).toHaveValue('6,50')
    await sheet(page).getByLabel('Notes').fill('Gold paint')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.commissions[0].notes).toBe('Gold paint')
    expect(api.db.commissions[0].agreed_price).toBe(6.5)
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
})
