import { test, expect, gotoReady } from './fixtures.js'

const BOARD_ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 2, low_stock_threshold: 5 },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure', stock: 10, low_stock_threshold: 2 }
]
const job = overrides => ({
  id: 'job000000000001',
  collectionName: 'print_jobs',
  article: 'k1',
  quantity: 8,
  status: 'printing',
  done_at: '',
  created: '2026-10-13 08:00:00.000Z',
  ...overrides
})
const commission = overrides => ({
  id: 'c1',
  customer_name: 'Ash Ketchum',
  customer_email: 'ash@example.com',
  fulfilment: 'pickup',
  address: '',
  article: 'f1',
  quantity: 1,
  agreed_price: 30,
  notes: 'Shiny colours',
  status: 'open',
  created: '2026-10-01 10:00:00.000Z',
  delivered_at: '',
  cancelled_at: '',
  anonymised_at: '',
  ready_at: '',
  ...overrides
})
const COMMISSION_CARD = 'Commission · Ash Ketchum'

const seedBoard = (api, { articles = BOARD_ARTICLES, printJobs = [], commissions = [] } = {}) =>
  api.seed({ articles, printJobs, commissions })
const stockOf = (api, id) => api.db.budget_tracket_catalog.find(article => article.id === id).stock
const loggedMovements = api => api.db.stock_movements.filter(movement => movement.note !== 'opening stock')

// Phones show one column at a time behind chips; lg+ shows all three
const openColumn = async (page, name) => {
  const chips = page.getByRole('group', { name: 'Print board columns' })
  if (await chips.isVisible()) await chips.getByRole('button', { name: new RegExp(`^${name}`) }).click()
  return page.getByRole('region', { name })
}

test.describe('the print board', () => {
  test('a low-stock article is printed and topped up once', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    const toPrint = await openColumn(page, 'To print')
    const card = toPrint.getByRole('article', { name: 'Pikachu Keychain' })
    await expect(card).toContainText('2 left · target 10')
    await expect(toPrint.getByRole('article', { name: 'Glurak Figure' })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Print 8' })).not.toHaveClass(/btn-primary/)
    await card.getByRole('button', { name: 'Print 8' }).click()

    await expect.poll(() => api.db.print_jobs.length).toBe(1)
    expect(api.db.print_jobs[0]).toMatchObject({ article: 'k1', quantity: 8, status: 'printing' })
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)

    const printing = await openColumn(page, 'Printing')
    const doneButton = printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true })
    await expect(doneButton).toHaveClass(/btn-primary/)
    await doneButton.click()
    await expect.poll(() => api.db.print_jobs[0].status).toBe('done')
    expect(api.db.print_jobs[0].done_at).toBeTruthy()
    expect(stockOf(api, 'k1')).toBe(10)
    expect(loggedMovements(api)).toEqual([
      expect.objectContaining({ id: api.db.print_jobs[0].id, article: 'k1', change: 8, reason: 'printed' })
    ])

    const doneToday = await openColumn(page, 'Done today')
    await expect(doneToday.getByRole('article', { name: 'Pikachu Keychain' })).toContainText('+8 to stock')
  })

  test('a changed stepper quantity is used', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    const card = (await openColumn(page, 'To print')).getByRole('article', { name: 'Pikachu Keychain' })
    await card.getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Add one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Print 9' }).click()
    await expect.poll(() => api.db.print_jobs[0]?.quantity).toBe(9)
  })

  test('the stepper never goes below 1', async ({ page, api }) => {
    seedBoard(api, { articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 4, low_stock_threshold: 5, target_stock: 3 }] })
    await gotoReady(page, '/print-board')
    const card = (await openColumn(page, 'To print')).getByRole('article', { name: 'Pikachu Keychain' })
    await expect(card).toContainText('4 left · target 3')
    await card.getByRole('button', { name: 'Remove one Pikachu Keychain' }).click()
    await card.getByRole('button', { name: 'Print 1' }).click()
    await expect.poll(() => api.db.print_jobs[0]?.quantity).toBe(1)
  })

  test('Back removes the job and returns the article to To print', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    await expect(printing.getByRole('article', { name: 'Pikachu Keychain' })).toContainText('Stock print × 8')
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Back' }).click()
    await expect.poll(() => api.db.print_jobs.length).toBe(0)
    const toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Print 8' })).toBeVisible()
    expect(loggedMovements(api)).toHaveLength(0)
  })

  test('a retried Done after a lost reply adds the stock once', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    const done = printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true })
    api.fail('stock_movements', 'drop')
    await done.click()
    await expect(page.getByRole('alert')).toHaveText("You're offline — the print board needs a connection")
    expect(api.db.print_jobs[0].status).toBe('printing')

    await done.click()
    await expect.poll(() => api.db.print_jobs[0].status).toBe('done')
    expect(loggedMovements(api)).toEqual([expect.objectContaining({ id: 'job000000000001', change: 8, reason: 'printed' })])
    expect(stockOf(api, 'k1')).toBe(10)
  })

  test('a stale Print is refused when the article is already printing', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    api.db.print_jobs.push(job({ quantity: 3 }))
    const toPrint = await openColumn(page, 'To print')
    await toPrint.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Print 8' }).click()
    await expect(page.getByRole('alert')).toHaveText('This article is already printing')
    expect(api.db.print_jobs).toHaveLength(1)
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)
  })

  test('Done on a job removed on another device adds no stock', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    api.db.print_jobs.splice(0)
    const printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Already updated — the board has been refreshed')
    expect(loggedMovements(api)).toHaveLength(0)
    expect(stockOf(api, 'k1')).toBe(2)
    await expect(printing.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)
  })

  test('Done on a job that vanishes between the re-read and the write shows the stale message', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    api.failOnce('print_jobs', 404)
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect(page.getByRole('alert')).toHaveText('Already updated — the board has been refreshed')
  })

  test('Back on a job that vanishes between the re-read and the delete shows the stale message', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    api.failOnce('print_jobs', 404)
    await printing.getByRole('article', { name: 'Pikachu Keychain' }).getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('alert')).toHaveText('Already updated — the board has been refreshed')
  })

  test('the board reloads when the tab becomes visible again', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    const toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toHaveCount(0)
    api.db.commissions.push(commission())
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toBeVisible()
  })

  test('the board reloads when the window regains focus', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    const toPrint = await openColumn(page, 'To print')
    api.db.commissions.push(commission())
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toBeVisible()
  })

  test('a hidden tab does not reload the board', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/print-board')
    await openColumn(page, 'To print')
    const before = api.requests.length
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
      document.dispatchEvent(new Event('visibilitychange'))
    })
    await page.waitForTimeout(300)
    expect(api.requests.length).toBe(before)
  })

  test('Done today shows jobs finished today, not two days ago', async ({ page, api }) => {
    const today = new Date().toISOString()
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
    seedBoard(api, {
      printJobs: [
        job({ id: 'jobtoday0000001', article: 'k1', status: 'done', done_at: today }),
        job({ id: 'jobold000000001', article: 'f1', status: 'done', done_at: twoDaysAgo })
      ]
    })
    await gotoReady(page, '/print-board')
    const doneToday = await openColumn(page, 'Done today')
    await expect(doneToday.getByRole('article', { name: 'Pikachu Keychain' })).toContainText('+8 to stock')
    await expect(doneToday.getByRole('article', { name: 'Glurak Figure' })).toHaveCount(0)
  })

  test('Back shows its own loading state while Done stays idle', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/print-board')
    const printing = await openColumn(page, 'Printing')
    const card = printing.getByRole('article', { name: 'Pikachu Keychain' })
    api.delayNext('print_jobs', 1500)
    await card.getByRole('button', { name: 'Back' }).click()
    await expect(card.getByRole('button', { name: 'Back' }).locator('.animate-spin')).toBeVisible()
    await expect(card.getByRole('button', { name: 'Done', exact: true }).locator('.animate-spin')).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Done', exact: true })).toBeDisabled()
  })

  test('a job on the board hints at Done in the article inventory', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByText('This article is on the print board — use Done there to add the batch')).toBeVisible()
    await expect(sheet.getByLabel('Stock now')).toBeVisible()
  })

  test('no hint when the article only has a finished job', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job({ status: 'done', done_at: new Date().toISOString() })] })
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByLabel('Stock now')).toBeVisible()
    await expect(sheet.getByText(/on the print board/)).toHaveCount(0)
  })

  test('no hint when print_jobs is locked', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()] })
    api.failReads('print_jobs', 403)
    await gotoReady(page, '/catalog')
    await page.getByRole('button', { name: 'Manage' }).click()
    await page.locator('h3', { hasText: 'Pikachu Keychain' }).click()
    const sheet = page.getByRole('dialog')
    await expect(sheet.getByLabel('Stock now')).toBeVisible()
    await expect(sheet.getByText(/on the print board/)).toHaveCount(0)
    await expect(sheet.getByRole('alert')).toHaveCount(0)
  })

  test('a commission card follows its own status and never touches stock', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    await gotoReady(page, '/print-board')
    let toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toContainText('Glurak Figure × 1')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toContainText('Shiny colours')
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')

    let printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Back' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('open')

    toPrint = await openColumn(page, 'To print')
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    printing = await openColumn(page, 'Printing')
    await printing.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Done', exact: true }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('ready')
    expect(api.db.commissions[0].ready_at).toBeTruthy()

    const doneToday = await openColumn(page, 'Done today')
    await expect(doneToday.getByRole('article', { name: COMMISSION_CARD })).toContainText('Commission ready')
    expect(loggedMovements(api)).toHaveLength(0)
    expect(api.db.print_jobs).toHaveLength(0)
  })

  test('a multi-line commission card lists every line', async ({ page, api }) => {
    const items = [{ article: 'k1', name: 'Pikachu Keychain', quantity: 2 }, { article: 'f1', name: 'Glurak Figure', quantity: 1 }]
    seedBoard(api, { commissions: [commission({ article: '', quantity: 0, items })] })
    await gotoReady(page, '/print-board')
    const card = (await openColumn(page, 'To print')).getByRole('article', { name: COMMISSION_CARD })
    await expect(card.getByRole('listitem')).toHaveText(['Pikachu Keychain × 2', 'Glurak Figure × 1'])
    await card.getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
    const printing = await openColumn(page, 'Printing')
    await expect(printing.getByRole('article', { name: COMMISSION_CARD }).getByRole('listitem')).toHaveText(['Pikachu Keychain × 2', 'Glurak Figure × 1'])
    expect(loggedMovements(api)).toHaveLength(0)
  })

  test('a commission changed on another device refreshes the board', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    await gotoReady(page, '/print-board')
    api.db.commissions[0].status = 'printing'
    const toPrint = await openColumn(page, 'To print')
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect(page.getByRole('alert')).toHaveText('Already updated — the board has been refreshed')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toHaveCount(0)
    const printing = await openColumn(page, 'Printing')
    await expect(printing.getByRole('article', { name: COMMISSION_CARD })).toBeVisible()
  })

  test('a locked print_jobs (403) shows the migration hint and commissions still work', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    // Between pb:migrate --apply and --apply-rules the collection exists with listRule null: a non-admin list is a 403
    api.failReads('print_jobs', 403)
    await gotoReady(page, '/print-board')
    await expect(page.getByText('Run the migration to enable the print board')).toBeVisible()
    await expect(page.getByText(/Could not load/)).toHaveCount(0)
    const toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: COMMISSION_CARD })).toBeVisible()
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 to print/ })).toBeVisible()
  })

  test('without print_jobs the board asks for the migration and commissions still work', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    api.dropCollection('print_jobs')
    await gotoReady(page, '/print-board')
    await expect(page.getByText('Run the migration to enable the print board')).toBeVisible()
    const toPrint = await openColumn(page, 'To print')
    await expect(toPrint.getByRole('article', { name: 'Pikachu Keychain' })).toHaveCount(0)
    await toPrint.getByRole('article', { name: COMMISSION_CARD }).getByRole('button', { name: 'Start' }).click()
    await expect.poll(() => api.db.commissions[0].status).toBe('printing')
  })
})

test.describe('visitors cannot reach the print board', () => {
  test.use({ owner: false })

  test('logged out, /print-board redirects to login', async ({ page, api }) => {
    seedBoard(api)
    await page.goto('/print-board')
    await page.waitForURL(url => url.pathname === '/login')
  })
})

test.describe('entry points', () => {
  test('the dashboard counts the To print cards and links to the board', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    await gotoReady(page, '/')
    await page.getByRole('link', { name: /2 to print/ }).click()
    await page.waitForURL(url => url.pathname === '/print-board')
  })

  test('one card reads "1 to print"', async ({ page, api }) => {
    seedBoard(api, { printJobs: [job()], commissions: [commission()] })
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 to print/ })).toBeVisible()
  })

  test('the dashboard hides the link when nothing is to print', async ({ page, api }) => {
    seedBoard(api, { articles: [BOARD_ARTICLES[1]] })
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /to print/ })).toHaveCount(0)
  })

  test('the dashboard still counts the commission when print_jobs is locked or missing', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    api.failReads('print_jobs', 403)
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 to print/ })).toBeVisible()
    api.failReads('print_jobs', 404)
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 to print/ })).toBeVisible()
  })

  test('the dashboard hides the link when the commissions list fails', async ({ page, api }) => {
    seedBoard(api, { commissions: [commission()] })
    api.failReads('commissions', 403)
    await gotoReady(page, '/')
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()
    await expect(page.getByRole('link', { name: /to print/ })).toHaveCount(0)
  })

  test('the dashboard fetches the commissions once', async ({ page, api }) => {
    seedBoard(api, { articles: [BOARD_ARTICLES[1]], commissions: [commission()] })
    await gotoReady(page, '/')
    await expect(page.getByRole('link', { name: /1 to print/ })).toBeVisible()
    const lists = api.requests.filter(request => request.method === 'GET' && request.path === '/api/collections/commissions/records')
    expect(lists).toHaveLength(1)
  })

  test('the Print board tab opens the board', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/catalog')
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Print board', exact: true }).click()
    await page.waitForURL(url => url.pathname === '/print-board')
  })
})

test.describe('the catalog header', () => {
  test('has no Commissions or Print board buttons: the tabs replace them', async ({ page, api }) => {
    seedBoard(api)
    await gotoReady(page, '/catalog')
    await expect(page.getByRole('button', { name: 'Manage' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Print board', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Commissions', exact: true })).toHaveCount(0)
  })
})
