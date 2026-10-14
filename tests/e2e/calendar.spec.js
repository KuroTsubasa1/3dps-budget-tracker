import { test, expect, gotoReady } from './fixtures.js'
import { CALENDAR_TIMEZONE, CALENDAR_NOW, CONNICHI, DOKOMI, HANAMI, convention, openCalendar, sheet } from './calendar-data.js'

// Wednesday 14 October 2026, 13:00 in Berlin; the data is in tests/e2e/calendar-data.js
test.use({ timezoneId: CALENDAR_TIMEZONE })

const upcoming = page => page.getByTestId('upcoming')
const section = (page, title) => upcoming(page).locator('section', { has: page.getByRole('heading', { name: title, exact: true }) })
const remindersIn = page => sheet(page).getByRole('list', { name: 'Reminders' }).getByRole('listitem')
const openRow = (page, name) => upcoming(page).getByRole('button', { name: new RegExp(`^${name}`) }).click()
const stored = (api, id) => api.db.conventions.find(item => item.id === id)

test.describe('convention calendar', () => {
  test('creating a convention shows its reminders, and changing the dates moves them', async ({ page, api }) => {
    await openCalendar(page, api, { conventions: [] })
    await expect(page.getByText('No conventions yet. Add the first one with New convention.')).toBeVisible()
    await page.getByRole('button', { name: 'New convention' }).click()
    await sheet(page).getByLabel('Name', { exact: true }).fill('Dokomi')
    await sheet(page).getByLabel('Closes').fill('2026-10-30')
    // 09:00 local on both sides of the end of summer time (25 October)
    await expect(remindersIn(page)).toHaveText([
      /Applications close7 days before applications close · Fri 23 Oct, 09:00/,
      /Applications close1 day before applications close · Thu 29 Oct, 09:00/
    ])
    await sheet(page).getByRole('button', { name: 'Create convention' }).click()
    await expect(page.getByText('Convention created')).toBeVisible()

    await expect.poll(() => api.db.conventions.length).toBe(1)
    const [created] = api.db.conventions
    expect(created).toMatchObject({ name: 'Dokomi', status: 'interested', applications_close: '2026-10-30', stand_fee: 0 })
    expect(created.reminders.map(item => [item.id, item.at, item.auto])).toEqual([
      ['auto-deadline-7', '2026-10-23T07:00:00.000Z', true],
      ['auto-deadline-1', '2026-10-29T08:00:00.000Z', true]
    ])

    await sheet(page).getByLabel('Closes').fill('2026-11-06')
    await expect(remindersIn(page)).toHaveText([/Fri 30 Oct, 09:00/, /Thu 5 Nov, 09:00/])
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => api.db.conventions[0].reminders.map(item => item.at)).toEqual(['2026-10-30T08:00:00.000Z', '2026-11-05T08:00:00.000Z'])
    await expect(upcoming(page)).toContainText('Applications close in 23 days')
  })

  test('an edited reminder stays put, a removed one stays gone and a custom one is added', async ({ page, api }) => {
    await openCalendar(page, api, { conventions: [convention('c1', { name: 'Dokomi', applications_close: '2026-10-30 00:00:00.000Z' })] })
    await openRow(page, 'Dokomi')
    await sheet(page).getByRole('button', { name: 'Edit Applications close' }).last().click()
    await sheet(page).getByLabel('Time', { exact: true }).fill('20:00')
    await sheet(page).getByRole('button', { name: 'Save reminder' }).click()
    await sheet(page).getByRole('button', { name: 'Remove Applications close' }).first().click()
    await sheet(page).getByRole('button', { name: 'Add reminder' }).click()
    await sheet(page).getByLabel('Remind me to').fill('Book the hotel')
    await sheet(page).getByLabel('Date', { exact: true }).fill('2026-10-20')
    await sheet(page).getByRole('button', { name: 'Add', exact: true }).click()
    await expect(remindersIn(page)).toHaveText([/Book the hotelCustom · Tue 20 Oct, 09:00/, /Applications closeEdited · Thu 29 Oct, 20:00/])

    // Moving the close date leaves the edited and the custom reminder alone and does not bring back the removed one
    await sheet(page).getByLabel('Closes').fill('2026-11-06')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => stored(api, 'c1').reminders.map(item => [item.id.startsWith('custom-') ? 'custom' : item.id, item.at, !!item.removed])).toEqual([
      ['custom', '2026-10-20T07:00:00.000Z', false],
      ['auto-deadline-7', '2026-10-23T07:00:00.000Z', true],
      ['auto-deadline-1', '2026-10-29T19:00:00.000Z', false]
    ])
    expect(stored(api, 'c1').reminders.find(item => item.id.startsWith('custom-')).text).toBe('Book the hotel')
  })

  test('the status buttons save at once and swap the reminders', async ({ page, api }) => {
    await openCalendar(page, api)
    await openRow(page, 'Connichi')
    // The 7-day reminder (14 Oct, 09:00) has already passed and is not added
    await expect(remindersIn(page)).toHaveText([/Tue 20 Oct, 09:00/])
    await sheet(page).getByRole('button', { name: 'Mark applied' }).click()
    await expect.poll(() => stored(api, CONNICHI.id).status).toBe('applied')
    expect(stored(api, CONNICHI.id).reminders).toEqual([])
    await expect(sheet(page).getByRole('button', { name: 'Mark applied' })).toHaveCount(0)
    await expect(sheet(page).getByRole('button', { name: 'Rejected' })).toBeVisible()

    await sheet(page).getByRole('button', { name: 'Mark booked' }).click()
    await expect.poll(() => stored(api, CONNICHI.id).status).toBe('booked')
    expect(stored(api, CONNICHI.id).reminders.map(item => item.id)).toEqual(['auto-stock', 'auto-pack', 'auto-setup'])
    await expect(sheet(page).getByTestId('status-chip')).toHaveText('Booked')
    await expect(sheet(page).getByLabel('Status')).toHaveValue('booked')
  })

  test('booking needs both dates, and Rejected moves a convention to Past', async ({ page, api }) => {
    await openCalendar(page, api)
    await openRow(page, 'Hanami Fest')
    await sheet(page).getByRole('button', { name: 'Mark booked' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Add the start and end dates before booking')
    expect(stored(api, HANAMI.id).status).toBe('interested')

    // On phones the sheet covers the list: close it first (on larger screens Escape does nothing)
    await page.keyboard.press('Escape')
    await openRow(page, 'MegaCon')
    await sheet(page).getByRole('button', { name: 'Rejected' }).click()
    await expect.poll(() => stored(api, 'megacon00000001').status).toBe('rejected')
    await expect(upcoming(page).getByRole('button', { name: 'Past (3)' })).toBeVisible()
  })

  test('Mark fee paid books the stand fee as an expense dated today', async ({ page, api }) => {
    await openCalendar(page, api)
    await openRow(page, 'Dokomi')
    await expect(sheet(page).getByText(/Books 45,00\s€ as an expense dated today/)).toBeVisible()
    await sheet(page).getByRole('button', { name: 'Mark fee paid' }).click()

    await expect.poll(() => api.posted.length).toBe(1)
    const [expense] = api.posted
    expect(expense).toMatchObject({ description: 'Stand fee: Dokomi', amount: -45, date: '2026-10-14' })
    expect(stored(api, DOKOMI.id).fee_transaction).toBe(expense.id)
    expect(stored(api, DOKOMI.id).fee_paid_at).toBe(CALENDAR_NOW.toISOString())
    await expect(sheet(page).getByTestId('fee-paid')).toHaveText('Paid Wed 14 Oct')
    await expect(sheet(page).getByRole('button', { name: 'Mark fee paid' })).toHaveCount(0)
  })

  test('a fee already marked paid on another device is not booked twice', async ({ page, api }) => {
    await openCalendar(page, api)
    await openRow(page, 'Dokomi')
    // The other device got there first
    Object.assign(stored(api, DOKOMI.id), { fee_paid_at: '2026-10-14 09:00:00.000Z', fee_transaction: 'tx0000000000099' })
    await sheet(page).getByRole('button', { name: 'Mark fee paid' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('The fee was already marked paid on another device')
    await expect(sheet(page).getByTestId('fee-paid')).toHaveText('Paid Wed 14 Oct')
    expect(api.posted).toEqual([])
  })

  test('a reminder the server sent while the sheet was open stays sent when the owner saves', async ({ page, api }) => {
    const pending = { id: 'auto-deadline-1', kind: 'deadline', at: '2026-10-20T07:00:00.000Z', auto: true }
    await openCalendar(page, api, { conventions: [{ ...CONNICHI, reminders: [pending] }] })
    await openRow(page, 'Connichi')
    // The reminder job records it meanwhile
    stored(api, CONNICHI.id).reminders = [{ ...pending, sent_at: '2026-10-14T11:00:00.000Z' }]
    await sheet(page).getByLabel('City').fill('Wiesbaden (RMCC)')
    await sheet(page).getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => stored(api, CONNICHI.id).city).toBe('Wiesbaden (RMCC)')
    expect(stored(api, CONNICHI.id).reminders).toEqual([{ ...pending, sent_at: '2026-10-14T11:00:00.000Z' }])
  })

  test('Upcoming lists open applications, then the months, then a collapsed Past', async ({ page, api }) => {
    await openCalendar(page, api)
    await expect(upcoming(page).getByRole('heading', { level: 2 })).toHaveText(['Open applications', 'November 2026'])
    await expect(section(page, 'Open applications').getByRole('listitem')).toHaveText([
      /Connichi.*Applications close in 7 days/,
      /Hanami Fest.*Applications close in 48 days/
    ])
    // From 7 days on the deadline uses the warning colour
    await expect(section(page, 'Open applications').getByText('Applications close in 7 days')).toHaveClass(/text-warning/)
    await expect(section(page, 'Open applications').getByText('Applications close in 48 days')).not.toHaveClass(/text-warning/)
    await expect(section(page, 'November 2026').getByRole('listitem')).toHaveText([
      /Dokomi.*Sat 7 Nov – Sun 8 Nov · Messe, Düsseldorf.*Booked/,
      /MegaCon.*Results expected Tue 20 Oct.*Applied/
    ])
    const past = upcoming(page).getByRole('button', { name: 'Past (2)' })
    await expect(past).toHaveAttribute('aria-expanded', 'false')
    await expect(upcoming(page).getByRole('list', { name: 'Past conventions' })).toHaveCount(0)
    await past.click()
    await expect(upcoming(page).getByRole('list', { name: 'Past conventions' }).getByRole('listitem')).toHaveText([/Comic Con.*Rejected/, /Animagic.*Done/])
  })

  test('offline, the calendar shows the saved copy and every change needs a connection', async ({ page, api }) => {
    await openCalendar(page, api)
    await expect(section(page, 'November 2026')).toBeVisible()
    // The next load fails like a dropped connection: the saved copy stands in
    api.failReads('conventions', 'drop')
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect(page.getByTestId('saved-copy')).toHaveText(/Saved copy from Wed 14 Oct, 13:00/)
    await expect(section(page, 'November 2026').getByRole('listitem')).toHaveCount(2)
    await expect(page.getByRole('button', { name: 'New convention' })).toBeDisabled()
    await openRow(page, 'Dokomi')
    await expect(sheet(page).getByText('Needs a connection')).toBeVisible()
    await expect(sheet(page).getByLabel('Name', { exact: true })).toBeDisabled()
    await expect(sheet(page).getByRole('button', { name: 'Mark fee paid' })).toBeDisabled()
    await expect(sheet(page).getByRole('button', { name: 'Save changes' })).toBeDisabled()
  })

  test('the saved copy holds only the calendar fields, and logging out deletes it', async ({ page, api }) => {
    await openCalendar(page, api, { conventions: [{ ...DOKOMI, fee_paid_at: '2026-10-10 09:00:00.000Z', fee_transaction: 'tx0000000000001' }] })
    await expect(section(page, 'November 2026')).toBeVisible()
    const copy = await page.evaluate(() => JSON.parse(localStorage.getItem('akinai-conventions')))
    expect(copy.items.map(item => item.id)).toEqual([DOKOMI.id])
    expect(copy.items[0]).not.toHaveProperty('fee_transaction')
    expect(copy.items[0]).not.toHaveProperty('collectionName')
    await gotoReady(page, '/settings#api')
    await page.getByRole('button', { name: 'Log out' }).click()
    await page.waitForURL(url => url.pathname === '/login')
    expect(await page.evaluate(() => localStorage.getItem('akinai-conventions'))).toBeNull()
  })

  test('going offline with the calendar open makes it read-only', async ({ page, api, context }) => {
    await openCalendar(page, api)
    await openRow(page, 'Connichi')
    await context.setOffline(true)
    await expect(sheet(page).getByText('Needs a connection')).toBeVisible()
    await expect(sheet(page).getByRole('button', { name: 'Mark applied' })).toBeDisabled()
    await expect(sheet(page).getByRole('button', { name: 'Save changes' })).toBeDisabled()
    await context.setOffline(false)
  })

  test('a missing or locked collection says the calendar is not set up yet', async ({ page, api }) => {
    await openCalendar(page, api, { before: api => api.dropCollection('conventions') })
    await expect(page.getByText("The calendar isn't set up on the server yet")).toBeVisible()
    await expect(page.getByRole('button', { name: 'New convention' })).toHaveCount(0)

    api.db.conventions = []
    api.failReads('conventions', 403)
    await gotoReady(page, '/calendar')
    await expect(page.getByText("The calendar isn't set up on the server yet")).toBeVisible()
  })

  test('a failed save shows a toast and keeps the sheet open', async ({ page, api }) => {
    await openCalendar(page, api, { conventions: [] })
    api.fail('conventions', 500)
    await page.getByRole('button', { name: 'New convention' }).click()
    await sheet(page).getByLabel('Name', { exact: true }).fill('Dokomi')
    await sheet(page).getByRole('button', { name: 'Create convention' }).click()
    await expect(page.getByText('Could not save the convention. Check your connection and try again.')).toBeVisible()
    await expect(sheet(page).getByLabel('Name', { exact: true })).toHaveValue('Dokomi')
    expect(api.db.conventions).toEqual([])
  })

  test('a name is required', async ({ page, api }) => {
    await openCalendar(page, api, { conventions: [] })
    await page.getByRole('button', { name: 'New convention' }).click()
    await sheet(page).getByRole('button', { name: 'Create convention' }).click()
    await expect(sheet(page).getByRole('alert')).toHaveText('Enter a name')
    expect(api.db.conventions).toEqual([])
  })
})
