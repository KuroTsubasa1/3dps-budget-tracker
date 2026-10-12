import { test, expect, gotoReady } from './fixtures.js'

const rows = page => page.getByRole('list', { name: 'Categories' }).getByRole('listitem')
const editor = page => page.getByRole('dialog')

test.describe('categories', () => {
  test.beforeEach(async ({ page, api }) => {
    api.seed({ articles: [{ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain' }] })
    await gotoReady(page, '/settings#categories')
  })

  test('lists categories in order with their base prices', async ({ page }) => {
    await expect(rows(page)).toHaveCount(3)
    await expect(rows(page).nth(0)).toContainText('Big Figure')
    await expect(rows(page).nth(0)).toContainText('30,00')
    await expect(rows(page).nth(1)).toContainText('Keychain')
  })

  test('adding a category puts it last', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Add category' }).click()
    await editor(page).getByLabel('Name').fill('Sticker')
    await editor(page).getByLabel('Base price').fill('2,50')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(rows(page).nth(3)).toContainText('Sticker')
    expect(api.db.categories.find(c => c.name === 'Sticker')).toMatchObject({ base_price: 2.5, sort_order: 3 })
  })

  test('repricing a category', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Keychain' }).click()
    await editor(page).getByLabel('Base price').fill('5')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(rows(page).nth(1)).toContainText('5,00')
    expect(api.db.categories.find(c => c.name === 'Keychain').base_price).toBe(5)
  })

  test('moving a category up swaps the order', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Move Keychain up' }).click()
    await expect(rows(page).nth(0)).toContainText('Keychain')
    const order = [...api.db.categories].sort((a, b) => a.sort_order - b.sort_order).map(c => c.name)
    expect(order.slice(0, 2)).toEqual(['Keychain', 'Big Figure'])
  })

  test('a category in use cannot be deleted', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Keychain' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Move the 1 Keychain article first')
    expect(api.db.categories).toHaveLength(3)
  })

  test('an unused category can be deleted', async ({ page, api }) => {
    await page.getByRole('button', { name: 'Edit Coaster' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(rows(page)).toHaveCount(2)
    expect(api.db.categories.map(c => c.name)).not.toContain('Coaster')
  })

  test('a category used by hidden articles explains why it cannot be deleted', async ({ page, api }) => {
    api.db.budget_tracket_catalog.push({ id: 'h1', name: 'Old Coaster', category: 'cat-coaster', active: false })
    await page.getByRole('button', { name: 'Edit Coaster' }).click()
    await editor(page).getByRole('button', { name: 'Delete category' }).click()
    await editor(page).getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('Deleted articles still use this category, so it has to stay.')
    expect(api.db.categories).toHaveLength(3)
  })

  test('a duplicate name is rejected before saving', async ({ page }) => {
    await page.getByRole('button', { name: 'Add category' }).click()
    await editor(page).getByLabel('Name').fill('keychain')
    await editor(page).getByLabel('Base price').fill('3')
    await editor(page).getByRole('button', { name: 'Save' }).click()
    await expect(editor(page).getByRole('alert')).toHaveText('A category with this name already exists')
  })
})
