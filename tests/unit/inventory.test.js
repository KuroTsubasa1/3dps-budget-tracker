import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  saleMovement,
  printedMovement,
  correctionMovement,
  stockFromMovements,
  stockStatus,
  newRecordId
} from '../../utils/inventory.js'

test('a sale within stock deducts the quantity', () => {
  assert.deepEqual(saleMovement(5, 2), { change: -2, reason: 'sale', note: '' })
})

test('an oversell deducts what is left and notes the rest', () => {
  assert.deepEqual(saleMovement(1, 3), { change: -1, reason: 'sale', note: 'oversold by 2' })
})

test('selling from empty stock records a zero change with the oversell note', () => {
  assert.deepEqual(saleMovement(0, 1), { change: 0, reason: 'sale', note: 'oversold by 1' })
})

test('printed counts must be whole numbers above 0', () => {
  assert.deepEqual(printedMovement(3), { change: 3, reason: 'printed', note: '' })
  assert.throws(() => printedMovement(0), /whole number above 0/)
  assert.throws(() => printedMovement(1.5), /whole number above 0/)
  assert.throws(() => printedMovement(NaN), /whole number above 0/)
})

test('a correction records the difference to the target', () => {
  assert.deepEqual(correctionMovement(5, 1, 'recount'), { change: -4, reason: 'correction', note: 'recount' })
  assert.deepEqual(correctionMovement(0, 3), { change: 3, reason: 'correction', note: '' })
})

test('a correction to the current count is not a movement', () => {
  assert.equal(correctionMovement(4, 4), null)
})

test('a correction target must be a whole number of 0 or more', () => {
  assert.throws(() => correctionMovement(4, -1), /0 or more/)
  assert.throws(() => correctionMovement(4, 2.5), /0 or more/)
})

test('stock is the sum of movements and never negative', () => {
  assert.equal(stockFromMovements([{ change: 5 }, { change: -2 }, { change: 0 }]), 3)
  assert.equal(stockFromMovements([{ change: 1 }, { change: -3 }]), 0)
  assert.equal(stockFromMovements([]), 0)
})

test('stock status uses the low-stock threshold', () => {
  assert.equal(stockStatus(0, 2), 'out')
  assert.equal(stockStatus(2, 2), 'low')
  assert.equal(stockStatus(3, 2), 'ok')
  assert.equal(stockStatus(1, 0), 'ok')
})

test('record ids are 15 lowercase alphanumerics and unique', () => {
  const ids = new Set(Array.from({ length: 200 }, newRecordId))
  assert.equal(ids.size, 200)
  for (const id of ids) assert.match(id, /^[a-z0-9]{15}$/)
})
