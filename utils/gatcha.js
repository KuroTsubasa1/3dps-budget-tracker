// Gatcha prizes. See docs/superpowers/specs/2026-10-14-gatcha-stock-push-design.md
// A gatcha is an article with prize categories. Its buyer takes one prize article from those categories
// per unit; the prize's stock goes down, the gatcha's own stock is never touched.
export const PRIZE_NOTE = 'Gatcha prize'
export const UNDO_NOTE = 'Gatcha prize undone'
// On this device until picked: the open prizes, and the prize movements still waiting to reach the server
export const OPEN_PRIZES_KEY = 'akinai-gatcha-open'
export const PRIZE_OUTBOX_KEY = 'akinai-gatcha-outbox'

export const NO_PRIZES = Object.freeze({ count: 0, categories: Object.freeze([]) })

const unique = list => [...new Set(list)]

// PocketBase returns an empty multi-relation as [], an older record has no field at all
export const prizeCategoriesOf = article =>
  (Array.isArray(article?.prize_categories) ? article.prize_categories.filter(id => typeof id === 'string' && id) : [])

export const isGatcha = article => prizeCategoriesOf(article).length > 0

// The prizes a cart owes: one per gatcha unit, from the union of its gatchas' prize categories
export function prizesFor (cart) {
  const gatchas = cart.filter(item => isGatcha(item) && Number(item.quantity) > 0)
  return {
    count: gatchas.reduce((sum, item) => sum + Number(item.quantity), 0),
    categories: unique(gatchas.flatMap(prizeCategoriesOf))
  }
}

// A later checkout adds to the open prizes. Once none are open, its categories replace the old ones.
export function addPrizes (open, more) {
  if (!more.count) return open
  if (!open.count) return { count: more.count, categories: [...more.categories] }
  return { count: open.count + more.count, categories: unique([...open.categories, ...more.categories]) }
}

// Picking one prize lowers the count; the categories stay, so an Undo can bring the prize back
export const takePrize = open => ({ count: Math.max(0, open.count - 1), categories: open.categories })
export const returnPrize = open => ({ count: open.count + 1, categories: open.categories })

const byName = (a, b) => String(a.name).localeCompare(String(b.name))

// What a prize can be: an active article in stock from the open prize categories, never a gatcha.
// Grouped by category in the categories' own order, each group sorted by name; `query` filters by name.
export function prizeChoices ({ articles, categories, prizeCategories, query = '' }) {
  const wanted = new Set(prizeCategories)
  const text = String(query).trim().toLowerCase()
  const available = articles.filter(article =>
    article.active !== false &&
    Number(article.stock) > 0 &&
    wanted.has(article.category) &&
    !isGatcha(article) &&
    (!text || String(article.name).toLowerCase().includes(text)))
  return categories
    .filter(category => wanted.has(category.id))
    .map(category => ({ category, articles: available.filter(article => article.category === category.id).sort(byName) }))
    .filter(group => group.articles.length)
}

// The ids are made on the device, so a resend after a lost reply is recognised (like the checkout's movements)
export const prizeMovement = (id, article) => ({ id, article, change: -1, reason: 'sale', note: PRIZE_NOTE })
export const undoMovement = (id, article) => ({ id, article, change: 1, reason: 'correction', note: UNDO_NOTE })

// Undo before the pick left the device takes it out of the outbox. Once it was sent, or is on its way,
// a +1 correction balances it; it queues behind the pick, so it never reaches the server first.
export function undoPick (outbox, pick, { sending = false, id }) {
  if (!sending && outbox.some(movement => movement.id === pick.id)) return outbox.filter(movement => movement.id !== pick.id)
  return [...outbox, undoMovement(id, pick.article)]
}

const isCount = value => Number.isInteger(value) && value >= 0
const isMovement = movement => !!movement && typeof movement.id === 'string' && typeof movement.article === 'string' &&
  (movement.tried === undefined || typeof movement.tried === 'boolean') &&
  ((movement.change === -1 && movement.reason === 'sale' && movement.note === PRIZE_NOTE) ||
    (movement.change === 1 && movement.reason === 'correction' && movement.note === UNDO_NOTE))

// A full, blocked or garbled storage only costs what this device kept
export function readOpenPrizes (storage) {
  try {
    const stored = JSON.parse(storage.getItem(OPEN_PRIZES_KEY) || 'null')
    if (!stored || !isCount(stored.count) || !Array.isArray(stored.categories)) return NO_PRIZES
    return { count: stored.count, categories: stored.categories.filter(id => typeof id === 'string' && id) }
  } catch {
    return NO_PRIZES
  }
}

export function writeOpenPrizes (storage, open) {
  try {
    if (open.count > 0) storage.setItem(OPEN_PRIZES_KEY, JSON.stringify({ count: open.count, categories: open.categories }))
    else storage.removeItem(OPEN_PRIZES_KEY)
  } catch {}
}

export function readOutbox (storage) {
  try {
    const stored = JSON.parse(storage.getItem(PRIZE_OUTBOX_KEY) || '[]')
    return Array.isArray(stored) ? stored.filter(isMovement) : []
  } catch {
    return []
  }
}

export function writeOutbox (storage, outbox) {
  try {
    if (outbox.length) storage.setItem(PRIZE_OUTBOX_KEY, JSON.stringify(outbox))
    else storage.removeItem(PRIZE_OUTBOX_KEY)
  } catch {}
}

// Logging out drops the open prizes; the outbox stays, like queued sales, unless everything is cleared
export function forgetPrizes (storage, { keepOutbox = true } = {}) {
  try {
    storage.removeItem(OPEN_PRIZES_KEY)
    if (!keepOutbox) storage.removeItem(PRIZE_OUTBOX_KEY)
  } catch {}
}
