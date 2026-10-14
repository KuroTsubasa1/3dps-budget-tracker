import { gotoReady } from './fixtures.js'

// A shop history for the reports, seen on Wednesday 14 October 2026 at 13:00 in Berlin.
// Specs that assert figures run with `test.use({ timezoneId: REPORT_TIMEZONE })`.
export const REPORT_TIMEZONE = 'Europe/Berlin'
export const REPORT_NOW = new Date('2026-10-14T13:00:00+02:00')

const CATEGORIES = [
  { id: 'cat-keychain', name: 'Keychain', base_price: 4, sort_order: 0 },
  { id: 'cat-figure', name: 'Big Figure', base_price: 30, sort_order: 1 }
]
const ARTICLES = [
  { id: 'k1', name: 'Pikachu Keychain', category: 'cat-keychain', stock: 10 },
  { id: 'f1', name: 'Glurak Figure', category: 'cat-figure', stock: 3 }
]
const DEALS = [{ id: 'deal-keychain00', name: 'Keychain 2 for 7', type: 'bundle', categories: ['cat-keychain'], min_qty: 2, price: 7 }]

const NAMES = { k1: ['Pikachu Keychain', 'cat-keychain', 'Keychain'], f1: ['Glurak Figure', 'cat-figure', 'Big Figure'] }
const line = (article, quantity, lineTotal, discount = 0) => ({
  article,
  name: NAMES[article][0],
  category: NAMES[article][1],
  categoryName: NAMES[article][2],
  quantity,
  unitPrice: lineTotal / quantity,
  lineTotal,
  discount,
  deal: discount ? 'deal-keychain00' : '',
  dealName: discount ? 'Keychain 2 for 7' : ''
})
const sale = (id, date, amount, extra = {}) => ({
  id,
  collectionName: 'budget_tracker_transactions',
  description: `Sale ${id}`,
  amount,
  notes: '',
  date,
  created: `${date} 10:00:00.000Z`,
  updated: `${date} 10:00:00.000Z`,
  ...extra
})

export const REPORT_TRANSACTIONS = [
  // From before line data
  sale('tx0000000000001', '2026-09-20', 48),
  sale('tx0000000000002', '2026-10-02', 12),
  sale('tx0000000000003', '2026-10-05', -20, { description: 'Filament' }),
  // With lines; 10:30 and 11:10 in Berlin on the 14th
  sale('tx0000000000004', '2026-10-10', 30, { created: '2026-10-10 12:00:01.000Z', sold_at: '2026-10-10 12:00:00.000Z', items: [line('f1', 1, 30)] }),
  sale('tx0000000000005', '2026-10-14', 37, { created: '2026-10-14 08:30:01.000Z', sold_at: '2026-10-14 08:30:00.000Z', items: [line('k1', 2, 8, 1), line('f1', 1, 30)] }),
  sale('tx0000000000006', '2026-10-14', 4, { created: '2026-10-14 09:10:01.000Z', sold_at: '2026-10-14 09:10:00.000Z', items: [line('k1', 1, 4)] })
]

const movement = (id, article, change, reason, created) =>
  ({ id, collectionName: 'stock_movements', article, change, reason, note: '', created })

const MOVEMENTS = [
  // The older sale on 2 October
  movement('mv0000000000001', 'k1', -3, 'sale', '2026-10-02 10:00:05.000Z'),
  movement('mv0000000000002', 'f1', -1, 'sale', '2026-10-10 12:00:05.000Z'),
  movement('mv0000000000003', 'f1', 2, 'printed', '2026-10-12 09:00:00.000Z'),
  movement('mv0000000000004', 'k1', -2, 'sale', '2026-10-14 08:30:05.000Z'),
  movement('mv0000000000005', 'f1', -1, 'sale', '2026-10-14 08:30:06.000Z'),
  movement('mv0000000000006', 'k1', -1, 'sale', '2026-10-14 09:10:05.000Z')
]

const commission = (id, status, price, created, deliveredAt = '') => ({
  id,
  customer_name: 'Ash Ketchum',
  customer_email: '',
  fulfilment: 'pickup',
  address: '',
  items: [{ article: 'f1', name: 'Glurak Figure', quantity: 1 }],
  agreed_price: price,
  notes: '',
  status,
  created,
  delivered_at: deliveredAt,
  cancelled_at: '',
  anonymised_at: '',
  ready_at: ''
})

const COMMISSIONS = [
  commission('c1', 'printing', 25, '2026-10-08 10:00:00.000Z'),
  commission('c2', 'delivered', 30, '2026-10-01 10:00:00.000Z', '2026-10-11 10:00:00.000Z')
]

// Seeds the history; `before` runs after seeding (to add records or break a collection),
// then the page opens with the clock fixed at REPORT_NOW
export async function openReports (page, api, { before } = {}) {
  api.seed({ categories: CATEGORIES, articles: ARTICLES, deals: DEALS, commissions: COMMISSIONS })
  api.db.budget_tracker_transactions.push(...structuredClone(REPORT_TRANSACTIONS))
  api.db.stock_movements.push(...structuredClone(MOVEMENTS))
  if (before) before(api)
  await page.clock.setFixedTime(REPORT_NOW)
  await gotoReady(page, '/reports')
}
