const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789'

// Sell what is left and note the rest; the sale itself is never blocked
export const saleMovement = (stock, quantity) => {
  const sold = Math.min(quantity, Math.max(0, stock))
  const oversold = quantity - sold
  // 0 - sold rather than -sold: negating 0 gives -0, which deepStrictEqual rejects against 0
  return { change: 0 - sold, reason: 'sale', note: oversold > 0 ? `oversold by ${oversold}` : '' }
}

export const printedMovement = (count) => {
  if (!Number.isInteger(count) || count <= 0) throw new Error('Printed count must be a whole number above 0')
  return { change: count, reason: 'printed', note: '' }
}

export const correctionMovement = (stock, target, note = '') => {
  if (!Number.isInteger(target) || target < 0) throw new Error('Stock count must be a whole number of 0 or more')
  const change = target - stock
  return change === 0 ? null : { change, reason: 'correction', note }
}

export const stockFromMovements = movements =>
  Math.max(0, movements.reduce((sum, movement) => sum + Number(movement.change), 0))

export const stockStatus = (stock, threshold) => {
  if (stock <= 0) return 'out'
  return stock <= threshold ? 'low' : 'ok'
}

// Client-side ids make retried creates detectable (PocketBase rejects a duplicate id)
export const newRecordId = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  return Array.from(bytes, byte => ID_ALPHABET[byte % ID_ALPHABET.length]).join('')
}
