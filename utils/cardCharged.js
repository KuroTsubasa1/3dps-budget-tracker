// The card payments this device charged (their record ids), kept on the device. Gatcha prizes go only to
// the device that started the charge, so a payment booked on another device books the sale without them.
export const CHARGED_KEY = 'akinai-card-charged'
const MAX_KEPT = 50

const read = (storage) => {
  try {
    const stored = JSON.parse(storage.getItem(CHARGED_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter(id => typeof id === 'string' && id) : []
  } catch {
    return []
  }
}

const write = (storage, ids) => {
  try {
    if (ids.length) storage.setItem(CHARGED_KEY, JSON.stringify(ids))
    else storage.removeItem(CHARGED_KEY)
  } catch {}
}

export const wasCharged = (storage, id) => read(storage).includes(id)
export const rememberCharged = (storage, id) => write(storage, [...read(storage).filter(item => item !== id), id].slice(-MAX_KEPT))
export const forgetCharged = (storage, id) => write(storage, id ? read(storage).filter(item => item !== id) : [])
