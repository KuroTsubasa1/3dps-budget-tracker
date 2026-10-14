import { test } from 'node:test'
import assert from 'node:assert/strict'
import { APP_NAME, APP_URL, movedTo } from '../../utils/branding.js'

test('the app is called Akinai and lives at akinai.lasseharm.space', () => {
  assert.equal(APP_NAME, 'Akinai')
  assert.equal(APP_URL, 'https://akinai.lasseharm.space')
})

test('the old address points to the new one, every other host stays', () => {
  assert.equal(movedTo('budget-tracker.lasseharm.space'), 'https://akinai.lasseharm.space')
  assert.equal(movedTo('akinai.lasseharm.space'), null)
  assert.equal(movedTo('localhost'), null)
  assert.equal(movedTo(''), null)
})
