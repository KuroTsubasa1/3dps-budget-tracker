import { test } from 'node:test'
import assert from 'node:assert/strict'
import { wasCharged, rememberCharged, forgetCharged, CHARGED_KEY } from '../../utils/cardCharged.js'

const memory = () => {
  const data = new Map()
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) }
}

test('a charged payment is remembered, forgotten singly or all at once', () => {
  const storage = memory()
  assert.equal(wasCharged(storage, 'a'), false)
  rememberCharged(storage, 'a')
  rememberCharged(storage, 'b')
  assert.equal(wasCharged(storage, 'a'), true)
  forgetCharged(storage, 'a')
  assert.equal(wasCharged(storage, 'a'), false)
  assert.equal(wasCharged(storage, 'b'), true)
  forgetCharged(storage)
  assert.equal(storage.getItem(CHARGED_KEY), null)
})

test('broken or blocked storage is swallowed', () => {
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') }, removeItem: () => { throw new Error('blocked') } }
  assert.equal(wasCharged(broken, 'a'), false)
  assert.doesNotThrow(() => rememberCharged(broken, 'a'))
  assert.doesNotThrow(() => forgetCharged(broken))
  assert.equal(wasCharged({ getItem: () => 'not json' }, 'a'), false)
})
