import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectivePrice } from '../../utils/pricing.js'

const keychain = { base_price: 4 }

test('article price above 0 overrides the category', () => {
  assert.equal(effectivePrice({ price: 6 }, keychain), 6)
})

test('price 0 or missing falls back to the category base price', () => {
  assert.equal(effectivePrice({ price: 0 }, keychain), 4)
  assert.equal(effectivePrice({}, keychain), 4)
})

test('no category and no price is 0', () => {
  assert.equal(effectivePrice({ price: 0 }, undefined), 0)
})
