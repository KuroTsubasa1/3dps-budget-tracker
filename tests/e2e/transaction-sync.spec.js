import { readFileSync } from 'node:fs'
import { test, expect, gotoReady, openTransactionForm } from './fixtures.js'

const STORAGE_KEY = 'budget-tracker-transactions'
const ORPHANS_KEY = 'budget-tracker-orphans'

const serverRecord = (id, description, amount, created = '2026-10-12 10:00:00.000Z') =>
  ({ id, collectionName: 'budget_tracker_transactions', description, amount, notes: '', created, updated: created })

// An entry another device never saw: not on the server and never queued
const seedLocal = (context, entries) => context.addInitScript(({ key, entries }) => {
  if (sessionStorage.getItem('local-seeded')) return
  localStorage.setItem(key, JSON.stringify(entries))
  sessionStorage.setItem('local-seeded', '1')
}, { key: STORAGE_KEY, entries })

const seedOrphans = (context, entries) => context.addInitScript(({ key, entries }) => {
  if (sessionStorage.getItem('orphans-seeded')) return
  localStorage.setItem(key, JSON.stringify(entries))
  sessionStorage.setItem('orphans-seeded', '1')
}, { key: ORPHANS_KEY, entries })

const transactionPosts = api =>
  api.requests.filter(request => request.method === 'POST' && request.path.endsWith('/budget_tracker_transactions/records'))

const addSale = async (page, description, amount) => {
  await openTransactionForm(page)
  await page.getByPlaceholder('What is this transaction for?').fill(description)
  await page.getByPlaceholder('0.00').fill(String(amount))
  await page.getByRole('button', { name: 'Add to Balance' }).click()
}

test('a second device shows transactions recorded on the server', async ({ page, api }) => {
  await api.mockTransactions()
  api.db.budget_tracker_transactions.push(serverRecord('srv000000000001', 'Booth sale', 20), serverRecord('srv000000000002', 'Resin', -4.5))
  await gotoReady(page, '/')

  await expect(page.getByTestId('header-balance')).toContainText('15,50')
  await expect(page.getByText('Booth sale').first()).toBeVisible()
  await expect(page.getByText('Resin').first()).toBeVisible()
})

test('a sale made offline stays listed and is counted once after syncing', async ({ page, api, context }) => {
  await api.mockTransactions()
  api.db.budget_tracker_transactions.push(serverRecord('srv000000000001', 'Booth sale', 20))
  await gotoReady(page, '/')
  await expect(page.getByTestId('header-balance')).toContainText('20,00')

  await context.setOffline(true)
  await addSale(page, 'Offline sale', 5)
  await expect(page.getByText('Offline sale').first()).toBeVisible()
  await expect(page.getByTestId('header-balance')).toContainText('25,00')

  await context.setOffline(false)
  await expect.poll(() => api.posted.length).toBe(2)
  await expect(page.getByText(/\d+ pending/)).toHaveCount(0)
  await expect(page.getByTestId('header-balance')).toContainText('25,00')
  await expect(page.getByText('Offline sale')).toHaveCount(1)
  expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY))).toHaveLength(2)
})

test('the balance is still shown after a reload without a server', async ({ page, api }) => {
  await api.mockTransactions()
  api.db.budget_tracker_transactions.push(serverRecord('srv000000000001', 'Booth sale', 20))
  await gotoReady(page, '/')
  await expect(page.getByTestId('header-balance')).toContainText('20,00')

  // The dev server cannot be reloaded while the browser is offline, so the transactions endpoint fails instead
  api.failReads('budget_tracker_transactions', 500)
  await page.reload()
  await expect(page.getByTestId('header-balance')).toContainText('20,00')
  await expect(page.getByText('Booth sale').first()).toBeVisible()
})

test.describe('local entries that are not on the server', () => {
  const lonely = { id: 111, recordId: 'loc000000000001', description: 'Lost sale', amount: 7, date: '2026-10-11', notes: '' }

  test('are listed in Settings and flagged on the dashboard', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/')
    await expect(page.getByText('1 local entry is not on the server', { exact: false })).toBeVisible()
    // They no longer count towards the shared balance
    await expect(page.getByTestId('header-balance')).toContainText('0,00')

    await page.getByRole('link', { name: /review in Settings/ }).click()
    await page.waitForURL(url => url.pathname === '/settings')
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toBeVisible()
    await expect(page.getByText('Lost sale')).toBeVisible()
  })

  test('Upload posts the entry and removes it', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/settings#data')
    await expect(page.getByText('Lost sale')).toBeVisible()
    await page.getByRole('button', { name: 'Upload' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    // The upload keeps the sale's own day instead of moving it to today
    expect(api.posted[0]).toMatchObject({ description: 'Lost sale', amount: 7, date: lonely.date })
    expect(api.posted[0].id).not.toBe(lonely.recordId)
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toHaveCount(0)

    await gotoReady(page, '/')
    await expect(page.getByText('not on the server')).toHaveCount(0)
    await expect(page.getByTestId('header-balance')).toContainText('7,00')
    await expect.poll(async () => (await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), STORAGE_KEY)).map(t => t.date)).toEqual([lonely.date])
  })

  test('Upload keeps a card sale\'s own id, so it can never become a second sale', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [{ id: 1, recordId: 'pay000000000060', description: 'Card sale', amount: 9, date: '2026-10-12', notes: '', payment_method: 'card', sumup_transaction: 'TXORPHAN' }])
    await gotoReady(page, '/settings#data')
    await page.getByRole('button', { name: 'Upload' }).click()
    await expect.poll(() => api.posted.map(sale => [sale.id, sale.payment_method, sale.sumup_transaction])).toEqual([['pay000000000060', 'card', 'TXORPHAN']])
  })

    test('a double tap on Upload posts the entry once', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/settings#data')
    await expect(page.getByText('Lost sale')).toBeVisible()
    await page.getByRole('button', { name: 'Upload' }).dblclick()

    await expect.poll(() => api.posted.length).toBe(1)
    await page.waitForTimeout(1000)
    expect(transactionPosts(api)).toHaveLength(1)
    expect(api.posted).toHaveLength(1)
  })

  test('disappear once their record id shows up on the server; old-app entries stay for review', async ({ page, api, context }) => {
    await api.mockTransactions()
    // One is known by its record id; one is from the old app and has none, so a look-alike record never removes it
    const legacy = { id: 222, description: 'Old stand sale', amount: 4, date: '2026-07-09', notes: '' }
    await seedOrphans(context, [lonely, legacy])
    await gotoReady(page, '/')
    await expect(page.getByText('2 local entries are not on the server', { exact: false })).toBeVisible()

    api.db.budget_tracker_transactions.push(
      serverRecord(lonely.recordId, 'Lost sale', 7, '2026-10-11 10:00:00.000Z'),
      serverRecord('srv000000000009', 'Old stand sale', 4, '2026-07-11 08:00:00.000Z')
    )
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await expect(page.getByText('1 local entry is not on the server', { exact: false })).toBeVisible()
    await expect(page.getByTestId('header-balance')).toContainText('11,00')

    await gotoReady(page, '/settings#data')
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toBeVisible()
    await expect(page.getByText('Old stand sale')).toBeVisible()
    await expect(page.getByText('Lost sale')).toHaveCount(0)
    expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), ORPHANS_KEY)).map(o => o.id)).toEqual([222])
  })

  test('uploading one of two identical old-app entries keeps the other', async ({ page, api, context }) => {
    await api.mockTransactions()
    const first = { id: 301, description: 'Keychain', amount: 5, date: '2026-10-10', notes: '' }
    const second = { id: 302, description: 'Keychain', amount: 5, date: '2026-10-10', notes: '' }
    await seedOrphans(context, [first, second])
    await gotoReady(page, '/settings#data')
    await expect(page.getByRole('button', { name: 'Upload' })).toHaveCount(2)

    await page.getByRole('button', { name: 'Upload' }).first().click()
    await expect.poll(() => api.posted.length).toBe(1)
    // A later refresh sees the uploaded twin on the server with the same date
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(1000)
    await expect(page.getByRole('button', { name: 'Upload' })).toHaveCount(1)
    expect((await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), ORPHANS_KEY)).map(o => o.id)).toEqual([302])
  })

  test('are included in the JSON and CSV export', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    // A sale the server keeps refusing stays queued
    api.fail('budget_tracker_transactions', 500)
    await context.addInitScript(() => {
      if (sessionStorage.getItem('queue-seeded')) return
      localStorage.setItem('budget-tracker-offline-queue', JSON.stringify([
        { id: 5, recordId: 'que000000000005', description: 'Unsent sale', amount: 3, date: '2026-10-14', notes: '', status: 'failed', queuedAt: '2026-10-14T10:00:00.000Z' }
      ]))
      sessionStorage.setItem('queue-seeded', '1')
    })
    await gotoReady(page, '/settings#data')
    await expect(page.getByText('Lost sale')).toBeVisible()

    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export as JSON' }).click()])
    expect(json.suggestedFilename()).toMatch(/^akinai-export-\d{4}-\d{2}-\d{2}\.json$/)
    const exported = JSON.parse(readFileSync(await json.path(), 'utf8'))
    expect(exported.orphans).toEqual([lonely])

    const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export as CSV' }).click()])
    expect(csv.suggestedFilename()).toMatch(/^akinai-transactions-\d{4}-\d{2}-\d{2}\.csv$/)
    const lines = readFileSync(await csv.path(), 'utf8').split('\n')
    expect(lines.find(line => line.includes('Lost sale'))).toBe('"111","Lost sale","7","2026-10-11","","not on server"')
    expect(lines.find(line => line.includes('Unsent sale'))).toBe('"5","Unsent sale","3","2026-10-14","","waiting to sync"')
  })
  test('Discard removes the entry after confirmation', async ({ page, api, context }) => {
    await api.mockTransactions()
    await seedLocal(context, [lonely])
    await gotoReady(page, '/settings#data')
    await page.getByRole('button', { name: 'Discard' }).click()
    // Cancelling keeps it
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText('Lost sale')).toBeVisible()

    await page.getByRole('button', { name: 'Discard' }).click()
    await page.getByRole('dialog').getByRole('button', { name: 'Discard' }).click()
    await expect(page.getByRole('heading', { name: 'Local entries not on the server' })).toHaveCount(0)
    expect(api.posted).toHaveLength(0)
    expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]'), ORPHANS_KEY)).toHaveLength(0)

    await gotoReady(page, '/')
    await expect(page.getByText('not on the server')).toHaveCount(0)
  })
})

test('a sale queued offline yesterday keeps its date after syncing', async ({ page, api, context }) => {
  await api.mockTransactions()
  await context.addInitScript(() => {
    if (sessionStorage.getItem('queue-seeded')) return
    const d = new Date(Date.now() - 86_400_000)
    const yesterday = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    const sale = { id: 1, recordId: 'queued000000001', description: 'Late night sale', amount: 6, notes: '', date: yesterday }
    localStorage.setItem('budget-tracker-transactions', JSON.stringify([sale]))
    localStorage.setItem('budget-tracker-offline-queue', JSON.stringify([{ ...sale, status: 'pending', queuedAt: d.toISOString() }]))
    sessionStorage.setItem('queue-seeded', '1')
  })
  await gotoReady(page, '/')
  const yesterday = await page.evaluate(() => {
    const d = new Date(Date.now() - 86_400_000)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })

  await expect.poll(() => api.posted.length).toBe(1)
  expect(api.posted[0]).toMatchObject({ id: 'queued000000001', date: yesterday })
  await expect.poll(() => page.evaluate(key => JSON.parse(localStorage.getItem(key) || '[]').map(t => `${t.recordId}@${t.date}`), STORAGE_KEY))
    .toEqual([`queued000000001@${yesterday}`])
  await expect(page.getByTestId('header-balance')).toContainText('6,00')
})

test('a sale whose connection drops mid-send is queued and counted once', async ({ page, api, context }) => {
  await api.mockTransactions()
  await gotoReady(page, '/')

  // The server stores the sale, then the connection goes away before the reply arrives
  let dropped = false
  await page.route('**/api/collections/budget_tracker_transactions/records', async (route) => {
    if (route.request().method() !== 'POST' || dropped) return route.fallback()
    dropped = true
    await context.setOffline(true)
    api.fail('budget_tracker_transactions', 'drop')
    await route.fallback()
  })
  await addSale(page, 'Dropped sale', 9)
  await expect.poll(() => dropped).toBe(true)
  await expect(page.getByText('1 pending')).toBeVisible()
  expect((await page.evaluate(() => JSON.parse(localStorage.getItem('budget-tracker-offline-queue') || '[]'))).map(item => item.description)).toEqual(['Dropped sale'])

  await context.setOffline(false)
  await expect(page.getByText(/\d+ pending/)).toHaveCount(0)
  await expect(page.getByTestId('header-balance')).toContainText('9,00')
  expect(api.posted).toHaveLength(1)
  await expect(page.getByText('Dropped sale')).toHaveCount(1)
})

test('an old queued sale without a record id is posted once even when a reply is lost', async ({ page, api, context }) => {
  await api.mockTransactions()
  // Queued by a build from before record ids: no recordId on the item or the local entry
  await context.addInitScript(() => {
    if (sessionStorage.getItem('legacy-queue-seeded')) return
    const sale = { id: 1700000000000, description: 'Old queued sale', amount: 8, notes: '', date: '2026-10-13' }
    localStorage.setItem('budget-tracker-transactions', JSON.stringify([sale]))
    localStorage.setItem('budget-tracker-offline-queue', JSON.stringify([{ ...sale, status: 'pending', queuedAt: '2026-10-13T10:00:00.000Z' }]))
    sessionStorage.setItem('legacy-queue-seeded', '1')
  })
  // The first send is stored by the server, but its reply is lost
  api.fail('budget_tracker_transactions', 'drop')
  await gotoReady(page, '/')
  await expect.poll(() => api.posted.length).toBe(1)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('budget-tracker-offline-queue') || '[]')[0]?.status)).toBe('failed')
  // Still listed and counted while it waits
  await expect(page.getByText('Old queued sale')).toHaveCount(1)

  // The retry (the connection comes back)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByText(/\d+ pending/)).toHaveCount(0)
  expect(api.posted).toHaveLength(1)
  await expect(page.getByTestId('header-balance')).toContainText('8,00')
  await expect(page.getByText('Old queued sale')).toHaveCount(1)
  await expect(page.getByText('not on the server')).toHaveCount(0)
})
