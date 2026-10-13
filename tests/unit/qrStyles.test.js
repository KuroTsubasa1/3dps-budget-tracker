import { test } from 'node:test'
import assert from 'node:assert/strict'
import { qrOptionsFor, QR_THEMES } from '../../utils/qrStyles.js'

const base = {
  width: 300,
  image: 'data:image/png;base64,OURLOGO',
  dotsOptions: { type: 'square', color: '#6a1a4c', gradient: { type: 'linear', rotation: 1.57, colorStops: [{ offset: 0, color: '#619942' }, { offset: 1, color: '#567f3d' }] } },
  cornersSquareOptions: { type: 'square', color: '#000000', gradient: null }
}

test('the website keeps the green gradient and our logo', () => {
  assert.deepEqual(qrOptionsFor('website', base), base)
})

test('each platform gets its own colour and icon', () => {
  const expected = { etsy: ['#e8601c', '#c24e14'], instagram: ['#d6246e', '#a82a8a'], paypal: ['#0070ba', '#003087'] }
  for (const [platform, [from, to]] of Object.entries(expected)) {
    const options = qrOptionsFor(platform, base)
    assert.deepEqual(options.dotsOptions.gradient.colorStops, [{ offset: 0, color: from }, { offset: 1, color: to }], platform)
    assert.equal(options.dotsOptions.gradient.rotation, base.dotsOptions.gradient.rotation, platform)
    assert.equal(options.image, QR_THEMES[platform].image, platform)
    assert.match(options.image, /^data:image\/svg\+xml,/, platform)
    assert.equal(options.cornersSquareOptions.color, '#000000', platform)
  }
})

test('the shared options are never changed', () => {
  const before = JSON.stringify(base)
  qrOptionsFor('etsy', base)
  assert.equal(JSON.stringify(base), before)
})

test('an unknown platform falls back to the website style', () => {
  assert.deepEqual(qrOptionsFor('myspace', base), base)
})
