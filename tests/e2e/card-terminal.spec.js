import { test, expect, gotoReady } from './fixtures.js'

// Settings → Card terminal against the faked /api/card/* routes (api.card): SumUp is never contacted
// The BaseCard (the page's own <section id="card"> holds it too)
const section = page => page.locator('section.card', { has: page.getByRole('heading', { name: 'Card terminal', exact: true }) })

test.describe('Settings → Card terminal', () => {
  test('without SumUp on the server it says so', async ({ page, api }) => {
    api.enable()
    await gotoReady(page, '/settings#card')
    await expect(section(page)).toContainText("Card payments aren't configured on the server")
    await expect(section(page).getByLabel('Pairing code')).toHaveCount(0)
  })

  test('pairing sends the code, then shows the Solo; Unpair brings the code field back', async ({ page, api }) => {
    api.enable()
    api.card.configured = true
    await gotoReady(page, '/settings#card')
    const card = section(page)
    await card.getByLabel('Pairing code').fill('ab12cd34')
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(page.getByText('Terminal paired')).toBeVisible()
    expect(api.card.pairs).toEqual([{ code: 'ab12cd34' }])
    await expect(card.getByTestId('card-reader-name')).toHaveText('Akinai')
    await expect(card.getByTestId('card-reader-status')).toHaveText('Status unknown')

    // SumUp's status on the next visit
    await page.reload()
    await page.locator('html[data-hydrated]').waitFor({ state: 'attached' })
    await expect(section(page).getByTestId('card-reader-status')).toHaveText('Online')

    await section(page).getByRole('button', { name: 'Unpair' }).click()
    await expect(section(page).getByText('Unpair the terminal?')).toBeVisible()
    expect(api.card.unpairs).toBe(0)
    await section(page).getByRole('button', { name: 'Cancel' }).click()
    await expect(section(page).getByText('Unpair the terminal?')).toHaveCount(0)
    await section(page).getByRole('button', { name: 'Unpair' }).click()
    await section(page).getByRole('button', { name: 'Unpair', exact: true }).last().click()
    await expect(page.getByText('Terminal unpaired')).toBeVisible()
    expect(api.card.unpairs).toBe(1)
    await expect(section(page).getByLabel('Pairing code')).toBeVisible()
  })

  test('an empty code is refused here, a wrong one with the server\'s message', async ({ page, api }) => {
    api.enable()
    api.card.configured = true
    await gotoReady(page, '/settings#card')
    const card = section(page)
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(card.getByRole('alert')).toHaveText('Enter the code the Solo shows')
    expect(api.card.pairs).toEqual([])

    api.card.pairStatus = 400
    api.card.message = "That code didn't work. Start pairing on the Solo again and enter the new code."
    await card.getByLabel('Pairing code').fill('ZZZZ9999')
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(card.getByRole('alert')).toHaveText("That code didn't work. Start pairing on the Solo again and enter the new code.")
    await expect(card.getByLabel('Pairing code')).toHaveValue('ZZZZ9999')
  })

  test('an offline Solo shows Offline; offline the section needs a connection', async ({ page, api, context }) => {
    api.enable()
    api.pairTerminal()
    api.card.reader.status = 'offline'
    await gotoReady(page, '/settings#card')
    await expect(section(page).getByTestId('card-reader-status')).toHaveText('Offline')
    await context.setOffline(true)
    await expect(section(page)).toContainText('Needs a connection')
    await context.setOffline(false)
    await expect(section(page).getByTestId('card-reader-status')).toHaveText('Offline')
  })

  test('offline there is no pairing form and no Unpair', async ({ page, api, context }) => {
    api.enable()
    api.pairTerminal()
    await gotoReady(page, '/settings#card')
    await expect(section(page).getByTestId('card-reader-name')).toBeVisible()
    await context.setOffline(true)
    await expect(section(page)).toContainText('Needs a connection')
    await expect(section(page).getByRole('button', { name: 'Unpair' })).toHaveCount(0)
    await expect(section(page).getByLabel('Pairing code')).toHaveCount(0)
  })

  test('a logged-out token says to log in again, a failing server shows its message, then Try again works', async ({ page, api }) => {
    api.enable()
    api.card.configured = true
    api.card.message = 'SumUp is down'
    api.card.terminalStatus = 502
    await gotoReady(page, '/settings#card')
    const card = section(page)
    await expect(card.getByRole('alert')).toHaveText('SumUp is down')
    await expect(card.getByText('Loading the terminal...')).toHaveCount(0)
    api.card.terminalStatus = 200
    await card.getByRole('button', { name: 'Try again' }).click()
    await expect(card.getByLabel('Pairing code')).toBeVisible()
    await expect(card.getByRole('alert')).toHaveCount(0)

    api.card.pairStatus = 401
    await card.getByLabel('Pairing code').fill('AB12CD34')
    await card.getByRole('button', { name: 'Pair terminal' }).click()
    await expect(card.getByRole('alert')).toHaveText('Log in again to manage the terminal')
  })
})
