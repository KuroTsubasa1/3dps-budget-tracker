// One shop history for the report tests. Times are built with the local Date constructor, so the
// days and hours read the same in every time zone; PocketBase stamps are derived from them.
// "Now" is Wednesday 14 October 2026, 13:00 local.
const DAY_MS = 86_400_000

export const NOW = new Date(2026, 9, 14, 13, 0)
export const at = (month, day, hour = 10, minute = 0) => new Date(2026, month - 1, day, hour, minute)
const stamp = date => date.toISOString().replace('T', ' ')
const pad = value => String(value).padStart(2, '0')
const dayOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

export const CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 },
  { id: 'cat-coaster', name: 'Coaster', base_price: 8, sort_order: 2 }
]

const withCategory = article =>
  ({ price: 0, active: true, ...article, expand: { category: CATEGORIES.find(category => category.id === article.category) } })

export const ARTICLES = [
  withCategory({ id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 10 }),
  withCategory({ id: 'f1', name: 'Glurak Figure', category: 'cat-figure', stock: 3 }),
  // Its own price overrides the category's
  withCategory({ id: 'c1', name: 'Moon Coaster', category: 'cat-coaster', price: 9.5, stock: 0 }),
  // Never sold
  withCategory({ id: 'n1', name: 'Night Lamp', category: 'cat-figure', stock: 2 }),
  withCategory({ id: 'old1', name: 'Retired Dino', category: 'cat-figure', stock: 4, active: false })
]

export const KEYCHAIN_DEAL = { id: 'deal-keychain', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }

const article = id => ARTICLES.find(item => item.id === id)
export const line = (id, quantity, unitPrice, discount = 0, deal = null) => ({
  article: id,
  name: article(id).name,
  category: article(id).category,
  categoryName: article(id).expand.category.name,
  quantity,
  unitPrice,
  lineTotal: unitPrice * quantity,
  discount,
  deal: deal?.id ?? '',
  dealName: deal?.name ?? ''
})

// A transaction as fromRecord keeps it: the local day, the server's created stamp, and lines when it has them
const sale = (id, created, amount, extra = {}) =>
  ({ id, recordId: id, description: `Sale ${id}`, amount, notes: '', date: dayOf(created), created: stamp(created), ...extra })

export const TRANSACTIONS = [
  // Before line data: no items
  sale('t1', at(9, 20), 48),
  sale('t2', at(10, 2), 12),
  sale('t3', at(10, 5, 9), -20, { description: 'Filament' }),
  // The first sale with lines reached the server at 14:01 on 10 October
  sale('t4', at(10, 10, 14, 1), 37, { sold_at: at(10, 10, 14).toISOString(), items: [line('f1', 1, 30), line('k1', 2, 4, 1, KEYCHAIN_DEAL)] }),
  sale('t5', at(10, 14, 10, 31), 37, { sold_at: at(10, 14, 10, 30).toISOString(), items: [line('k1', 2, 4, 1, KEYCHAIN_DEAL), line('f1', 1, 30)] }),
  sale('t6', at(10, 14, 11, 11), 4, { sold_at: at(10, 14, 11, 10).toISOString(), items: [line('k1', 1, 4)] }),
  // Synced before the server had sold_at: its hour comes from created
  sale('t7', at(10, 14, 12, 5), 19, { items: [line('c1', 2, 9.5)] }),
  // Queued on this device by the old app: no created, no sold_at, no lines
  { id: 8, description: 'Cash tip', amount: 5, notes: '', date: '2026-10-14' }
]

const movement = (id, articleId, change, reason, created, extra = {}) =>
  ({ id, article: articleId, change, reason, note: '', created: stamp(created), ...extra })

export const MOVEMENTS = [
  // Older sales (before 10 October 14:01)
  movement('m1', 'k1', -3, 'sale', at(10, 2, 10, 1)),
  movement('m2', 'c1', 0, 'sale', at(10, 2, 10, 2), { note: 'oversold by 2' }),
  // An article deleted since: its name comes from the expanded relation
  movement('m13', 'gone', -1, 'sale', at(10, 3, 11), { expand: { article: { id: 'gone', name: 'Lost Lamp', category: 'cat-figure' } } }),
  movement('m10', 'k1', 10, 'correction', at(10, 3)),
  movement('m11', 'old1', -1, 'sale', at(9, 1)),
  movement('m12', 'f1', -1, 'sale', at(9, 16)),
  // The stock side of the sales with lines
  movement('m3', 'f1', -1, 'sale', at(10, 10, 14, 2)),
  movement('m4', 'k1', -2, 'sale', at(10, 10, 14, 2)),
  movement('m5', 'f1', 2, 'printed', at(10, 12, 9)),
  movement('m6', 'k1', -2, 'sale', at(10, 14, 10, 32)),
  movement('m7', 'f1', -1, 'sale', at(10, 14, 10, 32)),
  movement('m8', 'k1', -1, 'sale', at(10, 14, 11, 12)),
  movement('m9', 'c1', 0, 'sale', at(10, 14, 12, 6), { note: 'oversold by 2' })
]

const commission = (id, status, price, extra = {}) =>
  ({ id, status, agreed_price: price, created: stamp(at(10, 1)), delivered_at: '', ...extra })
// created is a fixed span before delivery in milliseconds, so the average days hold in every zone
const delivered = (id, price, deliveredAt, days) =>
  commission(id, 'delivered', price, { delivered_at: deliveredAt.toISOString(), created: stamp(new Date(deliveredAt.getTime() - days * DAY_MS)) })

export const COMMISSIONS = [
  commission('c1', 'open', 25),
  commission('c2', 'printing', 15),
  commission('c3', 'ready', 10),
  delivered('c4', 30, at(10, 11), 10),
  delivered('c5', 20, at(10, 12, 0), 7.5),
  delivered('c6', 40, at(9, 20), 3),
  commission('c7', 'cancelled', 99)
]
