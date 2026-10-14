import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NAV_ITEMS, PHONE_TABS, MORE_ITEMS, isActivePath, isMoreActive } from '../../utils/navigation.js'

test('the menu has eight entries in order, four phone tabs and four under More', () => {
  assert.deepEqual(NAV_ITEMS.map(item => item.label), ['Dashboard', 'Catalog', 'Commissions', 'Print board', 'Calendar', 'Reports', 'Business Card', 'Settings'])
  assert.deepEqual(PHONE_TABS.map(item => item.shortLabel), ['Home', 'Catalog', 'Commissions', 'Print'])
  assert.deepEqual(MORE_ITEMS.map(item => item.to), ['/calendar', '/reports', '/business-card', '/settings'])
  assert.deepEqual(NAV_ITEMS[4], { to: '/calendar', label: 'Calendar', shortLabel: 'Calendar', icon: 'calendar', phone: 'more' })
  assert.deepEqual(NAV_ITEMS.slice(2, 4), [
    { to: '/commissions', label: 'Commissions', shortLabel: 'Commissions', icon: 'clipboard', phone: 'tab' },
    { to: '/print-board', label: 'Print board', shortLabel: 'Print', icon: 'printer', phone: 'tab' }
  ])
})

test('More is active on its own pages only', () => {
  for (const path of ['/calendar', '/reports', '/business-card', '/settings']) assert.equal(isMoreActive(path), true, path)
  for (const path of ['/', '/catalog', '/commissions', '/print-board', '/login']) assert.equal(isMoreActive(path), false, path)
  assert.equal(isActivePath('/', '/'), true)
  assert.equal(isActivePath('/catalog', '/'), false)
})
